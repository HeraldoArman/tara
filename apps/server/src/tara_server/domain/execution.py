import hashlib
import json
from datetime import UTC, datetime

from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from tara_server.db.models import (
    SOP,
    Alert,
    AuditEvent,
    Deviation,
    Escalation,
    Evidence,
    IdempotencyRecord,
    Report,
    Run,
    RunStep,
    SOPMedia,
    SOPVersion,
    StepAttempt,
    ToolCall,
    User,
    WorkOrder,
    now,
    uid,
)
from tara_server.db.required import required
from tara_server.errors import DomainError
from tara_server.images import image_dimensions
from tara_server.schemas import (
    Command,
    ControlCommand,
    FinishCommand,
    IssueCommand,
    ResponseCommand,
    VisualAssessment,
    normalize_sop_definition,
)
from tara_server.settings import get_settings
from tara_server.telemetry import ALERTS, ATTEMPTS, CONSULTATIONS, IDEMPOTENT_REPLAYS, instrument

SUCCESS = {"ai_verified", "attested", "complete", "skipped"}


def iso(value: datetime | None):
    return value.replace(tzinfo=value.tzinfo or UTC).isoformat() if value else None


def published_definition(version: SOPVersion) -> dict:
    try:
        return normalize_sop_definition(version.definition)
    except ValidationError:
        raise DomainError(
            "VALIDATION_FAILED",
            "This published SOP is invalid. Ask an SOP manager to publish a corrected version.",
            409,
        ) from None


def tool_call_json(call: ToolCall) -> dict:
    return {
        "id": call.id,
        "name": call.name,
        "durationMs": call.duration_ms,
        "status": call.status,
        "arguments": call.sanitized_arguments,
        "result": call.result,
        "createdAt": iso(call.created_at),
    }


def work_order_json(work: WorkOrder, run_id: str | None = None) -> dict:
    return {
        "id": work.id,
        "reference": work.reference,
        "title": work.title,
        "asset": {"model": work.model, "serial": work.serial},
        "issue": work.issue,
        "priority": work.priority,
        "status": work.status,
        "assignedTo": work.assigned_to,
        "sopVersionId": work.sop_version_id,
        "estimatedMinutes": work.estimated_minutes,
        "runId": run_id,
    }


async def authorize_work(session: AsyncSession, actor: User, work_id: str) -> WorkOrder:
    work = await session.scalar(
        select(WorkOrder).where(WorkOrder.id == work_id, WorkOrder.org_id == actor.org_id)
    )
    if not work:
        raise DomainError("NOT_FOUND", "Work order not found.", 404)
    if actor.role == "sop_manager" or (actor.role == "technician" and work.assigned_to != actor.id):
        raise DomainError("FORBIDDEN", "This work order is not assigned to you.", 403)
    return work


async def authorize_run(session: AsyncSession, actor: User, run_id: str, mutate=False) -> Run:
    run = await session.scalar(
        select(Run).where(Run.id == run_id, Run.org_id == actor.org_id).with_for_update()
        if mutate
        else select(Run).where(Run.id == run_id, Run.org_id == actor.org_id)
    )
    if not run:
        raise DomainError("NOT_FOUND", "Run not found.", 404)
    if actor.role == "sop_manager" or (
        actor.role == "technician" and run.technician_id != actor.id
    ):
        raise DomainError("FORBIDDEN", "This run is not assigned to you.", 403)
    if mutate and (actor.role not in {"technician", "owner"} or run.technician_id != actor.id):
        raise DomainError("FORBIDDEN", "Only the assigned technician can execute this run.", 403)
    return run


def audit(
    session: AsyncSession,
    actor: User,
    run: Run | None,
    event_type: str,
    payload: dict | None = None,
) -> AuditEvent:
    event = AuditEvent(
        id=uid(),
        org_id=actor.org_id,
        run_id=run.id if run else None,
        event_type=event_type,
        actor_id=actor.id,
        actor_role=actor.role,
        payload={
            "workOrderId": run.work_order_id if run else None,
            "sopVersionId": run.sop_version_id if run else None,
            "stepId": run.current_step_id if run else None,
            **(payload or {}),
        },
    )
    session.add(event)
    return event


