import asyncio
import io
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from PIL import Image

from tara_server.agent.bridge import DomainBridge
from tara_server.agent.worker import WorkerRuntime
from tara_server.domain import execution
from tara_server.errors import DomainError
from tara_server.schemas import Command, ResponseCommand, VisualAssessment


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
        preflight_visual=AsyncMock(return_value=None),
        agent_output=AsyncMock(),
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


def visual_command():
    return {
        "expectedVersion": 1,
        "expectedStepId": "inspect-switch",
        "expectedAttemptId": None,
        "idempotencyKey": "committed-visual-request",
    }


@pytest.mark.asyncio
async def test_committed_visual_replay_returns_before_stale_guard_or_provider(runtime):
    value, _ = runtime
    saved = {"id": "run-1", "version": 2, "steps": [], "alerts": []}
    value.bridge.preflight_visual.return_value = saved
    value.capture = AsyncMock()
    value.verifier.assess = AsyncMock()
    result = await value.visual(visual_command())
    assert result is saved
    value.bridge.snapshot.assert_not_awaited()
    value.capture.assert_not_awaited()
    value.verifier.assess.assert_not_awaited()
    value.bridge.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_visual_replay_with_changed_payload_never_calls_provider(runtime):
    value, _ = runtime
    value.bridge.preflight_visual.side_effect = DomainError(
        "DUPLICATE_REQUEST", "This request key was used for another action.", 409
    )
    value.capture = AsyncMock()
    value.verifier.assess = AsyncMock()
    with pytest.raises(DomainError, match="another action"):
        await value.visual({**visual_command(), "expectedStepId": "another-step"})
    value.capture.assert_not_awaited()
    value.verifier.assess.assert_not_awaited()


class PendingSpeech:
    def __init__(self):
        self.future = asyncio.get_running_loop().create_future()
        self.interrupted = False

    def __await__(self):
        return self.future.__await__()

    def done(self):
        return self.future.done()

    def exception(self):
        return None

    def interrupt(self, *, force=False):
        self.interrupted = True
        if not self.future.done():
            self.future.set_result(None)


def alert_snapshot(number=1, *, mode="silent"):
    alert = {
        "id": f"alert-{number}",
        "eventId": f"event-{number}",
        "attemptId": f"attempt-{number}",
        "stepId": "inspect-switch",
        "status": "pending",
        "message": f"Correction for attempt {number}",
    }
    return {
        "id": "run-1",
        "version": number + 1,
        "status": "active",
        "interactionMode": mode,
        "currentStepId": "inspect-switch",
        "currentAttemptId": f"attempt-{number}",
        "steps": [],
        "alerts": [alert],
    }


@pytest.mark.asyncio
async def test_new_attempt_replaces_previous_audio_and_passing_step_stops_it(runtime):
    value, _ = runtime
    first, second = PendingSpeech(), PendingSpeech()
    value.session.generate_reply.side_effect = [first, second]
    await value.apply(alert_snapshot(1))
    await asyncio.sleep(0)
    assert value.active_alert["id"] == "alert-1"
    await value.apply(alert_snapshot(2))
    await asyncio.sleep(0)
    assert first.interrupted
    assert value.active_alert["id"] == "alert-2"
    assert value.alert_output
    await value.apply({**alert_snapshot(3), "currentStepId": "next-step", "alerts": []})
    assert second.interrupted
    assert value.active_alert is None
    assert not value.alert_output
    superseded = [
        call for call in value.bridge.agent_output.await_args_list if call.args[2] == "superseded"
    ]
    assert {call.args[3] for call in superseded} == {"alert-1", "alert-2"}


@pytest.mark.asyncio
async def test_stale_pending_attempt_never_queues_a_correction(runtime):
    value, _ = runtime
    snapshot = alert_snapshot(2)
    snapshot["alerts"] = alert_snapshot(1)["alerts"] + snapshot["alerts"]
    value.session.generate_reply.return_value = PendingSpeech()
    await value.apply(snapshot)
    await asyncio.sleep(0)
    assert value.active_alert["id"] == "alert-2"
    value.session.generate_reply.assert_called_once()
    assert any(
        call.args[2:4] == ("superseded", "alert-1")
        for call in value.bridge.agent_output.await_args_list
    )


