import copy
from datetime import UTC, datetime, timedelta

import httpx
import jwt
import pytest

from tara_server.api.main import app, login_attempts
from tara_server.auth import COOKIE_NAME, token_for
from tara_server.db.session import get_session
from tara_server.settings import get_settings


@pytest.fixture
async def api_client(workshop, monkeypatch):
    session, users, work = workshop
    for key in ("livekit_url", "livekit_api_key", "livekit_api_secret"):
        monkeypatch.setattr(get_settings(), key, "")

    async def override_session():
        yield session

    app.dependency_overrides[get_session] = override_session
    login_attempts.clear()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client, session, users, work
    app.dependency_overrides.clear()


async def draft_for_work(session, users, work):
    from tara_server.db.models import SOPVersion, uid

    published = await session.get(SOPVersion, work.sop_version_id)
    draft = SOPVersion(
        id=uid(),
        org_id=published.org_id,
        sop_id=published.sop_id,
        document_id=published.document_id,
        version_number=2,
        version="1.4.1",
        status="draft",
        definition=copy.deepcopy(published.definition),
        created_by=users["sop_manager"].id,
    )
    session.add(draft)
    await session.flush()
    return draft


async def test_edit_publish_and_start_normalize_optional_defaults_and_aliases(api_client):
    client, session, users, work = api_client
    draft = await draft_for_work(session, users, work)
    definition = copy.deepcopy(draft.definition)
    definition["version"] = "2.0.0"
    first = definition["steps"][0]
    del first["rationale"]
    first["on_pass"] = first.pop("onPass")
    client.cookies.set(COOKIE_NAME, token_for(users["sop_manager"]))
    origin = {"Origin": get_settings().app_origin}
    edited = await client.patch(
        f"/api/v1/sop-versions/{draft.id}", json={"definition": definition}, headers=origin
    )
    assert edited.status_code == 200
    assert edited.json()["validationErrors"] == []
    assert edited.json()["version"] == draft.version == "2.0.0"
    normalized = edited.json()["definition"]["steps"][0]
    assert normalized["rationale"] == ""
    assert normalized["onPass"] == {"action": "next", "alert": None, "deviation": None}
    assert "on_pass" not in normalized
    published = await client.post(f"/api/v1/sop-versions/{draft.id}/publish", headers=origin)
    assert published.status_code == 200
    assert published.json()["version"] == "2.0.0"
    assert draft.definition["steps"][0]["rationale"] == ""
    work.sop_version_id = draft.id
    await session.flush()
    client.cookies.set(COOKIE_NAME, token_for(users["technician"]))
    started = await client.post(f"/api/v1/work-orders/{work.id}/runs", headers=origin)
    assert started.status_code == 200
    assert started.json()["steps"][0]["rationale"] == ""
    assert started.json()["sop"]["prerequisites"] == definition["prerequisites"]
    assert started.json()["sop"]["scope"] == definition["scope"]
    assert started.json()["sop"]["version"] == "2.0.0"


async def test_sop_routes_use_unique_version_number_and_reject_ambiguous_labels(api_client):
    from tara_server.db.models import SOPVersion

    client, session, users, work = api_client
    original = await session.get(SOPVersion, work.sop_version_id)
    original_version = original.version
    original_definition = copy.deepcopy(original.definition)
    draft = await draft_for_work(session, users, work)
    # Multiple imports can legitimately generate the same display label.
    draft.version = original_version
    await session.flush()
    client.cookies.set(COOKIE_NAME, token_for(users["sop_manager"]))
    ambiguous = await client.get(f"/api/v1/sops/{draft.sop_id}/versions/{original_version}")
    assert ambiguous.status_code == 409
    assert ambiguous.json()["error"]["code"] == "AMBIGUOUS_VERSION"
    exact = await client.get(f"/api/v1/sops/{draft.sop_id}/versions/{draft.version_number}")
    assert exact.status_code == 200
    assert exact.json()["id"] == draft.id
    original_route = await client.get(
        f"/api/v1/sops/{original.sop_id}/versions/{original.version_number}"
    )
    assert original_route.json()["id"] == original.id
    # An unpublished duplicate must not make the technician's published label ambiguous.
    client.cookies.set(COOKIE_NAME, token_for(users["technician"]))
    visible = await client.get(f"/api/v1/sops/{draft.sop_id}/versions/{original_version}")
    assert visible.status_code == 200
    assert visible.json()["id"] == original.id
    hidden = await client.get(f"/api/v1/sops/{draft.sop_id}/versions/{draft.version_number}")
    assert hidden.status_code == 404
    assert original.version == original_version
    assert original.definition == original_definition


