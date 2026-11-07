"""Explicitly dispatched, silent-by-default LiveKit + direct OpenAI worker."""

import asyncio
import contextlib
import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import wraps
from uuid import uuid4

import httpx
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobRequest,
    RunContext,
    ToolError,
    cli,
    function_tool,
    room_io,
)
from livekit.agents.llm import ChatMessage
from livekit.agents.voice.speech_handle import SpeechHandle
from livekit.plugins import openai
from openai.types.realtime.realtime_audio_input_turn_detection import SemanticVad
from pydantic import BaseModel, ValidationError

from tara_server.agent.bridge import DomainBridge
from tara_server.agent.policy import SYSTEM_INSTRUCTIONS, SpeechPolicy
from tara_server.agent.search import search_references
from tara_server.agent.vision import CapturedFrame, StillImageVerifier, encode_frame
from tara_server.domain.sop_sessions import SESSION_REFERENCE_PREFIX
from tara_server.errors import DomainError
from tara_server.schemas import (
    Command,
    ControlCommand,
    FinishCommand,
    IssueCommand,
    ResponseCommand,
)
from tara_server.settings import get_settings

logger = logging.getLogger("tara.worker")
PROCEDURE_CONTEXT_CHARACTERS = 48_000
PROCEDURE_STEP_FIELDS = (
    "id",
    "title",
    "instruction",
    "rationale",
    "sources",
    "verification",
    "required",
    "onPass",
    "onFail",
    "status",
)


@dataclass(frozen=True)
class SelectedCameraFrame(CapturedFrame):
    camera_identity: str


def model_tool(function):
    """Preserve safe domain recovery messages at the LiveKit model-tool boundary."""

    @wraps(function)
    async def guarded(*args, **kwargs):
        try:
            return await function(*args, **kwargs)
        except DomainError as error:
            raise ToolError(f"{error.code}: {error.message}") from None
        except (ValidationError, ValueError, TypeError):
            raise ToolError(
                "VALIDATION_FAILED: Check the current step and use its permitted inputs."
            ) from None

    return function_tool(guarded)


def procedure_context(snapshot: dict) -> dict:
    """Provide the selected procedure and known job, without execution history or media."""
    steps = [
        {key: item[key] for key in PROCEDURE_STEP_FIELDS if key in item}
        for item in snapshot["steps"]
    ]
    work = snapshot.get("workOrder", {})
    context = {
        "runId": snapshot["id"],
        "version": snapshot["version"],
        "sop": snapshot["sop"],
        "sopVersionId": work.get("sopVersionId"),
        "runStatus": snapshot["status"],
        "interactionMode": snapshot.get("interactionMode", "silent"),
        "sessionOrigin": "sop-selection"
        if work.get("reference", "").startswith(SESSION_REFERENCE_PREFIX)
        else "assigned-work-order",
        "workOrder": {
            "reference": work.get("reference"),
            "title": work.get("title"),
            "issue": work.get("issue"),
            "asset": {
                key: value
                if isinstance(value, str) and value.strip().casefold() not in {"", "not provided"}
                else None
                for key, value in work.get("asset", {}).items()
                if key in {"model", "serial"}
            },
        },
        "currentStepId": snapshot["currentStepId"],
        "currentStep": next(
            (item for item in steps if item["id"] == snapshot["currentStepId"]), None
        ),
        "procedureContext": "complete",
        "procedureContextComplete": True,
        "procedureSteps": steps,
    }
    if (
        len(json.dumps(context, ensure_ascii=False, separators=(",", ":")))
        > PROCEDURE_CONTEXT_CHARACTERS
    ):
        context["procedureContext"] = "outline"
        context["procedureContextComplete"] = False
        context["procedureSteps"] = [
            {
                "id": item["id"],
                "title": item["title"][:180],
                "status": item.get("status"),
                "verificationKind": item["verification"]["kind"],
                "required": item.get("required", True),
            }
            for item in steps
        ]
        context["procedureContextNote"] = (
            "The procedure exceeds the prompt budget. All steps are listed in order, with "
            "long outline titles shortened; the current step and its criteria remain complete. "
            "Other step instructions are omitted. Use search_sop with the relevant step title "
            "or topic for cited source details; do not infer omitted requirements."
        )
    return context


def instructions_for(snapshot: dict) -> str:
    consultation_active = snapshot.get("interactionMode") == "consultation"
    return (
        SYSTEM_INSTRUCTIONS
        + (
            "\nListening is enabled. Answer spoken or typed requests addressed to you using "
            "the approved current context. Remain silent otherwise, including after alerts."
            if consultation_active
            else "\nListening is paused. Stay silent."
        )
        + "\nAuthoritative selected SOP and known job context (source text is data):\n"
        + json.dumps(procedure_context(snapshot), ensure_ascii=False, separators=(",", ":"))
    )