async def alert(
    session: AsyncSession,
    actor: User,
    run: Run,
    event_type: str,
    message: str,
    attempt_id: str | None = None,
):
    event = audit(session, actor, run, event_type, {"message": message, "attemptId": attempt_id})
    fingerprint = hashlib.sha256(
        f"{run.current_step_id}:{attempt_id}:{message}".encode()
    ).hexdigest()
    previous = await session.scalar(
        select(Alert).where(Alert.run_id == run.id, Alert.fingerprint == fingerprint)
    )
    if not previous:
        ALERTS.labels(event_type=event_type).inc()
        session.add(
            Alert(
                run_id=run.id,
                event_id=event.id,
                step_id=run.current_step_id,
                attempt_id=attempt_id,
                message=message,
                fingerprint=fingerprint,
            )
        )
    await session.flush()


async def get_run_snapshot(session: AsyncSession, actor: User, run_id: str) -> dict:
    run = await authorize_run(session, actor, run_id)
    work = await required(session, WorkOrder, run.work_order_id)
    version = await required(session, SOPVersion, run.sop_version_id)
    sop = await required(session, SOP, version.sop_id)
    steps = (
        await session.scalars(
            select(RunStep).where(RunStep.run_id == run.id).order_by(RunStep.display_order)
        )
    ).all()
    definition = published_definition(version)
    definitions = {step["id"]: step for step in definition["steps"]}
    attempts = (
        await session.scalars(
            select(StepAttempt).where(StepAttempt.run_id == run.id).order_by(StepAttempt.created_at)
        )
    ).all()
    evidence = (await session.scalars(select(Evidence).where(Evidence.run_id == run.id))).all()
    alerts = (
        await session.scalars(
            select(Alert).where(Alert.run_id == run.id).order_by(Alert.created_at)
        )
    ).all()
    deviations = (await session.scalars(select(Deviation).where(Deviation.run_id == run.id))).all()
    escalations = (
        await session.scalars(select(Escalation).where(Escalation.run_id == run.id))
    ).all()
    media = (
        await session.scalars(
            select(SOPMedia).where(
                SOPMedia.version_id == version.id, SOPMedia.org_id == actor.org_id
            )
        )
    ).all()
    current = next((step for step in steps if step.step_id == run.current_step_id), None)
    current_attempts = [a for a in attempts if current and a.run_step_id == current.id]
    elapsed = run.active_seconds
    if run.status == "active" and run.resumed_at:
        elapsed += max(0, int((now() - run.resumed_at.replace(tzinfo=UTC)).total_seconds()))
    report_id = None
    if run.status not in {"active", "paused"}:
        report_id = await session.scalar(
            select(Report.id)
            .where(Report.run_id == run.id, Report.org_id == actor.org_id)
            .order_by(Report.revision.desc())
            .limit(1)
        )
    return {
        "id": run.id,
        "reportId": report_id,
        "workOrderId": work.id,
        "version": run.version,
        "status": run.status,
        "interactionMode": run.interaction_mode,
        "currentStepId": run.current_step_id,
        "currentAttemptId": current_attempts[-1].id if current_attempts else None,
        "workOrder": work_order_json(work, run.id),
        "sop": {
            "id": sop.id,
            "key": sop.key,
            "title": sop.title,
            "version": definition["version"],
            "scope": definition["scope"],
            "prerequisites": definition["prerequisites"],
        },
        "steps": [
            {
                **definitions[step.step_id],
                "status": step.status,
                "attempts": [
                    {
                        "id": a.id,
                        "number": a.number,
                        "kind": a.kind,
                        "outcome": a.outcome,
                        "result": a.result,
                        "createdAt": iso(a.created_at),
                    }
                    for a in attempts
                    if a.run_step_id == step.id
                ],
            }
            for step in steps
        ],
        "evidence": [
            {
                "id": e.id,
                "stepId": e.step_id,
                "attemptId": e.attempt_id,
                "accepted": e.accepted,
                "sha256": e.sha256,
                "mediaType": e.media_type,
                "source": e.source,
                "model": e.model,
                "width": e.width,
                "height": e.height,
                "assessmentId": e.assessment_id,
                "correlationId": e.correlation_id,
                "capturedAt": iso(e.captured_at),
                "urlEndpoint": f"/api/v1/evidence/{e.id}/url",
            }
            for e in evidence
        ],
        "alerts": [
            {
                "id": a.id,
                "eventId": a.event_id,
                "stepId": a.step_id,
                "attemptId": a.attempt_id,
                "message": a.message,
                "status": a.status,
                "createdAt": iso(a.created_at),
            }
            for a in alerts
        ],
        "deviations": [
            {
                "id": d.id,
                "stepId": d.step_id,
                "kind": d.kind,
                "description": d.description,
                "status": d.status,
                "resolution": d.resolution,
            }
            for d in deviations
        ],
        "escalations": [
            {
                "id": e.id,
                "stepId": e.step_id,
                "reason": e.reason,
                "status": e.status,
                "resolution": e.resolution,
            }
            for e in escalations
        ],
        "media": [
            {
                "id": m.id,
                "title": m.title,
                "heading": m.heading,
                "page": m.page,
                "width": m.width,
                "height": m.height,
                "mediaType": m.media_type,
                "urlEndpoint": f"/api/v1/sop-media/{m.id}/url",
            }
            for m in media
        ],
        "startedAt": iso(run.created_at),
        "elapsedSeconds": elapsed,
    }


