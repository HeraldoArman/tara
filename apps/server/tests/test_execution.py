import io

import pytest
from PIL import Image
from sqlalchemy import func, select

from tara_server.db.models import Evidence, Run, StepAttempt, now
from tara_server.domain import execution
from tara_server.domain.reports import report_json, review_report
from tara_server.errors import DomainError
from tara_server.schemas import (
    Command,
    ControlCommand,
    FinishCommand,
    ResponseCommand,
    Review,
    VisualAssessment,
)


def command(snapshot, schema=Command, **fields):
    import uuid

    return schema(
        expectedVersion=snapshot["version"],
        expectedStepId=snapshot["currentStepId"],
        expectedAttemptId=snapshot["currentAttemptId"],
        idempotencyKey=str(uuid.uuid4()),
        **fields,
    )


async def started(workshop):
    session, users, work = workshop
    result = await execution.create_run(session, users["technician"], work.id)
    return session, users, result


def frame():
    target = io.BytesIO()
    Image.new("RGB", (32, 32), "white").save(target, format="JPEG")
    return target.getvalue()


def assessment(snapshot, passed):
    step = next(s for s in snapshot["steps"] if s["id"] == snapshot["currentStepId"])
    return VisualAssessment(
        model="test-explicit-fixture",
        assessmentId="fixture-assessment",
        criteria=[
            {
                "id": c["id"],
                "verdict": "pass" if passed else "fail",
                "reason": "Explicit test fixture, not a production assessment.",
            }
            for c in step["verification"]["criteria"]
        ],
    )


async def visual(session, user, snapshot, passed=True):
    return await execution.submit_visual_check(
        session,
        user,
        snapshot["id"],
        command(snapshot),
        assessment(snapshot, passed),
        frame(),
        "image/jpeg",
        now(),
    )


async def reach_test(workshop):
    session, users, snapshot = await started(workshop)
    user = users["technician"]
    snapshot = await execution.respond(
        session, user, snapshot["id"], command(snapshot, ResponseCommand, response="confirmed")
    )
    snapshot = await visual(session, user, snapshot)
    snapshot = await visual(session, user, snapshot)
    return session, users, snapshot


async def test_start_resumes_pinned_version_and_is_silent(workshop):
    session, users, work = workshop
    first = await execution.create_run(session, users["technician"], work.id)
    second = await execution.create_run(session, users["technician"], work.id)
    assert first["id"] == second["id"]
    assert first["interactionMode"] == "silent"
    assert first["alerts"] == []
    assert await session.scalar(select(func.count()).select_from(Run)) == 1
    assert sum(step["status"] == "current" for step in first["steps"]) == 1


async def test_stale_and_duplicate_requests_cannot_advance_new_step(workshop):
    session, users, snapshot = await started(workshop)
    cmd = command(snapshot, ResponseCommand, response="confirmed")
    accepted = await execution.respond(session, users["technician"], snapshot["id"], cmd)
    duplicate = await execution.respond(session, users["technician"], snapshot["id"], cmd)
    assert duplicate == accepted
    assert await session.scalar(select(func.count()).select_from(StepAttempt)) == 1
    with pytest.raises(DomainError, match="run changed") as error:
        await execution.respond(
            session,
            users["technician"],
            snapshot["id"],
            command(snapshot, ResponseCommand, response="confirmed"),
        )
    assert error.value.code == "STALE_RUN"


async def test_rejected_evidence_keeps_step_and_preserves_retry_history(workshop):
    session, users, snapshot = await started(workshop)
    user = users["technician"]
    snapshot = await execution.respond(
        session, user, snapshot["id"], command(snapshot, ResponseCommand, response="confirmed")
    )
    step_id = snapshot["currentStepId"]
    rejected = await visual(session, user, snapshot, passed=False)
    assert rejected["currentStepId"] == step_id
    assert rejected["evidence"][-1]["accepted"] is False
    assert rejected["alerts"][-1]["attemptId"] == rejected["currentAttemptId"]
    accepted = await visual(session, user, rejected)
    assert accepted["currentStepId"] != step_id
    assert len(accepted["evidence"]) == 2
    step = next(s for s in accepted["steps"] if s["id"] == step_id)
    assert [a["outcome"] for a in step["attempts"]] == ["rejected", "passed"]
    assert step["status"] == "ai_verified"
    assert len(accepted["alerts"]) == 1  # Passing retry never emits praise/speech.