@pytest.mark.asyncio
async def test_accessible_failure_still_corrects_during_consultation(runtime):
    value, _ = runtime
    value.policy.activate()
    value.session.generate_reply.return_value = PendingSpeech()
    await value.apply(alert_snapshot(mode="consultation"))
    await asyncio.sleep(0)
    value.session.generate_reply.assert_called_once()
    assert value.policy.mode == "consultation"
    assert value.alert_output


@pytest.mark.asyncio
async def test_model_tool_failure_uses_its_own_reply_without_second_correction(runtime):
    value, _ = runtime
    value.policy.activate()
    await value.apply(alert_snapshot(mode="consultation"), from_model_tool=True)
    await asyncio.sleep(0)
    value.session.generate_reply.assert_not_called()
    assert value.active_alert is None
    value.bridge.agent_output.assert_awaited_once_with(
        "Correction for attempt 1",
        "alert",
        "superseded",
        "alert-1",
        metadata={"reason": "model-tool-response"},
    )


@pytest.mark.asyncio
async def test_explicit_activation_interrupts_pending_alert_audio(runtime):
    value, _ = runtime
    speech = PendingSpeech()
    value.session.generate_reply.return_value = speech
    await value.apply(alert_snapshot())
    await asyncio.sleep(0)
    value.bridge.execute.return_value = {
        **alert_snapshot(),
        "interactionMode": "consultation",
        "alerts": [],
    }
    await value.dispatch("assistant.activate", {})
    assert speech.interrupted
    assert value.active_alert is None
    assert value.policy.mode == "consultation"


@pytest.mark.asyncio
async def test_bridge_visual_preflight_reuses_authorized_hashed_database_replay(workshop):
    session, users, work = workshop
    actor = users["technician"]
    snapshot = await execution.create_run(session, actor, work.id)
    for _ in snapshot["steps"]:
        step = next(item for item in snapshot["steps"] if item["id"] == snapshot["currentStepId"])
        if step["verification"]["kind"] == "visual":
            break
        snapshot = await execution.respond(
            session,
            actor,
            snapshot["id"],
            ResponseCommand.model_validate(
                {
                    "expectedVersion": snapshot["version"],
                    "expectedStepId": snapshot["currentStepId"],
                    "expectedAttemptId": None,
                    "idempotencyKey": f"prepare-visual-{step['id']}",
                    "response": step["verification"].get("acceptedResponse", "confirmed"),
                }
            ),
        )
    command = Command.model_validate(
        {
            "expectedVersion": snapshot["version"],
            "expectedStepId": snapshot["currentStepId"],
            "expectedAttemptId": None,
            "idempotencyKey": "database-visual-replay",
        }
    )
    image = io.BytesIO()
    Image.new("RGB", (96, 96), color="white").save(image, format="JPEG")
    assessment = VisualAssessment.model_validate(
        {
            "criteria": [
                {"id": item["id"], "verdict": "pass", "reason": "Visible in test media"}
                for item in step["verification"]["criteria"]
            ],
            "model": "test-verifier",
            "assessmentId": "test-provider-assessment",
        }
    )
    saved = await execution.submit_visual_check(
        session,
        actor,
        snapshot["id"],
        command,
        assessment,
        image.getvalue(),
        "image/jpeg",
        execution.now(),
    )
    bridge = DomainBridge(snapshot["id"], actor.id)

    async def transact(callback):
        return await callback(session, actor)

    bridge.transact = transact
    assert await bridge.preflight_visual(command) == saved
    with pytest.raises(DomainError) as mismatch:
        await bridge.preflight_visual(command.model_copy(update={"expected_step_id": "wrong-step"}))
    assert mismatch.value.code == "DUPLICATE_REQUEST"

    async def forbidden_transact(callback):
        return await callback(session, users["supervisor"])

    bridge.transact = forbidden_transact
    with pytest.raises(DomainError) as forbidden:
        await bridge.preflight_visual(command)
    assert forbidden.value.code == "FORBIDDEN"