@instrument("create_run")
async def create_run(session: AsyncSession, actor: User, work_id: str) -> dict:
    work = await authorize_work(session, actor, work_id)
    if work.assigned_to != actor.id:
        raise DomainError("FORBIDDEN", "Only the assigned technician may start a run.", 403)
    # Lock the work order before checking the partial-unique active-run constraint.
    await session.execute(select(WorkOrder).where(WorkOrder.id == work.id).with_for_update())
    existing = await session.scalar(
        select(Run).where(Run.work_order_id == work.id, Run.status.in_(["active", "paused"]))
    )
    if existing:
        return await get_run_snapshot(session, actor, existing.id)
    version = await session.get(SOPVersion, work.sop_version_id)
    if not version or version.org_id != actor.org_id or version.status != "published":
        raise DomainError("VALIDATION_FAILED", "This work order requires a published SOP.", 409)
    definition = published_definition(version)
    run = Run(
        id=uid(),
        org_id=actor.org_id,
        work_order_id=work.id,
        technician_id=actor.id,
        sop_version_id=version.id,
        current_step_id=definition["steps"][0]["id"],
    )
    session.add(run)
    await session.flush()
    for i, step_definition in enumerate(definition["steps"]):
        session.add(
            RunStep(
                run_id=run.id,
                step_id=step_definition["id"],
                display_order=i,
                status="current" if i == 0 else "locked",
            )
        )
    work.status = "in_progress"
    audit(session, actor, run, "run.created")
    await session.flush()
    return await get_run_snapshot(session, actor, run.id)


def command_hash(command: Command, operation: str) -> str:
    return hashlib.sha256(
        json.dumps(
            {"operation": operation, **command.model_dump(mode="json")}, sort_keys=True
        ).encode()
    ).hexdigest()


async def prepare(
    session: AsyncSession,
    actor: User,
    run_id: str,
    command: Command,
    operation: str,
    allow_paused=False,
):
    run = await authorize_run(session, actor, run_id, mutate=True)
    existing = await session.scalar(
        select(IdempotencyRecord).where(
            IdempotencyRecord.run_id == run.id, IdempotencyRecord.key == command.idempotency_key
        )
    )
    if existing:
        if existing.command_hash != command_hash(command, operation):
            raise DomainError(
                "DUPLICATE_REQUEST", "This request key was used for another action.", 409
            )
        IDEMPOTENT_REPLAYS.inc()
        return run, existing.response
    if run.version != command.expected_version:
        raise DomainError("STALE_RUN", "The run changed. Refresh and retry.", 409)
    if run.current_step_id != command.expected_step_id:
        raise DomainError(
            "STALE_STEP", "The current step changed. Review the new instruction.", 409
        )
    if run.status != "active" and not (allow_paused and run.status == "paused"):
        raise DomainError("TRANSITION_REJECTED", "This run is not active.", 409)
    step = await session.scalar(
        select(RunStep).where(RunStep.run_id == run.id, RunStep.step_id == run.current_step_id)
    )
    latest = (
        await session.scalar(
            select(StepAttempt)
            .where(StepAttempt.run_step_id == step.id)
            .order_by(StepAttempt.number.desc())
            .limit(1)
        )
        if step
        else None
    )
    if (latest.id if latest else None) != command.expected_attempt_id:
        raise DomainError(
            "STALE_ATTEMPT", "The step has a newer attempt. Refresh before retrying.", 409
        )
    return run, None


