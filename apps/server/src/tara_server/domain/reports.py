from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from tara_server.auth import require_roles
from tara_server.db.models import (
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
    query = select(Run).where(Run.org_id == actor.org_id)
    if sop_id:
        query = query.join(SOPVersion).where(SOPVersion.sop_id == sop_id)
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
    if actor.role == "technician":
        query = query.where(Run.technician_id == actor.id)
    runs = (await session.scalars(query)).all()
    run_ids = [run.id for run in runs]
    attempts = (
        await session.scalars(select(StepAttempt).where(StepAttempt.run_id.in_(run_ids)))
    ).all()
    steps = (await session.scalars(select(RunStep).where(RunStep.run_id.in_(run_ids)))).all()
    evidence = (await session.scalars(select(Evidence).where(Evidence.run_id.in_(run_ids)))).all()
    tools = (await session.scalars(select(ToolCall).where(ToolCall.run_id.in_(run_ids)))).all()
    deviations = (
        await session.scalars(select(Deviation).where(Deviation.run_id.in_(run_ids)))
    ).all()
    escalations = (
        await session.scalars(select(Escalation).where(Escalation.run_id.in_(run_ids)))
    ).all()
    outputs = (
        await session.scalars(select(AgentOutput).where(AgentOutput.run_id.in_(run_ids)))
    ).all()
    first = [attempt for attempt in attempts if attempt.number == 1]
    first_pass = sum(a.outcome in {"passed", "attested"} for a in first)
    criterion_failures: dict[str, int] = {}
    for attempt in attempts:
        for criterion in attempt.result.get("criteria", []):
            if criterion.get("verdict") != "pass":
                criterion_failures[criterion["id"]] = criterion_failures.get(criterion["id"], 0) + 1
    step_metrics = []
    for step_id in sorted({s.step_id for s in steps}):
        matching = [s for s in steps if s.step_id == step_id]
        step_attempts = [a for a in attempts if a.run_step_id in {s.id for s in matching}]
        step_metrics.append(
            {
                "stepId": step_id,
                "runs": len(matching),
                "attempts": len(step_attempts),
                "firstPass": sum(
                    a.number == 1 and a.outcome in {"passed", "attested"} for a in step_attempts
                ),
                "held": sum(s.status == "held" for s in matching),
            }
        )
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
        "evidenceCoverage": sum(e.accepted for e in evidence) / len(steps) if steps else None,
        "aiVerified": sum(s.status == "ai_verified" for s in steps),
        "attested": sum(s.status == "attested" for s in steps),
        "held": sum(s.status == "held" for s in steps),
        "unreached": sum(s.status == "locked" for s in steps),
        "retakes": sum(a.number > 1 for a in attempts),
        "deviations": len(deviations),
        "openEscalations": sum(e.status == "open" for e in escalations),
        "criterionFailures": [
            {"criterionId": key, "count": count} for key, count in criterion_failures.items()
        ],
        "stepMetrics": step_metrics,
        "activeSeconds": sum(r.active_seconds for r in runs),
        "toolFailureRate": sum(t.status == "failed" for t in tools) / len(tools) if tools else None,
        "latency": [
            {"id": t.id, "tool": t.name, "durationMs": t.duration_ms, "status": t.status}
            for t in tools[-100:]
        ],
        "alerts": sum(o.mode == "alert" for o in outputs),
        "suppressedAlerts": sum(o.speech_status in {"suppressed", "muted"} for o in outputs),
    }