async def test_publish_syncs_legacy_draft_label_without_rewriting_published_version(api_client):
    from tara_server.db.models import SOPVersion

    client, session, users, work = api_client
    original = await session.get(SOPVersion, work.sop_version_id)
    previous_label = original.version
    previous_definition = copy.deepcopy(original.definition)
    draft = await draft_for_work(session, users, work)
    definition = copy.deepcopy(draft.definition)
    definition["version"] = "3.0.0"
    draft.definition = definition
    await session.flush()
    client.cookies.set(COOKIE_NAME, token_for(users["sop_manager"]))
    result = await client.post(
        f"/api/v1/sop-versions/{draft.id}/publish", headers={"Origin": get_settings().app_origin}
    )
    assert result.status_code == 200
    assert result.json()["version"] == draft.version == "3.0.0"
    assert original.version == previous_label
    assert original.definition == previous_definition


async def test_numeric_display_label_cannot_shadow_a_different_version_number(api_client):
    from tara_server.db.models import SOPVersion

    client, session, users, work = api_client
    original = await session.get(SOPVersion, work.sop_version_id)
    original.version = "2"
    definition = copy.deepcopy(original.definition)
    definition["version"] = "2"
    original.definition = definition
    draft = await draft_for_work(session, users, work)
    client.cookies.set(COOKIE_NAME, token_for(users["sop_manager"]))
    selected = await client.get(f"/api/v1/sops/{draft.sop_id}/versions/2")
    assert selected.status_code == 200
    assert selected.json()["id"] == draft.id
    assert selected.json()["versionNumber"] == 2


async def test_historical_published_missing_defaults_renders_without_rewriting_version(api_client):
    from tara_server.db.models import SOPVersion

    client, session, users, work = api_client
    version = await session.get(SOPVersion, work.sop_version_id)
    historical = copy.deepcopy(version.definition)
    del historical["steps"][0]["rationale"]
    version.definition = historical
    version.version = "legacy-storage-label"
    await session.flush()
    client.cookies.set(COOKIE_NAME, token_for(users["technician"]))
    started = await client.post(
        f"/api/v1/work-orders/{work.id}/runs", headers={"Origin": get_settings().app_origin}
    )
    assert started.status_code == 200
    snapshot = await client.get(f"/api/v1/runs/{started.json()['id']}")
    assert snapshot.status_code == 200
    assert snapshot.json()["steps"][0]["rationale"] == ""
    assert snapshot.json()["sop"]["version"] == historical["version"]
    assert version.definition == historical
    assert version.version == "legacy-storage-label"
    assert "rationale" not in version.definition["steps"][0]


@pytest.mark.parametrize("accepted_response", ["", " \t "])
async def test_unfinishable_attestation_is_rejected_before_publication(
    api_client, accepted_response
):
    client, session, users, work = api_client
    draft = await draft_for_work(session, users, work)
    definition = copy.deepcopy(draft.definition)
    definition["steps"][0]["verification"]["acceptedResponse"] = accepted_response
    client.cookies.set(COOKIE_NAME, token_for(users["sop_manager"]))
    origin = {"Origin": get_settings().app_origin}
    edited = await client.patch(
        f"/api/v1/sop-versions/{draft.id}", json={"definition": definition}, headers=origin
    )
    assert edited.status_code == 200
    assert edited.json()["validationErrors"]
    published = await client.post(f"/api/v1/sop-versions/{draft.id}/publish", headers=origin)
    assert published.status_code == 422
    assert published.json()["error"]["code"] == "VALIDATION_FAILED"
    assert draft.status == "draft"