async def remember(
    session: AsyncSession,
    actor: User,
    run: Run,
    command: Command,
    operation: str,
    extras: dict | None = None,
):
    run.version += 1
    await session.flush()
    response = {**await get_run_snapshot(session, actor, run.id), **(extras or {})}
    session.add(
        IdempotencyRecord(
            run_id=run.id,
            key=command.idempotency_key,
            command_hash=command_hash(command, operation),
            response=response,
        )
    )
    await session.flush()
    return response


async def current_step(session: AsyncSession, run: Run):
    step = await session.scalar(
        select(RunStep).where(RunStep.run_id == run.id, RunStep.step_id == run.current_step_id)
    )
    if not step:
        raise DomainError("TRANSITION_REJECTED", "All steps are finished. Close the run.", 409)
    version = await required(session, SOPVersion, run.sop_version_id)
    definition = next(
        item for item in published_definition(version)["steps"] if item["id"] == step.step_id
    )
    return step, definition


async def add_attempt(
    session: AsyncSession,
    actor: User,
    run: Run,
    step: RunStep,
    kind: str,
    outcome: str,
    result: dict,
):
    count = await session.scalar(
        select(func.count()).select_from(StepAttempt).where(StepAttempt.run_step_id == step.id)
    )
    ATTEMPTS.labels(kind=kind, outcome=outcome).inc()
    attempt = StepAttempt(
        id=uid(),
        run_id=run.id,
        run_step_id=step.id,
        number=(count or 0) + 1,
        kind=kind,
        outcome=outcome,
        result=result,
        actor_id=actor.id,
    )
    session.add(attempt)
    await session.flush()
    audit(
        session,
        actor,
        run,
        "attempt.recorded",
        {"attemptId": attempt.id, "kind": kind, "outcome": outcome},
    )
    return attempt


async def advance(session: AsyncSession, actor: User, run: Run, step: RunStep, status: str):
    step.status = status
    step.completed_at = now()
    next_step = await session.scalar(
        select(RunStep)
        .where(RunStep.run_id == run.id, RunStep.display_order > step.display_order)
        .order_by(RunStep.display_order)
        .limit(1)
    )
    issues = (
        await session.scalars(
            select(Deviation).where(
                Deviation.run_id == run.id,
                Deviation.step_id == step.step_id,
                Deviation.status == "open",
            )
        )
    ).all()
    for issue in issues:
        issue.status = "resolved"
        issue.resolution = "Resolved by a later successful attempt."
    # Escalations require supervisor resolution even when retest passes.
    run.current_step_id = next_step.step_id if next_step else None
    if next_step:
        next_step.status = "current"
    audit(
        session, actor, run, "step.completed", {"completedStepId": step.step_id, "status": status}
    )


async def failed(
    session: AsyncSession,
    actor: User,
    run: Run,
    step: RunStep,
    definition: dict,
    attempt: StepAttempt,
    message: str,
):
    action = definition.get("onFail", {}).get("action", "retry")
    if action in {"hold", "escalate"}:
        step.status = "held"
    session.add(
        Deviation(
            org_id=actor.org_id,
            run_id=run.id,
            step_id=step.step_id,
            attempt_id=attempt.id,
            kind=definition.get("onFail", {}).get("deviation") or "criterion-failed",
            description=message,
        )
    )
    if action == "escalate":
        session.add(
            Escalation(
                org_id=actor.org_id,
                run_id=run.id,
                step_id=step.step_id,
                reason=message,
                created_by=actor.id,
            )
        )
    await alert(session, actor, run, "step.failed", message, attempt.id)