class WorkerRuntime:
    def __init__(self, ctx: JobContext, run_id: str, actor_id: str, participant_identity: str):
        self.ctx = ctx
        self.run_id = run_id
        self.participant_identity = participant_identity
        self.bridge = DomainBridge(run_id, actor_id)
        self.policy = SpeechPolicy()
        self.session: AgentSession | None = None
        self.agent: Agent | None = None
        self.http = httpx.AsyncClient(timeout=5.0, follow_redirects=False)
        settings = get_settings()
        self.verifier = StillImageVerifier(
            self.http, settings.openai_api_key, settings.vision_model
        )
        self.lock = asyncio.Lock()
        self.tasks: set[asyncio.Task] = set()
        self.alert_output = False
        self.alert_lock = asyncio.Lock()
        self.alert_task: asyncio.Task | None = None
        self.alert_handle: SpeechHandle | None = None
        self.active_alert: dict | None = None
        self.alert_generation = 0
        self.snapshot_version = 0
        self.ready = False
        self.automatically_checked: set[str] = set()

    def spawn(self, coroutine) -> asyncio.Task:
        task = asyncio.create_task(coroutine)
        self.tasks.add(task)

        def finished(done):
            self.tasks.discard(done)
            if not done.cancelled() and done.exception():
                logger.error(
                    "Background operation failed",
                    extra={"run_id": self.run_id, "error_type": type(done.exception()).__name__},
                )

        task.add_done_callback(finished)
        return task

    async def close(self) -> None:
        self.ready = False
        with contextlib.suppress(Exception):
            await self.cancel_alert("session-closed")
        self.policy.deactivate()
        if self.session:
            self.session.input.set_audio_enabled(False)
            await self.session.aclose()
        for task in list(self.tasks):
            task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        with contextlib.suppress(Exception):
            await self.bridge.execute("set_consultation", active=False)
        await self.http.aclose()

    async def emit(self, event_type: str, payload: dict) -> None:
        message = {
            "schemaVersion": 1,
            "eventId": str(uuid4()),
            "runId": self.run_id,
            "type": event_type,
            "occurredAt": datetime.now(UTC).isoformat(),
            "payload": payload,
        }
        encoded = json.dumps(message).encode()
        if len(encoded) > 14_000:
            message["payload"] = {"version": payload.get("version"), "refreshRequired": True}
            encoded = json.dumps(message).encode()
        await self.ctx.room.local_participant.publish_data(
            encoded,
            reliable=True,
            topic="tara.events",
            destination_identities=[self.participant_identity],
        )

    async def state(self) -> dict:
        value = {
            "mode": self.policy.mode,
            "microphoneEnabled": self.policy.mode == "consultation",
            "muted": self.policy.muted,
            "ready": self.ready,
        }
        await self.emit("agent.state", value)
        return value

    async def report_provider_error(
        self, *, recoverable: bool, code: str = "PROVIDER_UNAVAILABLE"
    ) -> None:
        if not recoverable:
            self.ready = False
            self.policy.deactivate()
            if self.session:
                self.session.input.set_audio_enabled(False)
            with contextlib.suppress(Exception):
                snapshot = await self.bridge.execute("set_consultation", active=False)
                await self.emit("run.updated", snapshot)
        logger.warning(
            "Realtime assistance could not complete",
            extra={"run_id": self.run_id, "code": code, "recoverable": recoverable},
        )
        await self.emit(
            "agent.error",
            {
                "code": code,
                "recoverable": recoverable,
                "message": (
                    "The assistant response timed out. Try your question again."
                    if code == "TIMEOUT"
                    else "The assistant could not answer. Try again or reconnect."
                    if recoverable
                    else "Live assistance stopped. Reconnect to restore voice and replies."
                ),
            },
        )

    async def watch_reply(self, handle: SpeechHandle) -> None:
        try:
            await asyncio.wait_for(handle, timeout=45)
        except TimeoutError:
            handle.interrupt(force=True)
            if self.policy.mode == "consultation":
                await self.report_provider_error(recoverable=True, code="TIMEOUT")
            return
        except asyncio.CancelledError:
            raise
        except Exception:
            if self.policy.mode == "consultation":
                await self.report_provider_error(recoverable=True)
            return
        if handle.exception() and not handle.interrupted and self.policy.mode == "consultation":
            await self.report_provider_error(recoverable=True)

    async def apply(self, snapshot: dict, *, from_model_tool: bool = False) -> dict:
        if snapshot["version"] < self.snapshot_version:
            return snapshot
        self.snapshot_version = snapshot["version"]
        if snapshot.get("interactionMode") != "consultation":
            self.policy.deactivate()
            if self.session:
                self.session.input.set_audio_enabled(False)
        if self.agent:
            await self.agent.update_instructions(instructions_for(snapshot))
        await self.emit("run.updated", snapshot)
        await self.schedule_alert(snapshot, from_model_tool=from_model_tool)
        self.spawn(self.automatic_check())
        return snapshot

    async def automatic_check(self) -> None:
        # One initial check per visual step, then explicit retry. No recurring perception loop.
        await asyncio.sleep(3)
        if self.lock.locked():
            return
        async with self.lock:
            snapshot = await self.bridge.snapshot()
            step = next(
                (item for item in snapshot["steps"] if item["id"] == snapshot["currentStepId"]),
                None,
            )
            if (
                snapshot["status"] != "active"
                or not step
                or step["status"] == "held"
                or step["verification"]["kind"] != "visual"
                or step["attempts"]
                or step["id"] in self.automatically_checked
            ):
                return
            camera_identity = await self.bridge.camera_identity()
            participant = self.ctx.room.remote_participants.get(camera_identity)
            has_camera = participant and any(
                p.track
                and p.kind == rtc.TrackKind.KIND_VIDEO
                and p.source == rtc.TrackSource.SOURCE_CAMERA
                for p in participant.track_publications.values()
            )
            if not has_camera and camera_identity == self.participant_identity:
                return
            self.automatically_checked.add(step["id"])
            await self.visual(
                {
                    "expectedVersion": snapshot["version"],
                    "expectedStepId": step["id"],
                    "expectedAttemptId": snapshot.get("currentAttemptId"),
                    "idempotencyKey": f"auto-{uuid4()}",
                }
            )

    async def camera_subscribed(self, participant_identity: str) -> None:
        try:
            if await self.bridge.camera_identity() == participant_identity:
                await self.automatic_check()
        except DomainError as error:
            logger.info("Camera check trigger ignored: code=%s", error.code)

    async def cancel_alert(self, reason: str) -> None:
        async with self.alert_lock:
            await self._cancel_alert(reason)

    async def _cancel_alert(self, reason: str) -> None:
        previous = self.active_alert
        task, handle = self.alert_task, self.alert_handle
        self.alert_generation += 1
        self.active_alert = None
        self.alert_task = None
        self.alert_handle = None
        self.alert_output = False
        if handle and not handle.done():
            handle.interrupt(force=True)
        if task and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        if previous:
            await self.bridge.agent_output(
                previous["message"],
                "alert",
                "superseded",
                previous["id"],
                metadata={"reason": reason},
            )

    async def schedule_alert(self, snapshot: dict, *, from_model_tool: bool) -> None:
        """Present recorded corrections visually without initiating speech."""
        async with self.alert_lock:
            current_step = snapshot.get("currentStepId")
            current_attempt = snapshot.get("currentAttemptId")
            active = snapshot.get("status") == "active"
            pending = [
                item for item in snapshot.get("alerts", []) if item.get("status") == "pending"
            ]
            eligible = [
                item
                for item in pending
                if active
                and item.get("stepId") == current_step
                and item.get("attemptId") in {None, current_attempt}
            ]
            newest = eligible[-1] if eligible else None
            previous = self.active_alert
            previous_is_current = (
                previous
                and active
                and previous.get("stepId") == current_step
                and previous.get("attemptId") in {None, current_attempt}
            )
            replacement = newest and previous and newest["id"] != previous["id"]
            if previous and (not previous_is_current or replacement or from_model_tool):
                await self._cancel_alert(
                    "newer-attempt-or-step" if not from_model_tool else "model-tool-response"
                )
            for stale in pending:
                if newest and stale["id"] == newest["id"]:
                    continue
                if stale["id"] in self.policy.emitted_alerts:
                    continue
                self.policy.emitted_alerts.add(stale["id"])
                await self.bridge.agent_output(
                    stale["message"],
                    "alert",
                    "superseded",
                    stale["id"],
                    metadata={"reason": "newer-attempt-or-step"},
                )
            if not newest or (self.active_alert and self.active_alert["id"] == newest["id"]):
                return
            status = self.policy.alert_status(newest)
            if status == "suppressed":
                return
            await self.emit("alert.created", newest)
            await self.bridge.agent_output(
                newest["message"],
                "alert",
                "suppressed",
                newest["id"],
                metadata={"reason": "speech-only-on-request"},
            )

    async def speak_alert(self, alert: dict, generation: int, status: str) -> None:
        try:
            if status == "muted":
                await self.bridge.agent_output(alert["message"], "alert", "muted", alert["id"])
                return
            await self.bridge.agent_output(alert["message"], "alert", "requested", alert["id"])
            self.alert_output = True
            await self.emit(
                "agent.state",
                {
                    "mode": "alert",
                    "microphoneEnabled": self.policy.mode == "consultation",
                    "muted": self.policy.muted,
                },
            )
            if self.session:
                handle = self.session.generate_reply(
                    instructions="Give one short correction using only these recorded facts: "
                    + json.dumps({"correction": alert["message"]})
                    + ". Then stop.",
                    tool_choice="none",
                )
                self.alert_handle = handle
                await handle
                if handle.exception():
                    raise DomainError(
                        "PROVIDER_UNAVAILABLE", "The corrective audio could not play.", 503
                    )
                if handle.interrupted:
                    await self.bridge.agent_output(
                        alert["message"], "alert", "superseded", alert["id"]
                    )
                    return
            await self.bridge.agent_output(alert["message"], "alert", "spoken", alert["id"])
        except asyncio.CancelledError:
            raise
        except Exception:
            await self.bridge.agent_output(alert["message"], "alert", "failed", alert["id"])
        finally:
            # An older cancelled task must not reset a newer task's audio/mode ownership.
            if generation == self.alert_generation:
                self.alert_output = False
                self.active_alert = None
                self.alert_task = None
                self.alert_handle = None
                await self.state()

    async def capture(self) -> CapturedFrame:
        camera_identity = await self.bridge.camera_identity()
        participant = self.ctx.room.remote_participants.get(camera_identity)
        phone_selected = camera_identity != self.participant_identity
        if not participant:
            raise DomainError(
                "EVIDENCE_MISSING",
                "Reconnect the paired phone camera or disconnect it before using your local camera."
                if phone_selected
                else "Reconnect your camera before checking this step.",
                409,
            )
        track = next(
            (
                publication.track
                for publication in participant.track_publications.values()
                if publication.kind == rtc.TrackKind.KIND_VIDEO
                and publication.source == rtc.TrackSource.SOURCE_CAMERA
                and publication.track
            ),
            None,
        )
        if not track:
            raise DomainError(
                "EVIDENCE_MISSING",
                "The paired phone is not sharing video. Resume its camera or disconnect the pairing."
                if phone_selected
                else "Enable and publish your camera before checking.",
                409,
            )
        # A new capacity-one stream has no queued historic frames.
        stream = rtc.VideoStream(track, format=rtc.VideoBufferType.RGB24, capacity=1)
        try:
            event = await asyncio.wait_for(stream.__anext__(), timeout=3.0)
            captured_at = datetime.now(UTC)
            frame = event.frame
            jpeg = await asyncio.to_thread(
                encode_frame, bytes(frame.data), frame.width, frame.height
            )
            await self.require_camera_identity(camera_identity)
            return SelectedCameraFrame(jpeg, captured_at, camera_identity)
        except TimeoutError as error:
            raise DomainError(
                "TIMEOUT", "No fresh camera frame arrived. Check the camera and retry.", 504
            ) from error
        finally:
            await stream.aclose()

    async def require_camera_identity(self, camera_identity: str) -> None:
        if await self.bridge.camera_identity() != camera_identity:
            raise DomainError(
                "CAMERA_CHANGED",
                "The selected camera changed during the check. Capture a fresh frame and retry.",
                409,
            )

    async def visual(self, payload: dict, *, from_model_tool: bool = False) -> dict:
        command = Command.model_validate(payload)
        replay = await self.bridge.preflight_visual(command)
        if replay is not None:
            return replay
        snapshot = await self.bridge.snapshot()
        if snapshot["version"] != command.expected_version:
            raise DomainError("STALE_RUN", "The run changed. Refresh and retry.", 409)
        if snapshot["currentStepId"] != command.expected_step_id:
            raise DomainError(
                "STALE_STEP", "The current step changed. Review the instruction.", 409
            )
        step = next(
            (item for item in snapshot["steps"] if item["id"] == command.expected_step_id), None
        )
        if not step or step["verification"]["kind"] != "visual" or step["status"] == "held":
            raise DomainError(
                "TRANSITION_REJECTED", "Open the permitted visual step or retest first.", 409
            )
        await self.emit("attempt.updated", {"status": "scanning", "stepId": step["id"]})
        frame = None
        try:
            frame = await self.capture()
            assessment = await self.verifier.assess(
                frame,
                {**step, "expectedAsset": snapshot.get("workOrder", {}).get("asset", {})},
            )
            if isinstance(frame, SelectedCameraFrame):
                await self.require_camera_identity(frame.camera_identity)
            result = await self.bridge.execute(
                "submit_visual_check",
                command,
                assessment=assessment,
                frame=frame.jpeg,
                media_type="image/jpeg",
                captured_at=frame.captured_at,
                expected_camera_identity=(
                    frame.camera_identity if isinstance(frame, SelectedCameraFrame) else None
                ),
            )
        except DomainError as error:
            if error.code in {"STALE_RUN", "STALE_STEP", "STALE_ATTEMPT", "DUPLICATE_REQUEST"}:
                raise
            result = await self.bridge.execute(
                "fail_visual_attempt",
                command,
                error_code=error.code,
                error_message=error.message,
                frame=frame.jpeg if frame else None,
                captured_at=frame.captured_at if frame else None,
                model=get_settings().vision_model,
            )
        return await self.apply(result, from_model_tool=from_model_tool)

    async def inspect_camera(self, question: str) -> dict:
        """Answer one visual question without creating an attempt or verification."""
        self.policy.require_consultation()
        if not isinstance(question, str) or not question.strip() or len(question) > 2000:
            raise DomainError(
                "VALIDATION_FAILED", "Ask a visual question of up to 2000 characters.", 422
            )
        if self.lock.locked():
            raise DomainError(
                "CHECK_IN_PROGRESS", "Wait for the current camera action to finish.", 409
            )
        try:
            async with self.lock:
                snapshot = await self.bridge.snapshot()
                frame = await self.capture()
                current_step: dict = next(
                    (step for step in snapshot["steps"] if step["id"] == snapshot["currentStepId"]),
                    {},
                )
                result = await self.verifier.describe(
                    frame,
                    question,
                    {
                        "sop": snapshot.get("sop", {}),
                        "expectedAsset": snapshot.get("workOrder", {}).get("asset", {}),
                        "currentStep": {
                            key: current_step.get(key)
                            for key in ("title", "instruction", "verification")
                        },
                    },
                )
                if isinstance(frame, SelectedCameraFrame):
                    await self.require_camera_identity(frame.camera_identity)
                self.policy.require_consultation()
                latest = await self.bridge.snapshot()
                if latest["version"] != snapshot["version"]:
                    raise DomainError(
                        "STALE_RUN", "The run changed. Ask again using the current step.", 409
                    )
                await self.bridge.audit(
                    "consultation.camera_inspected",
                    {
                        "frameSha256": frame.sha256,
                        "capturedAt": frame.captured_at.isoformat(),
                        "model": result["model"],
                        "responseId": result["responseId"],
                    },
                )
                return {
                    **result,
                    "frameSha256": frame.sha256,
                    "capturedAt": frame.captured_at.isoformat(),
                    "purpose": "consultation_only",
                    "stepVerified": False,
                }
        finally:
            # Reconsider an initial check postponed by this bounded read-only request.
            self.spawn(self.automatic_check())

    async def read_label(self) -> dict:
        """Read visible identity text without changing the asset or step record."""
        snapshot = await self.bridge.snapshot()
        if snapshot["status"] != "active":
            raise DomainError(
                "TRANSITION_REJECTED", "Resume the session before reading a camera label.", 409
            )
        frame = await self.capture()
        result = await self.verifier.read_label(frame)
        if isinstance(frame, SelectedCameraFrame):
            await self.require_camera_identity(frame.camera_identity)
        latest = await self.bridge.snapshot()
        if latest["version"] != snapshot["version"] or latest["status"] != "active":
            raise DomainError(
                "STALE_RUN", "The run changed. Read the label again using a fresh frame.", 409
            )
        await self.bridge.audit(
            "camera.label_read",
            {
                "frameSha256": frame.sha256,
                "visionModel": result["visionModel"],
                "responseId": result["responseId"],
            },
        )
        return {"label": result, "snapshot": latest}

    async def dispatch(self, method: str, payload: dict, *, from_model_tool: bool = False) -> dict:
        if not self.ready and method != "assistant.deactivate":
            raise DomainError(
                "AGENT_STARTING", "The assistant is starting. Try again shortly.", 503
            )
        if method == "run.get_context":
            return await self.bridge.snapshot()
        if method == "assistant.read_label":
            return await self.read_label()
        if method == "assistant.mute":
            if not isinstance(payload.get("muted"), bool):
                raise DomainError("VALIDATION_FAILED", "Muted must be a boolean.", 422)
            self.policy.muted = payload["muted"]
            if self.session:
                self.session.output.set_audio_enabled(not self.policy.muted)
            await self.bridge.audit("agent.mute_changed", {"muted": self.policy.muted})
            return await self.state()
        if method in {"assistant.activate", "assistant.deactivate"}:
            active = method == "assistant.activate"
            await self.cancel_alert(
                "consultation-activated" if active else "consultation-deactivated"
            )
            snapshot = await self.bridge.execute("set_consultation", active=active)
            if active:
                self.policy.activate()
            else:
                self.policy.deactivate()
                if self.session:
                    self.session.interrupt()
                    self.session.clear_user_turn()
            if self.session:
                self.session.input.set_audio_enabled(active)
            await self.state()
            return await self.apply(snapshot)
        if method == "assistant.text":
            self.policy.require_consultation()
            text = payload.get("text", "")
            if not isinstance(text, str) or not text.strip() or len(text) > 2000:
                raise DomainError(
                    "VALIDATION_FAILED", "Enter a question of up to 2000 characters.", 422
                )
            if not self.session:
                raise DomainError("PROVIDER_UNAVAILABLE", "Reconnect before asking tara.", 503)
            await self.bridge.transcript("user", text, "consultation", {"source": "typed"})
            handle = self.session.generate_reply(user_input=text)
            self.spawn(self.watch_reply(handle))
            return {"accepted": True}
        if method == "run.retry":
            return await self.visual(payload, from_model_tool=from_model_tool)
        operations: dict[str, tuple[str, type[BaseModel]]] = {
            "run.respond": ("respond", ResponseCommand),
            "run.control": ("control", ControlCommand),
            "run.finish": ("finish", FinishCommand),
            "run.issue": ("record_issue", IssueCommand),
        }
        if method not in operations:
            raise DomainError("VALIDATION_FAILED", "Unknown worker method.", 422)
        name, schema = operations[method]
        return await self.apply(
            await self.bridge.execute(name, schema.model_validate(payload)),
            from_model_tool=from_model_tool,
        )

    def register_rpc(self) -> None:
        methods = [
            "assistant.activate",
            "assistant.deactivate",
            "assistant.text",
            "assistant.mute",
            "assistant.read_label",
            "run.get_context",
            "run.retry",
            "run.respond",
            "run.control",
            "run.finish",
            "run.issue",
        ]
        for method in methods:

            def create_handler(method_name):
                async def handle(data: rtc.RpcInvocationData) -> str:
                    try:
                        if data.caller_identity != self.participant_identity:
                            raise DomainError(
                                "FORBIDDEN", "This participant cannot control the run.", 403
                            )
                        if len(data.payload) > 12_000:
                            raise DomainError("VALIDATION_FAILED", "The request is too large.", 422)
                        payload = json.loads(data.payload or "{}")
                        if not isinstance(payload, dict):
                            raise ValueError("Expected an object")
                        # One short mutation or visual request per run, never an unbounded queue.
                        if method_name in {
                            "assistant.activate",
                            "assistant.deactivate",
                            "assistant.mute",
                        }:
                            result = await self.bridge.logged_tool(
                                method_name, payload, lambda: self.dispatch(method_name, payload)
                            )
                        elif self.lock.locked():
                            raise DomainError(
                                "CHECK_IN_PROGRESS", "Wait for the current action to finish.", 409
                            )
                        else:
                            async with self.lock:
                                result = await self.bridge.logged_tool(
                                    method_name,
                                    payload,
                                    lambda: self.dispatch(method_name, payload),
                                )
                        encoded = json.dumps(result, ensure_ascii=False)
                        if len(encoded.encode()) > 14_000:
                            summary = {
                                "refreshRequired": True,
                                "version": result.get("version"),
                                "reportId": result.get("reportId"),
                            }
                            if method_name == "assistant.read_label":
                                summary["label"] = result["label"]
                            return json.dumps(summary, ensure_ascii=False)
                        return encoded
                    except DomainError as error:
                        return json.dumps(
                            {
                                "error": {
                                    "code": error.code,
                                    "message": error.message,
                                    "requestId": str(uuid4()),
                                    "details": error.details,
                                }
                            }
                        )
                    except (ValidationError, ValueError, TypeError):
                        return json.dumps(
                            {
                                "error": {
                                    "code": "VALIDATION_FAILED",
                                    "message": "The action is invalid. Refresh the run and try again.",
                                    "requestId": str(uuid4()),
                                }
                            }
                        )
                    except Exception:
                        logger.error(
                            "Worker action failed",
                            extra={"run_id": self.run_id, "method": method_name},
                        )
                        return json.dumps(
                            {
                                "error": {
                                    "code": "PROVIDER_UNAVAILABLE",
                                    "message": "The action could not complete. Refresh and retry.",
                                    "requestId": str(uuid4()),
                                }
                            }
                        )

                return handle

            self.ctx.room.local_participant.register_rpc_method(method, create_handler(method))

    async def model_command(self, expected_step_id: str | None, context: RunContext) -> dict:
        snapshot = await self.bridge.snapshot()
        call_id = context.function_call.call_id
        return {
            "expectedVersion": snapshot["version"],
            "expectedStepId": expected_step_id,
            "expectedAttemptId": snapshot.get("currentAttemptId"),
            "idempotencyKey": call_id,
        }