@pytest.mark.parametrize("passing_option", ["", " \t ", "x" * 1001])
async def test_unfinishable_choice_is_rejected_before_publication(api_client, passing_option):
    client, session, users, work = api_client
    draft = await draft_for_work(session, users, work)
    definition = copy.deepcopy(draft.definition)
    definition["steps"][0]["verification"] = {
        "kind": "choice",
        "options": [passing_option, "fail"],
        "passOptions": [passing_option],
    }
    client.cookies.set(COOKIE_NAME, token_for(users["sop_manager"]))
    origin = {"Origin": get_settings().app_origin}
    edited = await client.patch(
        f"/api/v1/sop-versions/{draft.id}", json={"definition": definition}, headers=origin
    )
    assert edited.status_code == 200
    assert edited.json()["validationErrors"]
    published = await client.post(f"/api/v1/sop-versions/{draft.id}/publish", headers=origin)
    assert published.status_code == 422
    assert draft.status == "draft"


async def test_import_retry_errors_keep_original_document_id(api_client, monkeypatch):
    from tara_server.api import main
    from tara_server.domain import sops
    from tara_server.errors import DomainError

    client, _session, users, _work = api_client

    async def unavailable(_sections):
        raise DomainError("PROVIDER_UNAVAILABLE", "The import provider is unavailable.", 503)

    monkeypatch.setattr(sops, "decompose", unavailable)
    monkeypatch.setattr(main, "decompose", unavailable)
    client.cookies.set(COOKIE_NAME, token_for(users["sop_manager"]))
    origin = {"Origin": get_settings().app_origin}
    imported = await client.post(
        "/api/v1/sops/imports",
        files={"file": ("reviewed-source.md", b"# Inspection\nInspect the disconnected device.")},
        headers=origin,
    )
    assert imported.status_code == 503
    document_id = imported.json()["error"]["details"]["documentId"]
    for _ in range(2):
        retried = await client.post(f"/api/v1/sops/imports/{document_id}/retry", headers=origin)
        assert retried.status_code == 503
        assert retried.json()["error"]["details"]["documentId"] == document_id


async def test_activity_paginates_audit_and_tool_history_with_run_authorization(api_client):
    from tara_server.db.models import AuditEvent, ToolCall, User, uid
    from tara_server.domain.execution import create_run

    client, session, users, work = api_client
    run = await create_run(session, users["technician"], work.id)
    for index in range(4):
        session.add(
            AuditEvent(
                org_id=users["technician"].org_id,
                run_id=run["id"],
                event_type=f"test.activity.{index}",
                actor_id=users["technician"].id,
                actor_role="technician",
                payload={},
            )
        )
    for index in range(3):
        session.add(
            ToolCall(
                run_id=run["id"],
                name="search_sop",
                duration_ms=index + 1,
                status="completed",
                sanitized_arguments={},
                result={"status": "completed"},
            )
        )
    await session.flush()
    client.cookies.set(COOKIE_NAME, token_for(users["technician"]))
    audit_ids, tool_ids = [], []
    offset = 0
    while True:
        response = await client.get(f"/api/v1/runs/{run['id']}/activity?offset={offset}&limit=2")
        assert response.status_code == 200
        page = response.json()
        assert len(page["items"]) <= 2 and len(page["toolCalls"]) <= 2
        audit_ids.extend(item["id"] for item in page["items"])
        tool_ids.extend(item["id"] for item in page["toolCalls"])
        if not page["hasMore"]:
            assert page["nextOffset"] is None
            break
        assert page["nextOffset"] == offset + 2
        offset = page["nextOffset"]
    assert len(audit_ids) == len(set(audit_ids)) == 5
    assert len(tool_ids) == len(set(tool_ids)) == 3
    other = User(
        id=uid(),
        org_id=users["technician"].org_id,
        username="different-tech",
        name="Different technician",
        role="technician",
        active=True,
        password_hash="unused",
    )
    session.add(other)
    await session.flush()
    client.cookies.set(COOKIE_NAME, token_for(other))
    forbidden = await client.get(f"/api/v1/runs/{run['id']}/activity")
    assert forbidden.status_code == 403