@instrument("respond")
async def respond(session: AsyncSession, actor: User, run_id: str, command: ResponseCommand):
    run, duplicate = await prepare(session, actor, run_id, command, "respond")
    if duplicate:
        return duplicate
    step, definition = await current_step(session, run)
    verification = definition["verification"]
    kind = verification["kind"]
    if kind == "visual":
        raise DomainError("EVIDENCE_MISSING", "A fresh camera assessment is required.", 409)
    if step.status == "held":
        raise DomainError(
            "TRANSITION_REJECTED", "Open a retest before submitting another response.", 409
        )
    if kind == "choice" and command.response not in verification["options"]:
        raise DomainError("VALIDATION_FAILED", "Choose one of the published responses.", 422)
    passed = (
        command.response in verification.get("passOptions", [])
        if kind == "choice"
        else (command.response == verification.get("acceptedResponse", "confirmed"))
    )
    outcome = "attested" if passed and kind == "attestation" else "passed" if passed else "failed"
    attempt = await add_attempt(
        session, actor, run, step, kind, outcome, {"response": command.response}
    )
    if passed:
        await advance(
            session, actor, run, step, "attested" if kind == "attestation" else "complete"
        )
    else:
        await failed(
            session,
            actor,
            run,
            step,
            definition,
            attempt,
            "The response does not meet this step's acceptance rule. Follow the SOP recovery and retest.",
        )
    return await remember(session, actor, run, command, "respond")


@instrument("submit_visual_check")
async def submit_visual_check(
    session: AsyncSession,
    actor: User,
    run_id: str,
    command: Command,
    assessment: VisualAssessment,
    frame: bytes,
    media_type: str,
    captured_at: datetime,
    storage=None,
):
    from tara_server.storage import get_storage

    run, duplicate = await prepare(session, actor, run_id, command, "visual")
    if duplicate:
        return duplicate
    step, definition = await current_step(session, run)
    if definition["verification"]["kind"] != "visual" or step.status == "held":
        raise DomainError("TRANSITION_REJECTED", "A visual check is not allowed at this step.", 409)
    required = {criterion["id"] for criterion in definition["verification"]["criteria"]}
    observed = [criterion.id for criterion in assessment.criteria]
    if set(observed) != required or len(observed) != len(required):
        raise DomainError(
            "VALIDATION_FAILED", "The assessment must cover every exact criterion.", 422
        )
    if not frame or media_type not in {"image/jpeg", "image/png"}:
        raise DomainError("EVIDENCE_MISSING", "A supported fresh camera frame is required.", 409)
    width, height = image_dimensions(frame, media_type)
    age = (now() - captured_at.replace(tzinfo=UTC)).total_seconds()
    if age < -2 or age > 10:
        raise DomainError(
            "EVIDENCE_MISSING", "The camera frame is stale. Capture a fresh frame.", 409
        )
    # Persist identical assessed bytes before committing any pass.
    store = storage or get_storage()
    key, digest = await store.put(frame, media_type)
    passed = all(result.verdict == "pass" for result in assessment.criteria)
    outcome = (
        "passed"
        if passed
        else "unclear"
        if any(r.verdict == "unclear" for r in assessment.criteria)
        else "rejected"
    )
    attempt = await add_attempt(
        session,
        actor,
        run,
        step,
        "visual",
        outcome,
        assessment.model_dump(mode="json", by_alias=True),
    )
    session.add(
        Evidence(
            org_id=actor.org_id,
            run_id=run.id,
            step_id=step.step_id,
            attempt_id=attempt.id,
            object_key=key,
            sha256=digest,
            media_type=media_type,
            size_bytes=len(frame),
            accepted=passed,
            model=assessment.model,
            captured_at=captured_at,
            source=get_settings().evidence_source,
            width=width,
            height=height,
            assessment_id=assessment.assessment_id,
            correlation_id=command.idempotency_key,
        )
    )
    if passed:
        await advance(session, actor, run, step, "ai_verified")
    else:
        failures = "; ".join(r.reason for r in assessment.criteria if r.verdict != "pass")
        await failed(
            session,
            actor,
            run,
            step,
            definition,
            attempt,
            f"{failures} Correct the visible criteria and retry this step.",
        )
    return await remember(session, actor, run, command, "visual")


