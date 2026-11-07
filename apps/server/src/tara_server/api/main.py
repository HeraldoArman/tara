import asyncio
import json
import time
from collections import defaultdict, deque
from datetime import timedelta

import jwt
from fastapi import Depends, FastAPI, File, Form, Query, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.exc import StaleDataError

from tara_server.auth import (
    COOKIE_NAME,
    authenticate,
    current_user,
    require_roles,
    token_for,
    user_json,
)
from tara_server.db.models import (
    SOP,
    AuditEvent,
    Escalation,
    Evidence,
    Report,
    Run,
    SOPDocument,
    SOPVersion,
    ToolCall,
    User,
    now,
    uid,
)
from tara_server.db.session import get_session
from tara_server.domain.execution import (
    audit,
    audit_json,
    authorize_run,
    authorize_work,
    create_run,
    get_run_snapshot,
    tool_call_json,
    work_order_json,
)
from tara_server.domain.media import authorize_media, import_media
from tara_server.domain.reports import (
    authorize_report,
    evaluation,
    lookup_parts,
    report_json,
    review_report,
)
from tara_server.domain.sop_intelligence import intelligence
from tara_server.domain.sop_sessions import start_sop_session
from tara_server.domain.sops import (
    authorized_version,
    create_draft,
    decompose,
    import_source,
    publish,
    search_sop,
    validate_definition,
    version_json,
)
from tara_server.domain.work_orders import create_work_order, list_assignees
from tara_server.errors import DomainError
from tara_server.schemas import (
    AssigneeListResponse,
    DraftEdit,
    EvaluationResponse,
    Login,
    ReportListResponse,
    ReportResponse,
    Review,
    RunResponse,
    SopIntelligenceResponse,
    SOPListResponse,
    SOPVersionResponse,
    UserResponse,
    WorkOrderInput,
    WorkOrderListResponse,
    WorkOrderResponse,
    normalize_sop_definition,
)
from tara_server.settings import get_settings
from tara_server.storage import get_storage
from tara_server.telemetry import API_DURATION, API_REQUESTS

settings = get_settings()
app = FastAPI(title="TARa execution API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Content-Type"],
)
login_attempts: dict[str, deque] = defaultdict(deque)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    request.state.request_id = uid()
    if request.method in {"POST", "PATCH", "DELETE", "PUT"}:
        origin = request.headers.get("origin")
        if (origin and origin not in settings.allowed_origins) or (
            COOKIE_NAME in request.cookies and origin not in settings.allowed_origins
        ):
            return JSONResponse(
                {
                    "error": {
                        "code": "FORBIDDEN",
                        "message": "Request origin is not allowed.",
                        "requestId": request.state.request_id,
                        "details": {},
                    }
                },
                status_code=403,
            )
    started = time.monotonic()
    response = await call_next(request)
    route = getattr(request.scope.get("route"), "path", "unmatched")
    API_DURATION.labels(method=request.method, route=route).observe(time.monotonic() - started)
    API_REQUESTS.labels(method=request.method, route=route, status=str(response.status_code)).inc()
    response.headers["X-Request-ID"] = request.state.request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(DomainError)
async def domain_error(request: Request, exc: DomainError):
    return JSONResponse(
        {
            "error": {
                "code": exc.code,
                "message": exc.message,
                "requestId": getattr(request.state, "request_id", uid()),
                "details": exc.details,
            }
        },
        status_code=exc.status,
    )


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, _exc: RequestValidationError):
    return await domain_error(
        request,
        DomainError("VALIDATION_FAILED", "The request does not match the API contract.", 422),
    )


@app.exception_handler(StaleDataError)
async def stale_error(request: Request, _exc: StaleDataError):
    return await domain_error(
        request,
        DomainError("STALE_RUN", "Another action changed this run. Refresh and retry.", 409),
    )


@app.get("/health/live")
async def live():
    return {"status": "ok"}


@app.get("/health/ready")
async def ready(session: AsyncSession = Depends(get_session, scope="function")):
    try:
        await session.execute(text("SELECT 1"))
        head = await session.scalar(text("SELECT version_num FROM alembic_version"))
        from alembic.config import Config
        from alembic.script import ScriptDirectory

        config = Config()
        config.set_main_option("script_location", "alembic")
        expected_head = ScriptDirectory.from_config(config).get_current_head()
        if head != expected_head:
            raise ValueError("Migration mismatch")
        await get_storage().ready()
    except Exception:
        raise DomainError(
            "NOT_READY", "Database migration or evidence storage is not ready.", 503
        ) from None
    return {"status": "ready", "migration": head}