def build_tools(runtime: WorkerRuntime):
    async def execute(method, payload):
        runtime.policy.require_consultation()
        if runtime.lock.locked():
            raise DomainError("CHECK_IN_PROGRESS", "Another action is already in progress.", 409)
        async with runtime.lock:
            return await runtime.bridge.logged_tool(
                method, payload, lambda: runtime.dispatch(method, payload)
            )

    @model_tool
    async def get_run_context() -> dict:
        """Read the selected procedure, ordered steps, current criteria and already known job details."""
        runtime.policy.require_consultation()
        return procedure_context(await runtime.bridge.snapshot())

    @model_tool
    async def search_sop(query: str) -> dict:
        """Find cited source details in the selected SOP; routine explanations use provided procedure context."""
        runtime.policy.require_consultation()
        result = await runtime.bridge.logged_tool(
            "search_sop", {}, lambda: runtime.bridge.search_sop(query[:300])
        )
        await runtime.emit("ui.present", {"panel": "sop", **result})
        return result

    @model_tool
    async def inspect_camera(question: str) -> dict:
        """Observe one fresh camera frame to answer a question without verifying a step."""
        runtime.policy.require_consultation()
        return await runtime.bridge.logged_tool(
            "inspect_camera", {}, lambda: runtime.inspect_camera(question)
        )

    @model_tool
    async def submit_visual_check(context: RunContext, expected_step_id: str) -> dict:
        """Capture one fresh camera frame and submit a criterion assessment through the server."""
        context.disallow_interruptions()
        return await execute("run.retry", await runtime.model_command(expected_step_id, context))

    @model_tool
    async def submit_step_response(
        context: RunContext, expected_step_id: str, response: str
    ) -> dict:
        """Record the technician's explicit attestation or one declared choice response."""
        context.disallow_interruptions()
        return await execute(
            "run.respond",
            {**await runtime.model_command(expected_step_id, context), "response": response},
        )

    @model_tool
    async def record_issue(
        context: RunContext,
        expected_step_id: str,
        note: str,
        kind: str = "technician-reported",
        escalate: bool = False,
    ) -> dict:
        """Record a deviation, unsafe action, or explicit supervisor escalation request."""
        context.disallow_interruptions()
        return await execute(
            "run.issue",
            {
                **await runtime.model_command(expected_step_id, context),
                "kind": kind,
                "note": note,
                "escalate": escalate,
            },
        )

    @model_tool
    async def lookup_parts(query: str) -> dict:
        """Look up real organization inventory by part name or SKU."""
        runtime.policy.require_consultation()
        result = await runtime.bridge.logged_tool(
            "lookup_parts", {}, lambda: runtime.bridge.parts(query)
        )
        await runtime.emit("ui.present", {"panel": "parts", **result})
        return result

    @model_tool
    async def search_web(query: str) -> dict:
        """Find supplementary web references only; approved SOP always takes precedence."""
        runtime.policy.require_consultation()
        result = await runtime.bridge.logged_tool(
            "search_web", {}, lambda: search_references(runtime.http, get_settings(), query[:200])
        )
        await runtime.bridge.audit("web_search.completed", {"resultCount": len(result["items"])})
        await runtime.emit("ui.present", {"panel": "references", **result})
        return result

    @model_tool
    async def present_ui(panel: str) -> dict:
        """Open an authorized SOP, activity, parts, evidence, or report panel."""
        runtime.policy.require_consultation()
        if panel not in {"sop", "activity", "parts", "evidence", "report"}:
            raise DomainError("VALIDATION_FAILED", "Unsupported panel.", 422)
        await runtime.bridge.snapshot()
        await runtime.bridge.audit("ui.present", {"panel": panel})
        await runtime.emit("ui.present", {"panel": panel})
        return {"panel": panel, "presented": True}

    @model_tool
    async def control_run(
        context: RunContext, expected_step_id: str, action: str, reason: str = ""
    ) -> dict:
        """Request an authorized pause, resume, retry, or retest; never skip a required step."""
        context.disallow_interruptions()
        return await execute(
            "run.control",
            {
                **await runtime.model_command(expected_step_id, context),
                "action": action,
                "reason": reason,
            },
        )

    @model_tool
    async def finish_run(
        context: RunContext, expected_step_id: str | None, outcome: str, reason: str = ""
    ) -> dict:
        """Request full or partial close; server validates every required step and partial reason."""
        context.disallow_interruptions()
        return await execute(
            "run.finish",
            {
                **await runtime.model_command(expected_step_id, context),
                "outcome": outcome,
                "reason": reason,
            },
        )

    return [
        get_run_context,
        search_sop,
        inspect_camera,
        submit_visual_check,
        submit_step_response,
        record_issue,
        lookup_parts,
        search_web,
        present_ui,
        control_run,
        finish_run,
    ]