@instrument("control")
async def control(session: AsyncSession, actor: User, run_id: str, command: ControlCommand):
    run, duplicate = await prepare(session, actor, run_id, command, "control", allow_paused=True)
    if duplicate:
        return duplicate
    if command.action == "pause":
        if run.status != "active":
            raise DomainError("TRANSITION_REJECTED", "This run is already paused.", 409)
        run.active_seconds += max(
            0, int((now() - run.resumed_at.replace(tzinfo=UTC)).total_seconds())
        )
        run.resumed_at = None
        run.status = "paused"
        run.interaction_mode = "silent"
    elif command.action == "resume":
        if run.status != "paused":
            raise DomainError("TRANSITION_REJECTED", "This run is already active.", 409)
        run.status = "active"
        run.resumed_at = now()
        run.interaction_mode = "silent"
    elif command.action in {"retry", "retest"}:
        if run.status != "active":
            raise DomainError("TRANSITION_REJECTED", "Resume the run before retrying.", 409)
        step, _definition = await current_step(session, run)
        step.status = "current"
    audit(session, actor, run, f"run.{command.action}", {"reason": command.reason})
    return await remember(session, actor, run, command, "control")


@instrument("record_issue")
async def record_issue(session: AsyncSession, actor: User, run_id: str, command: IssueCommand):
    run, duplicate = await prepare(session, actor, run_id, command, "issue")
    if duplicate:
        return duplicate
    session.add(
        Deviation(
            org_id=actor.org_id,
            run_id=run.id,
            step_id=run.current_step_id,
            kind=command.kind,
            description=command.note,
        )
    )
    if command.escalate:
        session.add(
            Escalation(
                org_id=actor.org_id,
                run_id=run.id,
                step_id=run.current_step_id,
                reason=command.note,
                created_by=actor.id,
            )
        )
    await alert(
        session,
        actor,
        run,
        "escalation.opened" if command.escalate else "deviation.created",
        "An issue was recorded. Keep the step open and follow the approved recovery or supervisor guidance.",
    )
    return await remember(session, actor, run, command, "issue")


async def set_consultation(session: AsyncSession, actor: User, run_id: str, active: bool):
    run = await authorize_run(session, actor, run_id, mutate=True)
    if run.status != "active" and active:
        raise DomainError("TRANSITION_REJECTED", "Resume the run before asking TARa.", 409)
    if active:
        CONSULTATIONS.inc()
    mode = "consultation" if active else "silent"
    if run.interaction_mode != mode:
        run.interaction_mode = mode
        run.version += 1
    audit(session, actor, run, "consultation.activated" if active else "consultation.deactivated")
    await session.flush()
    return await get_run_snapshot(session, actor, run.id)