@app.post("/api/v1/auth/login", response_model=UserResponse)
async def login(
    body: Login,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session, scope="function"),
):
    key = request.client.host if request.client else "unknown"
    queue = login_attempts[key]
    cutoff = time.monotonic() - 60
    while queue and queue[0] < cutoff:
        queue.popleft()
    if len(queue) >= 10:
        raise DomainError("RATE_LIMITED", "Too many login attempts. Try again in a minute.", 429)
    queue.append(time.monotonic())
    user = await authenticate(session, body.username, body.password)
    response.set_cookie(
        COOKIE_NAME,
        token_for(user),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.jwt_expire_hours * 3600,
        path="/",
    )
    return user_json(user)


@app.post("/api/v1/auth/logout")
async def logout(response: Response):
    response.delete_cookie(
        COOKIE_NAME, path="/", httponly=True, secure=settings.cookie_secure, samesite="lax"
    )
    return {"ok": True}


@app.get("/api/v1/auth/me", response_model=UserResponse)
async def me(actor: User = Depends(current_user)):
    return user_json(actor)


@app.get("/api/v1/work-orders", response_model=WorkOrderListResponse)
async def work_orders(
    filter: str = "all",
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    from tara_server.db.models import WorkOrder

    require_roles(actor, "technician", "supervisor", "owner")
    if filter not in {"all", "priority", "standard"}:
        raise DomainError("VALIDATION_FAILED", "Choose a valid queue filter.", 422)
    query = select(WorkOrder).where(WorkOrder.org_id == actor.org_id)
    if actor.role == "technician":
        query = query.where(WorkOrder.assigned_to == actor.id)
    if filter != "all":
        query = query.where(WorkOrder.priority == filter)
    rows = (await session.scalars(query.order_by(WorkOrder.created_at))).all()
    result = []
    for row in rows:
        run = await session.scalar(
            select(Run)
            .where(Run.work_order_id == row.id, Run.status.in_(["active", "paused"]))
            .order_by(Run.created_at.desc())
            .limit(1)
        )
        result.append(work_order_json(row, run.id if run else None))
    return {"items": result}


@app.get("/api/v1/work-orders/assignees", response_model=AssigneeListResponse)
async def work_order_assignees(
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    return {"items": [user_json(user) for user in await list_assignees(session, actor)]}


@app.post("/api/v1/work-orders", response_model=WorkOrderResponse, status_code=201)
async def add_work_order(
    body: WorkOrderInput,
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    return work_order_json(await create_work_order(session, actor, body))


@app.get("/api/v1/work-orders/{work_id}", response_model=WorkOrderResponse)
async def work_order(
    work_id: str,
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    return work_order_json(await authorize_work(session, actor, work_id))


@app.post("/api/v1/work-orders/{work_id}/runs", response_model=RunResponse)
async def start(
    work_id: str,
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    return await create_run(session, actor, work_id)


@app.get("/api/v1/runs/{run_id}", response_model=RunResponse)
async def run_snapshot(
    run_id: str,
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    return await get_run_snapshot(session, actor, run_id)


@app.post("/api/v1/runs/{run_id}/connection")
async def connection(
    run_id: str,
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    from livekit import api

    run = await authorize_run(session, actor, run_id, mutate=True)
    if run.status not in {"active", "paused"}:
        raise DomainError("TRANSITION_REJECTED", "This run is already closed.", 409)
    if not all([settings.livekit_url, settings.livekit_api_key, settings.livekit_api_secret]):
        raise DomainError(
            "PROVIDER_UNAVAILABLE",
            "Live assistance is not configured. Your run and instruction are saved.",
            503,
        )
    room_name = f"tara-run-{run.id}"
    try:
        async with api.LiveKitAPI(
            settings.livekit_url, settings.livekit_api_key, settings.livekit_api_secret
        ) as lk:
            await asyncio.wait_for(
                lk.room.create_room(
                    api.CreateRoomRequest(name=room_name, empty_timeout=300, max_participants=2)
                ),
                8,
            )
            existing = await asyncio.wait_for(lk.agent_dispatch.list_dispatch(room_name), 8)
            if not any(
                dispatch.agent_name == settings.livekit_agent_name
                and not dispatch.state.deleted_at
                and (
                    not dispatch.state.jobs
                    or any(
                        job.state.status in {api.JobStatus.JS_PENDING, api.JobStatus.JS_RUNNING}
                        for job in dispatch.state.jobs
                    )
                )
                for dispatch in existing
            ):
                await asyncio.wait_for(
                    lk.agent_dispatch.create_dispatch(
                        api.CreateAgentDispatchRequest(
                            agent_name=settings.livekit_agent_name,
                            room=room_name,
                            metadata=json.dumps({"runId": run.id, "actorId": actor.id}),
                        )
                    ),
                    8,
                )
    except Exception:
        raise DomainError(
            "PROVIDER_UNAVAILABLE",
            "The live worker could not be dispatched. Retry the connection.",
            503,
        ) from None
    if run.interaction_mode != "silent":
        run.interaction_mode = "silent"
        run.version += 1
    audit(session, actor, run, "run.connection_authorized")
    token = (
        api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(actor.id)
        .with_name(actor.name)
        .with_ttl(timedelta(minutes=10))
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
        .to_jwt()
    )
    return {
        "url": settings.livekit_url,
        "token": token,
        "roomName": room_name,
        "participantIdentity": actor.id,
        "workerIdentity": f"tara-agent-{run.id}",
    }


@app.get("/api/v1/runs/{run_id}/activity")
async def activity(
    run_id: str,
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    await authorize_run(session, actor, run_id)
    events = (
        await session.scalars(
            select(AuditEvent)
            .where(AuditEvent.org_id == actor.org_id, AuditEvent.run_id == run_id)
            .order_by(AuditEvent.created_at, AuditEvent.id)
            .offset(offset)
            .limit(limit + 1)
        )
    ).all()
    calls = (
        await session.scalars(
            select(ToolCall)
            .where(ToolCall.run_id == run_id)
            .order_by(ToolCall.created_at, ToolCall.id)
            .offset(offset)
            .limit(limit + 1)
        )
    ).all()
    has_more = len(events) > limit or len(calls) > limit
    return {
        "items": [audit_json(event) for event in events[:limit]],
        "toolCalls": [tool_call_json(call) for call in calls[:limit]],
        "offset": offset,
        "limit": limit,
        "hasMore": has_more,
        "nextOffset": offset + limit if has_more else None,
    }


@app.get("/api/v1/evidence/{evidence_id}/url")
async def evidence_url(
    evidence_id: str,
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    evidence = await session.scalar(
        select(Evidence).where(Evidence.id == evidence_id, Evidence.org_id == actor.org_id)
    )
    if not evidence:
        raise DomainError("NOT_FOUND", "Evidence not found.", 404)
    await authorize_run(session, actor, evidence.run_id)
    url = await get_storage().signed_url(evidence.object_key)
    if not url:
        token = jwt.encode(
            {
                "sub": evidence.id,
                "actor": actor.id,
                "iss": "tara-evidence",
                "exp": now() + timedelta(seconds=120),
            },
            settings.jwt_secret,
            algorithm="HS256",
        )
        url = f"/api/v1/evidence/{evidence.id}/content?token={token}"
    return {"url": url, "expiresIn": 120}


@app.get("/api/v1/evidence/{evidence_id}/content")
async def evidence_content(
    evidence_id: str,
    token: str,
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    try:
        claims = jwt.decode(
            token, settings.jwt_secret, algorithms=["HS256"], issuer="tara-evidence"
        )
        if claims["sub"] != evidence_id or claims["actor"] != actor.id:
            raise ValueError("Scope mismatch")
    except (jwt.InvalidTokenError, ValueError, KeyError):
        raise DomainError(
            "FORBIDDEN", "The evidence link expired or is not authorized.", 403
        ) from None
    evidence = await session.get(Evidence, evidence_id)
    if not evidence:
        raise DomainError("NOT_FOUND", "Evidence not found.", 404)
    await authorize_run(session, actor, evidence.run_id)
    return Response(
        await get_storage().read_local(evidence.object_key),
        media_type=evidence.media_type,
        headers={"Cache-Control": "no-store"},
    )


@app.get("/api/v1/sops", response_model=SOPListResponse)
async def sops(
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    rows = (await session.scalars(select(SOP).where(SOP.org_id == actor.org_id))).all()
    items = []
    for sop in rows:
        query = select(SOPVersion).where(SOPVersion.sop_id == sop.id)
        if actor.role not in {"sop_manager", "owner"}:
            query = query.where(SOPVersion.status == "published")
        versions = (await session.scalars(query.order_by(SOPVersion.version_number.desc()))).all()
        if versions:
            items.append(
                {
                    "id": sop.id,
                    "key": sop.key,
                    "title": sop.title,
                    "versions": [await version_json(session, version) for version in versions],
                }
            )
    return {"items": items}


@app.get("/api/v1/sops/{sop_id}/versions/{version}", response_model=SOPVersionResponse)
async def sop_version(
    sop_id: str,
    version: str,
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    query = select(SOPVersion).where(SOPVersion.sop_id == sop_id, SOPVersion.org_id == actor.org_id)
    if actor.role not in {"owner", "sop_manager"}:
        query = query.where(SOPVersion.status == "published")
    if version.isascii() and version.isdecimal():
        # Version numbers are the stable per-SOP route; display labels can repeat.
        query = query.where(SOPVersion.version_number == int(version))
    else:
        query = query.where(SOPVersion.version == version)
    matches = (await session.scalars(query.limit(2))).all()
    if not matches:
        raise DomainError("NOT_FOUND", "SOP version not found.", 404)
    if len(matches) > 1:
        raise DomainError(
            "AMBIGUOUS_VERSION",
            "This version label is not unique. Open the SOP using its version number.",
            409,
        )
    row = matches[0]
    await authorized_version(session, actor, row.id)
    return await version_json(session, row)


@app.get("/api/v1/sop-versions/{version_id}/intelligence", response_model=SopIntelligenceResponse)
async def sop_intelligence(
    version_id: str,
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    return await intelligence(session, actor, version_id)


@app.post("/api/v1/sop-versions/{version_id}/runs", response_model=RunResponse)
async def start_selected_sop(
    version_id: str,
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    return await start_sop_session(session, actor, version_id)


@app.post("/api/v1/sops/imports", response_model=SOPVersionResponse)
async def sop_import(
    file: UploadFile = File(...),
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    require_roles(actor, "sop_manager", "owner")
    content = await file.read(settings.max_upload_bytes + 1)
    return await import_source(session, actor, file.filename or "source.txt", content)


@app.post("/api/v1/sops/imports/{document_id}/retry", response_model=SOPVersionResponse)
async def retry_import(
    document_id: str,
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    require_roles(actor, "sop_manager", "owner")
    document = await session.scalar(
        select(SOPDocument).where(SOPDocument.id == document_id, SOPDocument.org_id == actor.org_id)
    )
    if not document:
        raise DomainError("NOT_FOUND", "Source document not found.", 404)
    try:
        return await create_draft(session, actor, document, await decompose(document.sections))
    except DomainError as error:
        error.details["documentId"] = document.id
        raise


@app.patch("/api/v1/sop-versions/{version_id}", response_model=SOPVersionResponse)
async def edit_draft(
    version_id: str,
    body: DraftEdit,
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    require_roles(actor, "sop_manager", "owner")
    version = await authorized_version(session, actor, version_id)
    if version.status != "draft":
        raise DomainError("TRANSITION_REJECTED", "Published SOP versions are immutable.", 409)
    try:
        version.definition = normalize_sop_definition(body.definition)
        version.version = version.definition["version"]
    except ValidationError:
        # A manager may save an invalid draft while editing; publication rejects it.
        version.definition = body.definition
    audit(session, actor, None, "sop.draft_edited", {"sopVersionId": version.id})
    await session.flush()
    return await version_json(session, version)


@app.post("/api/v1/sop-versions/{version_id}/validate")
async def validate_draft(
    version_id: str,
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    require_roles(actor, "sop_manager", "owner")
    version = await authorized_version(session, actor, version_id)
    document = await session.get(SOPDocument, version.document_id) if version.document_id else None
    errors = validate_definition(version.definition, document.sections if document else [])
    return {"valid": not errors, "errors": errors}


@app.post("/api/v1/sop-versions/{version_id}/publish", response_model=SOPVersionResponse)
async def publish_draft(
    version_id: str,
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    return await publish(session, actor, version_id)


@app.get("/api/v1/sop-versions/{version_id}/search")
async def sop_search(
    version_id: str,
    q: str,
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    return await search_sop(session, actor, version_id, q)


@app.get("/api/v1/reports", response_model=ReportListResponse)
async def reports(
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    require_roles(actor, "technician", "supervisor", "owner")
    query = select(Report).where(Report.org_id == actor.org_id)
    if actor.role == "technician":
        query = query.join(Run).where(Run.technician_id == actor.id)
    rows = (await session.scalars(query.order_by(Report.created_at.desc()).limit(100))).all()
    return {"items": [await report_json(session, actor, report.id) for report in rows]}


@app.get("/api/v1/reports/{report_id}", response_model=ReportResponse)
async def report(
    report_id: str,
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    return await report_json(session, actor, report_id)


@app.post("/api/v1/reports/{report_id}/reviews", response_model=ReportResponse)
async def review(
    report_id: str,
    body: Review,
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    return await review_report(session, actor, report_id, body)


@app.get("/api/v1/reports/{report_id}/export")
async def export(
    report_id: str,
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    record = await authorize_report(session, actor, report_id)
    result = await report_json(session, actor, report_id)
    run = await session.get(Run, record.run_id)
    audit(session, actor, run, "report.exported", {"reportId": report_id})
    return JSONResponse(
        result,
        headers={"Content-Disposition": f'attachment; filename="tara-report-{report_id}.json"'},
    )


@app.post("/api/v1/escalations/{escalation_id}/resolve")
async def resolve_escalation(
    escalation_id: str,
    body: dict,
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    require_roles(actor, "supervisor", "owner")
    item = await session.scalar(
        select(Escalation).where(Escalation.id == escalation_id, Escalation.org_id == actor.org_id)
    )
    if not item:
        raise DomainError("NOT_FOUND", "Escalation not found.", 404)
    note = body.get("resolution", "")
    if not isinstance(note, str) or not note.strip() or len(note) > 4000:
        raise DomainError("VALIDATION_FAILED", "Provide a supervisor resolution note.", 422)
    run = await session.scalar(
        select(Run).where(Run.id == item.run_id, Run.org_id == actor.org_id).with_for_update()
    )
    if not run:
        raise DomainError("NOT_FOUND", "The escalation's run is unavailable.", 404)
    await session.refresh(item)
    if item.status != "open":
        raise DomainError("TRANSITION_REJECTED", "This escalation was already resolved.", 409)
    item.status, item.resolution, item.resolved_by = "resolved", note, actor.id
    run.version += 1
    audit(
        session,
        actor,
        run,
        "escalation.resolved",
        {"escalationId": item.id, "resolution": note},
    )
    return {"id": item.id, "status": item.status, "resolution": note, "runVersion": run.version}


@app.get("/api/v1/evaluation/summary", response_model=EvaluationResponse)
async def summary(
    sopId: str | None = None,
    technicianId: str | None = None,
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    return await evaluation(session, actor, sopId, technicianId, from_date, to_date)


@app.get("/api/v1/parts")
async def parts(
    q: str = "",
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    return await lookup_parts(session, actor, q)


@app.get("/api/v1/observability/metrics", include_in_schema=False)
async def metrics(actor: User = Depends(current_user)):
    from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

    require_roles(actor, "owner", "supervisor")
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/api/v1/sop-versions/{version_id}/media")
async def upload_sop_media(
    version_id: str,
    file: UploadFile = File(...),
    title: str = Form(...),
    heading: str = Form(...),
    page: int | None = Form(None),
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    content = await file.read(settings.max_upload_bytes + 1)
    return await import_media(
        session,
        actor,
        version_id,
        content,
        file.content_type or "application/octet-stream",
        title,
        heading,
        page,
    )


@app.get("/api/v1/sop-media/{media_id}/url")
async def sop_media_url(
    media_id: str,
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    media = await authorize_media(session, actor, media_id)
    url = await get_storage().signed_url(media.object_key)
    if not url:
        token = jwt.encode(
            {
                "sub": media.id,
                "actor": actor.id,
                "iss": "tara-sop-media",
                "exp": now() + timedelta(seconds=120),
            },
            settings.jwt_secret,
            algorithm="HS256",
        )
        url = f"/api/v1/sop-media/{media.id}/content?token={token}"
    return {"url": url, "expiresIn": 120}


@app.get("/api/v1/sop-media/{media_id}/content")
async def sop_media_content(
    media_id: str,
    token: str,
    actor: User = Depends(current_user),
    session: AsyncSession = Depends(get_session, scope="function"),
):
    try:
        claims = jwt.decode(
            token, settings.jwt_secret, algorithms=["HS256"], issuer="tara-sop-media"
        )
        if claims["sub"] != media_id or claims["actor"] != actor.id:
            raise ValueError("Scope mismatch")
    except (jwt.InvalidTokenError, ValueError, KeyError):
        raise DomainError(
            "FORBIDDEN", "The reference link expired or is not authorized.", 403
        ) from None
    media = await authorize_media(session, actor, media_id)
    return Response(
        await get_storage().read_local(media.object_key),
        media_type=media.media_type,
        headers={"Cache-Control": "no-store"},
    )