async def test_anonymous_auth_and_generic_login_failure(api_client):
    client, _session, _users, _work = api_client
    response = await client.get("/api/v1/work-orders")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"
    assert "requestId" in response.json()["error"]
    response = await client.post(
        "/api/v1/auth/login", json={"username": "nonexistent", "password": "wrong"}
    )
    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Invalid username or password."


async def test_cookie_auth_same_origin_queue_and_provider_unavailable(api_client):
    client, _session, _users, work = api_client
    logged_in = await client.post(
        "/api/v1/auth/login", json={"username": "technician", "password": "test-password-2026"}
    )
    assert logged_in.status_code == 200
    assert "HttpOnly" in logged_in.headers["set-cookie"]
    assert "SameSite=lax" in logged_in.headers["set-cookie"]
    assert logged_in.json()["role"] == "technician"
    assert "password_hash" not in logged_in.text
    queue = await client.get("/api/v1/work-orders?filter=priority")
    assert queue.status_code == 200
    assert len(queue.json()["items"]) == 1
    bad_origin = await client.post(
        f"/api/v1/work-orders/{work.id}/runs", headers={"Origin": "https://untrusted.example"}
    )
    assert bad_origin.status_code == 403
    origin = {"Origin": get_settings().app_origin}
    started = await client.post(f"/api/v1/work-orders/{work.id}/runs", headers=origin)
    assert started.status_code == 200
    run = started.json()
    assert run["interactionMode"] == "silent"
    assert run["steps"][0]["verification"]["kind"] == "attestation"
    connection = await client.post(f"/api/v1/runs/{run['id']}/connection", headers=origin)
    assert connection.status_code == 503, connection.text
    assert connection.json()["error"]["code"] == "PROVIDER_UNAVAILABLE"
    snapshot = await client.get(f"/api/v1/runs/{run['id']}")
    assert snapshot.json()["currentStepId"] == run["currentStepId"]
    assert snapshot.headers["cache-control"] == "no-store"


async def test_wrong_role_published_edit_rejected_and_invalid_jwt(api_client):
    client, _session, users, work = api_client
    client.cookies.set(COOKIE_NAME, token_for(users["technician"]))
    origin = {"Origin": get_settings().app_origin}
    forbidden = await client.patch(
        f"/api/v1/sop-versions/{work.sop_version_id}", json={"definition": {}}, headers=origin
    )
    assert forbidden.status_code == 403
    client.cookies.set(COOKIE_NAME, token_for(users["sop_manager"]))
    immutable = await client.patch(
        f"/api/v1/sop-versions/{work.sop_version_id}", json={"definition": {}}, headers=origin
    )
    assert immutable.status_code == 409
    assert immutable.json()["error"]["code"] == "TRANSITION_REJECTED"
    client.cookies.set(COOKIE_NAME, "tampered.invalid.token")
    invalid = await client.get("/api/v1/auth/me")
    assert invalid.status_code == 401


async def test_expired_token_and_disabled_user_rejected(api_client):
    client, _session, users, _work = api_client
    user = users["technician"]
    settings = get_settings()
    token = jwt.encode(
        {
            "sub": user.id,
            "org": user.org_id,
            "role": user.role,
            "iss": settings.jwt_issuer,
            "iat": datetime.now(UTC) - timedelta(hours=9),
            "exp": datetime.now(UTC) - timedelta(minutes=1),
        },
        settings.jwt_secret,
        algorithm="HS256",
    )
    client.cookies.set(COOKIE_NAME, token)
    assert (await client.get("/api/v1/auth/me")).status_code == 401
    token = token_for(user)
    user.active = False
    client.cookies.set(COOKIE_NAME, token)
    assert (await client.get("/api/v1/auth/me")).status_code == 401