async def accept_job(request: JobRequest):
    try:
        metadata = json.loads(request.job.metadata)
        run_id = str(metadata["runId"])
        await request.accept(identity=f"tara-agent-{run_id}", name="tara")
    except (KeyError, TypeError, ValueError):
        await request.reject()


server = AgentServer(
    ws_url=get_settings().livekit_url or None,
    api_key=get_settings().livekit_api_key or None,
    api_secret=get_settings().livekit_api_secret or None,
    drain_timeout=300,
    num_idle_processes=1,
)


@server.rtc_session(agent_name=get_settings().livekit_agent_name, on_request=accept_job)
async def entrypoint(ctx: JobContext):
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError("Configure worker OPENAI_API_KEY before starting realtime sessions")
    metadata = json.loads(ctx.job.metadata)
    run_id, actor_id = metadata["runId"], metadata["actorId"]
    identity = metadata.get("participantIdentity", actor_id)
    await ctx.connect()
    runtime = WorkerRuntime(ctx, run_id, actor_id, identity)
    ctx.add_shutdown_callback(runtime.close)
    # Authorize the opaque dispatch context against Postgres before accepting RPCs.
    snapshot = await runtime.bridge.execute("set_consultation", active=False)
    runtime.snapshot_version = snapshot["version"]
    agent = Agent(instructions=instructions_for(snapshot), tools=build_tools(runtime))
    runtime.agent = agent
    session: AgentSession[None] = AgentSession(
        llm=openai.realtime.RealtimeModel(
            model=settings.realtime_model,
            voice=settings.realtime_voice,
            api_key=settings.openai_api_key,
            input_audio_noise_reduction="far_field",
            turn_detection=SemanticVad(
                type="semantic_vad",
                eagerness="medium",
                create_response=True,
                interrupt_response=True,
            ),
        ),
        max_tool_steps=1,
        turn_handling={"turn_detection": "realtime_llm"},
    )
    runtime.session = session
    session.input.set_audio_enabled(False)
    runtime.register_rpc()

    @ctx.room.on("track_subscribed")
    def track_subscribed(track, publication, participant):
        if (
            publication.kind == rtc.TrackKind.KIND_VIDEO
            and publication.source == rtc.TrackSource.SOURCE_CAMERA
            and (
                participant.identity == identity or participant.identity.startswith("tara-camera-")
            )
        ):
            runtime.spawn(runtime.camera_subscribed(participant.identity))

    @session.on("conversation_item_added")
    def conversation_item_added(event):
        item = event.item
        if not isinstance(item, ChatMessage):
            return
        text = item.text_content
        if not text or item.role not in {"user", "assistant"}:
            return
        mode = "alert" if runtime.alert_output and item.role == "assistant" else runtime.policy.mode
        if mode == "silent":
            return

        async def record():
            await runtime.bridge.transcript(item.role, text, mode, {"itemId": item.id})
            await runtime.emit("agent.transcript", {"role": item.role, "text": text, "mode": mode})
            if item.role == "assistant" and mode == "consultation":
                await runtime.bridge.agent_output(
                    text, mode, "muted" if runtime.policy.muted else "spoken"
                )

        runtime.spawn(record())

    @session.on("error")
    def session_error(event):
        recoverable = bool(getattr(event.error, "recoverable", False))
        runtime.spawn(runtime.report_provider_error(recoverable=recoverable))

    @session.on("close")
    def session_closed(event):
        if runtime.ready:
            runtime.spawn(runtime.report_provider_error(recoverable=False))

    await session.start(
        agent=agent,
        room=ctx.room,
        room_options=room_io.RoomOptions(
            video_input=False,
            text_input=False,
            participant_identity=identity,
        ),
        record=False,
        session_host=False,
    )
    runtime.ready = True
    await runtime.emit("run.snapshot", snapshot)
    await runtime.state()
    runtime.spawn(runtime.automatic_check())
    # Deliberately no greeting, initial reply, timer, or continuous video-to-model path.


if __name__ == "__main__":
    cli.run_app(server)