async def test_failed_choice_is_held_until_retest_and_history_survives(workshop):
    session, users, snapshot = await reach_test(workshop)
    user = users["technician"]
    failed = await execution.respond(
        session, user, snapshot["id"], command(snapshot, ResponseCommand, response="double-types")
    )
    step = next(s for s in failed["steps"] if s["id"] == failed["currentStepId"])
    assert step["status"] == "held"
    assert failed["deviations"][0]["status"] == "open"
    with pytest.raises(DomainError):
        await execution.respond(
            session,
            user,
            failed["id"],
            command(failed, ResponseCommand, response="registers-every-press"),
        )
    retest = await execution.control(
        session, user, failed["id"], command(failed, ControlCommand, action="retest")
    )
    assert retest["deviations"][0]["status"] == "open"
    passed = await execution.respond(
        session,
        user,
        retest["id"],
        command(retest, ResponseCommand, response="registers-every-press"),
    )
    assert passed["deviations"][0]["status"] == "resolved"
    test_step = next(s for s in passed["steps"] if s["id"] == "test-key")
    assert [a["outcome"] for a in test_step["attempts"]] == ["failed", "passed"]


async def test_full_close_rejects_missing_work_partial_keeps_unreached_steps(workshop):
    session, users, snapshot = await started(workshop)
    with pytest.raises(DomainError) as error:
        await execution.finish(
            session,
            users["technician"],
            snapshot["id"],
            command(snapshot, FinishCommand, outcome="complete"),
        )
    assert error.value.code == "TRANSITION_REJECTED"
    partial = await execution.finish(
        session,
        users["technician"],
        snapshot["id"],
        command(snapshot, FinishCommand, outcome="partial", reason="Replacement part unavailable."),
    )
    report = await report_json(session, users["technician"], partial["reportId"])
    assert report["outcome"] == "partial"
    assert any(s["status"] == "locked" for s in report["steps"])
    import hashlib
    import json

    assert len(report["digest"]) == 64
    assert (
        hashlib.sha256(json.dumps(report["snapshot"], sort_keys=True).encode()).hexdigest()
        == report["digest"]
    )
    assert report["auditEvents"]


async def test_review_is_append_only_and_return_creates_actual_rework(workshop):
    session, users, snapshot = await started(workshop)
    partial = await execution.finish(
        session,
        users["technician"],
        snapshot["id"],
        command(
            snapshot, FinishCommand, outcome="partial", reason="Requires supervisor inspection."
        ),
    )
    before = await report_json(session, users["supervisor"], partial["reportId"])
    returned = await review_report(
        session,
        users["supervisor"],
        partial["reportId"],
        Review(decision="returned", note="Repeat the inspection."),
    )
    assert returned["digest"] == before["digest"]
    assert len(returned["reviews"]) == 1
    active = await execution.get_run_snapshot(session, users["technician"], snapshot["id"])
    assert active["status"] == "active"
    assert active["currentStepId"] == active["steps"][0]["id"]
    with pytest.raises(DomainError):
        await review_report(
            session, users["supervisor"], partial["reportId"], Review(decision="approved")
        )


async def test_capture_provider_failure_records_error_attempt_without_pass(workshop):
    session, users, snapshot = await started(workshop)
    snapshot = await execution.respond(
        session,
        users["technician"],
        snapshot["id"],
        command(snapshot, ResponseCommand, response="confirmed"),
    )
    failed = await execution.fail_visual_attempt(
        session,
        users["technician"],
        snapshot["id"],
        command(snapshot),
        "PROVIDER_UNAVAILABLE",
        "The configured vision provider is unavailable.",
    )
    assert failed["currentStepId"] == snapshot["currentStepId"]
    current = next(s for s in failed["steps"] if s["id"] == failed["currentStepId"])
    assert current["attempts"][-1]["outcome"] == "error"
    assert failed["alerts"][-1]["eventId"]
    assert failed["evidence"] == []


async def test_visual_cannot_be_bypassed_with_attestation(workshop):
    session, users, snapshot = await started(workshop)
    snapshot = await execution.respond(
        session,
        users["technician"],
        snapshot["id"],
        command(snapshot, ResponseCommand, response="confirmed"),
    )
    with pytest.raises(DomainError) as error:
        await execution.respond(
            session,
            users["technician"],
            snapshot["id"],
            command(snapshot, ResponseCommand, response="confirmed"),
        )
    assert error.value.code == "EVIDENCE_MISSING"
    assert await session.scalar(select(func.count()).select_from(Evidence)) == 0


async def test_open_deviation_after_final_step_blocks_full_close(workshop):
    from tara_server.schemas import IssueCommand

    session, users, snapshot = await reach_test(workshop)
    user = users["technician"]
    snapshot = await execution.respond(
        session,
        user,
        snapshot["id"],
        command(snapshot, ResponseCommand, response="registers-every-press"),
    )
    snapshot = await execution.respond(
        session, user, snapshot["id"], command(snapshot, ResponseCommand, response="confirmed")
    )
    assert snapshot["currentStepId"] is None
    snapshot = await execution.record_issue(
        session,
        user,
        snapshot["id"],
        command(snapshot, IssueCommand, note="An unresolved issue was found during handoff."),
    )
    with pytest.raises(DomainError) as error:
        await execution.finish(
            session, user, snapshot["id"], command(snapshot, FinishCommand, outcome="complete")
        )
    assert error.value.code == "TRANSITION_REJECTED"
    assert "deviations" in error.value.message