async def test_livekit_dispatch_precedes_room_scoped_token_and_failure_returns_no_token(
    api_client, monkeypatch
):
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    from livekit import api

    client, _session, users, work = api_client
    settings = get_settings()
    monkeypatch.setattr(settings, "livekit_url", "wss://livekit.example")
    monkeypatch.setattr(settings, "livekit_api_key", "unit-test-api-key")
    monkeypatch.setattr(
        settings, "livekit_api_secret", "unit-test-secret-at-least-thirty-two-characters"
    )
    client.cookies.set(COOKIE_NAME, token_for(users["technician"]))
    origin = {"Origin": settings.app_origin}
    started = await client.post(f"/api/v1/work-orders/{work.id}/runs", headers=origin)
    run_id = started.json()["id"]
    dispatch = AsyncMock(return_value=SimpleNamespace(id="dispatch-test"))
    fake = SimpleNamespace(
        room=SimpleNamespace(create_room=AsyncMock()),
        agent_dispatch=SimpleNamespace(
            list_dispatch=AsyncMock(return_value=[]), create_dispatch=dispatch
        ),
    )

    class Client:
        async def __aenter__(self):
            return fake

        async def __aexit__(self, *_args):
            return False

    monkeypatch.setattr(api, "LiveKitAPI", lambda *_args, **_kwargs: Client())
    response = await client.post(f"/api/v1/runs/{run_id}/connection", headers=origin)
    assert response.status_code == 200, response.text
    dispatch.assert_awaited_once()
    claims = jwt.decode(response.json()["token"], settings.livekit_api_secret, algorithms=["HS256"])
    assert claims["sub"] == users["technician"].id
    assert claims["video"]["room"] == f"tara-run-{run_id}"
    assert claims["video"]["roomJoin"] is True
    assert response.json()["workerIdentity"] == f"tara-agent-{run_id}"
    dispatch.side_effect = RuntimeError(
        "Provider failure with sensitive details that must not leak"
    )
    failed = await client.post(f"/api/v1/runs/{run_id}/connection", headers=origin)
    assert failed.status_code == 503
    assert "token" not in failed.json()
    assert "sensitive" not in failed.text


