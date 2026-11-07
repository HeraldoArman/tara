from collections import defaultdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from tara_server.auth import require_roles
from tara_server.db.models import (
    SOP,
    AgentOutput,
    Deviation,
    Escalation,
    Evidence,
    Part,
    Report,
    ReportReview,
    Run,
    RunStep,
    SOPVersion,
    StepAttempt,
    ToolCall,
    User,
    WorkOrder,
    now,
)
from tara_server.db.required import required
from tara_server.domain.execution import audit, authorize_run, iso
from tara_server.domain.run_records import authorized_runs, elapsed_seconds, evidence_json
from tara_server.errors import DomainError
from tara_server.schemas import Review


async def authorize_report(session: AsyncSession, actor: User, report_id: str):
    report = await session.scalar(
        select(Report).where(Report.id == report_id, Report.org_id == actor.org_id)
    )
    if not report:
        raise DomainError("NOT_FOUND", "Report not found.", 404)
    await authorize_run(session, actor, report.run_id)
    return report


async def report_json(session: AsyncSession, actor: User, report_id: str):
    report = await authorize_report(session, actor, report_id)
    reviews = (
        await session.scalars(
            select(ReportReview)
            .where(ReportReview.report_id == report.id)
            .order_by(ReportReview.created_at)
        )
    ).all()
    return {
        **report.snapshot,
        "id": report.id,
        "runId": report.run_id,
        "revision": report.revision,
        "outcome": report.outcome,
        "status": report.status,
        "digest": report.digest,
        "snapshot": report.snapshot,
        "digestScope": "sha256 of canonical JSON snapshot (sorted keys)",
        "createdAt": iso(report.created_at),
        "reviews": [
            {
                "id": r.id,
                "reviewerId": r.reviewer_id,
                "decision": r.decision,
                "note": r.note,
                "createdAt": iso(r.created_at),
            }
            for r in reviews
        ],
    }


async def review_report(session: AsyncSession, actor: User, report_id: str, command: Review):
    require_roles(actor, "supervisor", "owner")
    report = await authorize_report(session, actor, report_id)
    if report.status != "submitted":
        raise DomainError("TRANSITION_REJECTED", "This report revision was already reviewed.", 409)
    if command.decision == "returned" and not command.note.strip():
        raise DomainError("VALIDATION_FAILED", "A return for rework requires a note.", 422)
    run = await required(session, Run, report.run_id)
    await session.execute(select(Run).where(Run.id == run.id).with_for_update())
    if command.decision == "returned":
        other = await session.scalar(
            select(Run).where(
                Run.work_order_id == run.work_order_id,
                Run.id != run.id,
                Run.status.in_(["active", "paused"]),
            )
        )
        if other:
            raise DomainError(
                "TRANSITION_REJECTED",
                "A newer run is active. Review its result before returning this revision.",
                409,
            )
        # Rework requires real execution again and preserves all earlier attempts and report snapshots.
        steps = (
            await session.scalars(
                select(RunStep).where(RunStep.run_id == run.id).order_by(RunStep.display_order)
            )
        ).all()
        for i, step in enumerate(steps):
            step.status = "current" if i == 0 else "locked"
            step.completed_at = None
        run.current_step_id = steps[0].step_id
        run.status = "active"
        run.version += 1
        run.resumed_at = now()
        run.ended_at = None
        run.interaction_mode = "silent"
        work = await required(session, WorkOrder, run.work_order_id)
        work.status = "in_progress"
        session.add(
            Deviation(
                org_id=actor.org_id,
                run_id=run.id,
                kind="supervisor-rework",
                description=command.note,
                step_id=steps[0].step_id,
            )
        )
    report.status = command.decision
    session.add(
        ReportReview(
            report_id=report.id, reviewer_id=actor.id, decision=command.decision, note=command.note
        )
    )
    audit(
        session,
        actor,
        run,
        f"report.{command.decision}",
        {"reportId": report.id, "revision": report.revision, "note": command.note},
    )
    await session.flush()
    return await report_json(session, actor, report.id)


async def lookup_parts(session: AsyncSession, actor: User, query: str):
    if len(query) > 200:
        raise DomainError("VALIDATION_FAILED", "Part queries must be 200 characters or less.", 422)
    statement = select(Part).where(Part.org_id == actor.org_id)
    if query:
        statement = statement.where(Part.name.ilike(f"%{query}%") | Part.sku.ilike(f"%{query}%"))
    parts = (await session.scalars(statement.limit(20))).all()
    return {
        "items": [
            {
                "id": p.id,
                "sku": p.sku,
                "name": p.name,
                "stock": p.stock,
                "location": p.location,
                "priceCents": p.price_cents,
                "currency": p.currency,
            }
            for p in parts
        ]
    }


