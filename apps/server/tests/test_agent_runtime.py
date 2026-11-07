import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from tara_server.agent.worker import WorkerRuntime


@pytest.fixture
async def runtime():
    handlers = {}
    participant = SimpleNamespace(
        register_rpc_method=lambda name, handler: handlers.update({name: handler}),
        publish_data=AsyncMock(),
    )
    ctx = SimpleNamespace(
        room=SimpleNamespace(local_participant=participant, remote_participants={})
    )
    value = WorkerRuntime(ctx, "run-1", "technician-1", "technician-1")
    value.ready = True
    snapshot = {
        "id": "run-1",
        "version": 2,
        "status": "active",
        "interactionMode": "silent",
        "currentStepId": "next-step",
        "steps": [],
        "alerts": [],
    }
    value.bridge = SimpleNamespace(
        execute=AsyncMock(return_value=snapshot),
        snapshot=AsyncMock(return_value=snapshot),
        transcript=AsyncMock(),
        audit=AsyncMock(),
    )

    async def logged(_name, _arguments, call):
        return await call()

    value.bridge.logged_tool = logged
    value.session = SimpleNamespace(
        input=SimpleNamespace(set_audio_enabled=Mock()),
        output=SimpleNamespace(set_audio_enabled=Mock()),
        generate_reply=Mock(),
        interrupt=Mock(),
        clear_user_turn=Mock(),
        aclose=AsyncMock(),
    )
    value.register_rpc()
    yield value, handlers
    await value.close()


def invocation(payload, identity="technician-1"):
    return SimpleNamespace(caller_identity=identity, payload=json.dumps(payload))


@pytest.mark.asyncio
async def test_another_room_participant_cannot_control_assigned_run(runtime):
    value, handlers = runtime
    response = json.loads(await handlers["run.get_context"](invocation({}, "another-participant")))
    assert response["error"]["code"] == "FORBIDDEN"
    value.bridge.snapshot.assert_not_awaited()


@pytest.mark.asyncio
async def test_silent_text_is_rejected_before_reaching_the_model(runtime):
    value, handlers = runtime
    response = json.loads(await handlers["assistant.text"](invocation({"text": "Hello"})))
    assert response["error"]["code"] == "CONSULTATION_REQUIRED"
    value.session.generate_reply.assert_not_called()
    value.bridge.transcript.assert_not_awaited()


@pytest.mark.asyncio
async def test_successful_response_publishes_committed_snapshot_without_speech(runtime):
    value, handlers = runtime
    result = json.loads(
        await handlers["run.respond"](
            invocation(
                {
                    "expectedVersion": 1,
                    "expectedStepId": "attestation",
                    "expectedAttemptId": None,
                    "idempotencyKey": "unique-test-key",
                    "response": "confirmed",
                }
            )
        )
    )
    assert result["version"] == 2
    value.bridge.execute.assert_awaited_once()
    value.session.generate_reply.assert_not_called()
    value.session.input.set_audio_enabled.assert_called_with(False)


@pytest.mark.asyncio
async def test_deactivation_stops_audio_and_rejects_following_normal_turn(runtime):
    value, handlers = runtime
    value.policy.activate()
    await handlers["assistant.deactivate"](invocation({}))
    assert value.policy.mode == "silent"
    value.session.interrupt.assert_called_once()
    value.session.clear_user_turn.assert_called_once()
    value.session.input.set_audio_enabled.assert_called_with(False)
    response = json.loads(
        await handlers["assistant.text"](invocation({"text": "Still listening?"}))
    )
    assert response["error"]["code"] == "CONSULTATION_REQUIRED"
