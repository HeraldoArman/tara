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