async def evaluation(
    session: AsyncSession,
    actor: User,
    sop_id: str | None = None,
    technician_id: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
):
    query = (
        authorized_runs(actor)
        .add_columns(SOPVersion, SOP)
        .join(SOPVersion, Run.sop_version_id == SOPVersion.id)
        .join(SOP, SOPVersion.sop_id == SOP.id)
    )
    if sop_id:
        query = query.where(SOPVersion.sop_id == sop_id)
    if technician_id:
        query = query.where(Run.technician_id == technician_id)
    try:
        if from_date:
            query = query.where(
                Run.created_at >= datetime.fromisoformat(from_date).replace(tzinfo=UTC)
            )
        if to_date:
            end = datetime.fromisoformat(to_date).replace(tzinfo=UTC)
            if len(to_date) == 10:
                end += timedelta(days=1)
            query = query.where(Run.created_at < end)
    except ValueError:
        raise DomainError(
            "VALIDATION_FAILED", "Use ISO dates for the evaluation range.", 422
        ) from None
    rows = (await session.execute(query.order_by(Run.created_at.desc(), Run.id.desc()))).all()
    runs = [run for run, _, _ in rows]
    versions = {run.id: version for run, version, _ in rows}
    sops = {run.id: sop for run, _, sop in rows}
    run_order = {run.id: index for index, run in enumerate(runs)}
    definitions = {
        (version.id, step["id"]): step
        for _, version, _ in rows
        for step in version.definition["steps"]
    }
    run_ids = [run.id for run in runs]
    technician_ids = {run.technician_id for run in runs}
    technicians = (
        await session.scalars(
            select(User).where(User.org_id == actor.org_id, User.id.in_(technician_ids))
        )
    ).all()
    technician_names = {user.id: user.name for user in technicians}
    attempts = (
        await session.scalars(select(StepAttempt).where(StepAttempt.run_id.in_(run_ids)))
    ).all()
    steps = (await session.scalars(select(RunStep).where(RunStep.run_id.in_(run_ids)))).all()
    evidence = (await session.scalars(select(Evidence).where(Evidence.run_id.in_(run_ids)))).all()
    tools = (
        await session.scalars(
            select(ToolCall)
            .where(ToolCall.run_id.in_(run_ids))
            .order_by(ToolCall.created_at, ToolCall.id)
        )
    ).all()
    deviations = (
        await session.scalars(select(Deviation).where(Deviation.run_id.in_(run_ids)))
    ).all()
    escalations = (
        await session.scalars(select(Escalation).where(Escalation.run_id.in_(run_ids)))
    ).all()
    outputs = (
        await session.scalars(select(AgentOutput).where(AgentOutput.run_id.in_(run_ids)))
    ).all()
    measured_at = now()

    technician_metrics = []
    for technician_id in sorted(technician_ids):
        technician_runs = [run for run in runs if run.technician_id == technician_id]
        technician_run_ids = {run.id for run in technician_runs}
        technician_attempts = [a for a in attempts if a.run_id in technician_run_ids]
        initial_attempts = [a for a in technician_attempts if a.number == 1]
        technician_metrics.append(
            {
                "technicianId": technician_id,
                "technicianName": technician_names.get(technician_id, "Unavailable technician"),
                "runs": len(technician_runs),
                "completed": sum(run.status == "complete" for run in technician_runs),
                "partial": sum(run.status == "partial" for run in technician_runs),
                "active": sum(run.status in {"active", "paused"} for run in technician_runs),
                "attempts": len(technician_attempts),
                "attemptedSteps": len({a.run_step_id for a in technician_attempts}),
                "firstPassRate": (
                    sum(a.outcome in {"passed", "attested"} for a in initial_attempts)
                    / len(initial_attempts)
                    if initial_attempts
                    else None
                ),
                "retakes": sum(a.number > 1 for a in technician_attempts),
                "activeSeconds": sum(elapsed_seconds(run, measured_at) for run in technician_runs),
            }
        )
    first = [attempt for attempt in attempts if attempt.number == 1]
    first_pass = sum(a.outcome in {"passed", "attested"} for a in first)
    attempts_by_step = defaultdict(list)
    for attempt in attempts:
        attempts_by_step[attempt.run_step_id].append(attempt)
    step_groups = defaultdict(list)
    for step in steps:
        step_groups[(versions[step.run_id].id, step.step_id)].append(step)
    step_metrics = []
    criterion_failures = []
    for (version_id, step_id), matching in sorted(step_groups.items()):
        representative = min(matching, key=lambda step: run_order[step.run_id])
        version = versions[representative.run_id]
        sop = sops[representative.run_id]
        definition = definitions[(version_id, step_id)]
        identity = {
            "id": f"{version_id}:{step_id}",
            "sopVersionId": version_id,
            "stepId": step_id,
            "stepTitle": definition["title"],
            "sopKey": sop.key,
            "sopTitle": version.definition.get("title", sop.title),
            "version": version.version,
            "runId": representative.run_id,
        }
        step_attempts = [attempt for step in matching for attempt in attempts_by_step[step.id]]
        step_metrics.append(
            {
                **identity,
                "runs": len(matching),
                "attempts": len(step_attempts),
                "firstPass": sum(
                    a.number == 1 and a.outcome in {"passed", "attested"} for a in step_attempts
                ),
                "held": sum(s.status == "held" for s in matching),
            }
        )
        failures = defaultdict(lambda: {"count": 0, "unclearCount": 0})
        for attempt in step_attempts:
            for criterion in attempt.result.get("criteria", []):
                verdict = criterion.get("verdict")
                if verdict in {"fail", "unclear"}:
                    field = "count" if verdict == "fail" else "unclearCount"
                    failures[criterion["id"]][field] += 1
        criterion_definitions = {
            criterion["id"]: criterion["description"]
            for criterion in definition["verification"].get("criteria", [])
        }
        for criterion_id, counts in sorted(failures.items()):
            criterion_failures.append(
                {
                    **identity,
                    "id": f"{identity['id']}:{criterion_id}",
                    "criterionId": criterion_id,
                    "criterionDescription": criterion_definitions.get(criterion_id, criterion_id),
                    **counts,
                }
            )
    visual_steps = {
        (step.run_id, step.step_id)
        for step in steps
        if (
            definitions[(versions[step.run_id].id, step.step_id)]["verification"]["kind"]
            == "visual"
            and definitions[(versions[step.run_id].id, step.step_id)].get("required", True)
        )
    }
    verified_visual_steps = visual_steps & {
        (item.run_id, item.step_id) for item in evidence if item.accepted
    }
    recent_evidence = sorted(
        evidence,
        key=lambda item: (item.captured_at.replace(tzinfo=UTC), item.id),
        reverse=True,
    )[:8]
    accepted_frames = sum(item.accepted for item in evidence)
    return {
        "runs": len(runs),
        "completed": sum(r.status == "complete" for r in runs),
        "partial": sum(r.status == "partial" for r in runs),
        "active": sum(r.status in {"active", "paused"} for r in runs),
        "returned": await session.scalar(
            select(func.count())
            .select_from(Report)
            .where(Report.run_id.in_(run_ids), Report.status == "returned")
        ),
        "firstPassRate": first_pass / len(first) if first else None,
        "evidenceCoverage": len(verified_visual_steps) / len(visual_steps)
        if visual_steps
        else None,
        "evidenceFrames": len(evidence),
        "acceptedEvidenceFrames": accepted_frames,
        "unacceptedEvidenceFrames": len(evidence) - accepted_frames,
        "visualSteps": len(visual_steps),
        "verifiedVisualSteps": len(verified_visual_steps),
        "attemptedSteps": len({attempt.run_step_id for attempt in attempts}),
        "firstPassCount": first_pass,
        "firstAttemptCount": len(first),
        "visualChecks": sum(attempt.kind == "visual" for attempt in attempts),
        "errorChecks": sum(attempt.outcome == "error" for attempt in attempts),
        "unclearChecks": sum(attempt.outcome == "unclear" for attempt in attempts),
        "recentEvidence": [
            evidence_json(
                item,
                step_title=definitions[(versions[item.run_id].id, item.step_id)]["title"],
                sop_key=sops[item.run_id].key,
            )
            for item in recent_evidence
        ],
        "aiVerified": sum(s.status == "ai_verified" for s in steps),
        "attested": sum(s.status == "attested" for s in steps),
        "held": sum(s.status == "held" for s in steps),
        "unreached": sum(s.status == "locked" for s in steps),
        "retakes": sum(a.number > 1 for a in attempts),
        "deviations": len(deviations),
        "openEscalations": sum(e.status == "open" for e in escalations),
        "criterionFailures": criterion_failures,
        "stepMetrics": step_metrics,
        "technicianMetrics": technician_metrics,
        "technicianMetricsScope": "Technicians with runs matching the current authorization and filters.",
        "firstPassRateScope": "First recorded attempt per run step, including unfinished runs.",
        "evidenceCoverageScope": "Distinct required visual run steps with accepted evidence divided by all required visual run steps, including unfinished runs.",
        "scope": "All authorized runs matching the filters, including active, paused, complete and partial runs. Unclear checks are separate from failed criteria; stored frames do not imply a verified step.",
        "activeSeconds": sum(elapsed_seconds(run, measured_at) for run in runs),
        "toolFailureRate": sum(t.status == "failed" for t in tools) / len(tools) if tools else None,
        "latency": [
            {"id": t.id, "tool": t.name, "durationMs": t.duration_ms, "status": t.status}
            for t in tools[-100:]
        ],
        "alerts": sum(o.mode == "alert" for o in outputs),
        "suppressedAlerts": sum(o.speech_status in {"suppressed", "muted"} for o in outputs),
    }