async def test_failed_transaction_cannot_send_success_response(api_client):
    from sqlalchemy import func, select

    from tara_server.db.models import Run
    from tara_server.errors import DomainError

    client, session, users, work = api_client
    client.cookies.set(COOKIE_NAME, token_for(users["technician"]))

    async def fail_commit():
        try:
            yield session
            raise DomainError("COMMIT_FAILED", "The transaction could not commit.", 503)
        finally:
            await session.rollback()

    app.dependency_overrides[get_session] = fail_commit
    response = await client.post(
        f"/api/v1/work-orders/{work.id}/runs", headers={"Origin": get_settings().app_origin}
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "COMMIT_FAILED"
    assert await session.scalar(select(func.count()).select_from(Run)) == 0


async def test_supervisor_resolution_bumps_run_version_and_stale_actions_fail(api_client):
    import uuid

    from tara_server.domain import execution
    from tara_server.errors import DomainError
    from tara_server.schemas import ControlCommand, IssueCommand

    client, session, users, work = api_client
    snapshot = await execution.create_run(session, users["technician"], work.id)
    snapshot = await execution.record_issue(
        session,
        users["technician"],
        snapshot["id"],
        IssueCommand(
            expectedVersion=snapshot["version"],
            expectedStepId=snapshot["currentStepId"],
            idempotencyKey=str(uuid.uuid4()),
            note="Supervisor inspection required.",
            escalate=True,
        ),
    )
    escalation_id = snapshot["escalations"][0]["id"]
    client.cookies.set(COOKIE_NAME, token_for(users["supervisor"]))
    response = await client.post(
        f"/api/v1/escalations/{escalation_id}/resolve",
        headers={"Origin": get_settings().app_origin},
        json={"resolution": "Proceed with the published inspection."},
    )
    assert response.status_code == 200
    assert response.json()["runVersion"] == snapshot["version"] + 1
    with pytest.raises(DomainError) as error:
        await execution.control(
            session,
            users["technician"],
            snapshot["id"],
            ControlCommand(
                expectedVersion=snapshot["version"],
                expectedStepId=snapshot["currentStepId"],
                idempotencyKey=str(uuid.uuid4()),
                action="pause",
            ),
        )
    assert error.value.code == "STALE_RUN"


@pytest.fixture
async def multi_origin_client(api_client, monkeypatch):
    from fastapi.middleware.cors import CORSMiddleware

    settings = get_settings()
    monkeypatch.setattr(settings, "app_origin", "https://tara.heraldoarman.com")
    monkeypatch.setattr(
        settings, "additional_app_origins", "https://web-production-4f08e.up.railway.app"
    )
    cors = next(item for item in app.user_middleware if item.cls is CORSMiddleware)
    monkeypatch.setitem(cors.kwargs, "allow_origins", settings.allowed_origins)
    # A production process constructs its CORS middleware after loading these settings.
    app.middleware_stack = None
    yield api_client
    app.middleware_stack = None


@pytest.mark.parametrize(
    "origin", ["https://tara.heraldoarman.com", "https://web-production-4f08e.up.railway.app"]
)
async def test_trusted_domains_support_cookie_login_session_mutation_and_logout(
    multi_origin_client, origin
):
    client, _session, _users, work = multi_origin_client
    headers = {"Origin": origin}
    logged_in = await client.post(
        "/api/v1/auth/login",
        headers=headers,
        json={"username": "technician", "password": "test-password-2026"},
    )
    assert logged_in.status_code == 200
    assert logged_in.headers["access-control-allow-origin"] == origin
    assert logged_in.headers["access-control-allow-credentials"] == "true"
    assert "HttpOnly" in logged_in.headers["set-cookie"]
    assert (await client.get("/api/v1/auth/me", headers=headers)).json()["role"] == "technician"
    started = await client.post(f"/api/v1/work-orders/{work.id}/runs", headers=headers)
    assert started.status_code == 200
    assert started.headers["access-control-allow-origin"] == origin
    assert started.json()["interactionMode"] == "silent"
    logged_out = await client.post("/api/v1/auth/logout", headers=headers)
    assert logged_out.status_code == 200
    assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 401


async def test_unknown_origins_and_missing_origin_cannot_mutate_cookie_session(multi_origin_client):
    client, _session, users, work = multi_origin_client
    client.cookies.set(COOKIE_NAME, token_for(users["technician"]))
    for origin in [
        "https://tara.heraldoarman.com.evil.example",
        "https://unknown.example",
        "http://tara.heraldoarman.com",
        "https://tara.heraldoarman.com:444",
        "null",
    ]:
        denied = await client.post(
            f"/api/v1/work-orders/{work.id}/runs", headers={"Origin": origin}
        )
        assert denied.status_code == 403
        assert denied.json()["error"]["code"] == "FORBIDDEN"
        assert "access-control-allow-origin" not in denied.headers
    missing = await client.post("/api/v1/auth/logout")
    assert missing.status_code == 403
    assert (await client.get("/api/v1/auth/me")).status_code == 200


async def test_cors_preflight_allows_only_the_exact_configured_domains(multi_origin_client):
    client, _session, _users, _work = multi_origin_client
    for origin in get_settings().allowed_origins:
        response = await client.options(
            "/api/v1/auth/login",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin
        assert response.headers["access-control-allow-credentials"] == "true"
    denied = await client.options(
        "/api/v1/auth/login",
        headers={"Origin": "https://unknown.example", "Access-Control-Request-Method": "POST"},
    )
    assert denied.status_code == 400
    assert "access-control-allow-origin" not in denied.headers