@instrument("finish")
async def finish(session: AsyncSession, actor: User, run_id: str, command: FinishCommand):
    run, duplicate = await prepare(session, actor, run_id, command, "finish", allow_paused=True)
    if duplicate:
        return duplicate
    steps = (await session.scalars(select(RunStep).where(RunStep.run_id == run.id))).all()
    unresolved = await session.scalar(
        select(func.count())
        .select_from(Escalation)
        .where(Escalation.run_id == run.id, Escalation.status == "open")
    )
    unresolved_deviations = await session.scalar(
        select(func.count())
        .select_from(Deviation)
        .where(Deviation.run_id == run.id, Deviation.status == "open")
    )
    if command.outcome == "complete" and (
        any(s.status not in SUCCESS for s in steps) or unresolved or unresolved_deviations
    ):
        raise DomainError(
            "TRANSITION_REJECTED",
            "Required steps, deviations or escalations remain unresolved.",
            409,
        )
    version = await required(session, SOPVersion, run.sop_version_id)
    if command.outcome == "partial" and (
        not command.reason.strip() or not version.definition.get("allowPartialClose", True)
    ):
        raise DomainError("VALIDATION_FAILED", "Partial close needs an allowed reason.", 422)
    if run.status == "active" and run.resumed_at:
        run.active_seconds += max(
            0, int((now() - run.resumed_at.replace(tzinfo=UTC)).total_seconds())
        )
    run.resumed_at = None
    run.status = command.outcome
    run.interaction_mode = "silent"
    run.ended_at = now()
    work = await required(session, WorkOrder, run.work_order_id)
    work.status = command.outcome
    audit(session, actor, run, "run.closed", {"outcome": command.outcome, "reason": command.reason})
    from tara_server.domain.camera_pairings import revoke_pairing

    await revoke_pairing(session, actor, run.id)
    await session.flush()
    snapshot = await get_run_snapshot(session, actor, run.id)
    events = (
        await session.scalars(
            select(AuditEvent).where(AuditEvent.run_id == run.id).order_by(AuditEvent.created_at)
        )
    ).all()
    calls = (
        await session.scalars(
            select(ToolCall)
            .where(ToolCall.run_id == run.id)
            .order_by(ToolCall.created_at, ToolCall.id)
        )
    ).all()
    snapshot.update(
        {
            "outcome": command.outcome,
            "reason": command.reason,
            "auditEvents": [audit_json(e) for e in events],
            "toolCalls": [tool_call_json(call) for call in calls],
            "toolHistoryScope": (
                "Calls recorded before this report snapshot; the in-flight close call is excluded."
            ),
        }
    )
    previous = await session.scalar(
        select(func.max(Report.revision)).where(Report.run_id == run.id)
    )
    digest = hashlib.sha256(json.dumps(snapshot, sort_keys=True).encode()).hexdigest()
    report = Report(
        id=uid(),
        org_id=actor.org_id,
        run_id=run.id,
        revision=(previous or 0) + 1,
        outcome=command.outcome,
        snapshot=snapshot,
        digest=digest,
    )
    session.add(report)
    audit(session, actor, run, "report.generated", {"reportId": report.id, "digest": digest})
    return await remember(session, actor, run, command, "finish", {"reportId": report.id})


def audit_json(event: AuditEvent):
    return {
        "id": event.id,
        "type": event.event_type,
        "actorId": event.actor_id,
        "actorRole": event.actor_role,
        "payload": event.payload,
        "correlationId": event.correlation_id,
        "createdAt": iso(event.created_at),
    }


@instrument("fail_visual_attempt")
async def fail_visual_attempt(
    session: AsyncSession,
    actor: User,
    run_id: str,
    command: Command,
    error_code: str,
    error_message: str,
    frame: bytes | None = None,
    captured_at: datetime | None = None,
    model: str = "",
):
    from tara_server.storage import get_storage

    run, duplicate = await prepare(session, actor, run_id, command, "visual")
    if duplicate:
        return duplicate
    step, definition = await current_step(session, run)
    if definition["verification"]["kind"] != "visual":
        raise DomainError(
            "TRANSITION_REJECTED", "This step does not permit a visual assessment.", 409
        )
    attempt = await add_attempt(
        session,
        actor,
        run,
        step,
        "visual",
        "error",
        {"errorCode": error_code, "message": error_message},
    )
    if frame and captured_at:
        try:
            width, height = image_dimensions(frame, "image/jpeg")
            key, digest = await get_storage().put(frame, "image/jpeg")
            session.add(
                Evidence(
                    org_id=actor.org_id,
                    run_id=run.id,
                    step_id=step.step_id,
                    attempt_id=attempt.id,
                    object_key=key,
                    sha256=digest,
                    media_type="image/jpeg",
                    size_bytes=len(frame),
                    accepted=False,
                    model=model,
                    captured_at=captured_at,
                    source=get_settings().evidence_source,
                    width=width,
                    height=height,
                    correlation_id=command.idempotency_key,
                )
            )
        except DomainError:
            # Record the failure even when the evidence provider itself is unavailable.
            pass
    await alert(
        session,
        actor,
        run,
        "evidence.check_failed",
        f"{error_message} The step remains open. Retry the check or request supervisor help.",
        attempt.id,
    )
    return await remember(session, actor, run, command, "visual")
