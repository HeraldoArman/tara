from collections import Counter
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from tara_server.auth import require_roles
from tara_server.db.models import (
    SOP,
    Evidence,
    Report,
    Run,
    RunStep,
    SOPVersion,
    StepAttempt,
    User,
    WorkOrder,
    now,
)
from tara_server.domain.execution import SUCCESS, iso, work_order_json


def authorized_runs(actor: User):
    require_roles(actor, "technician", "supervisor", "owner")
    query = select(Run).where(Run.org_id == actor.org_id)
    if actor.role == "technician":
        query = query.where(Run.technician_id == actor.id)
    return query


def elapsed_seconds(run: Run, measured_at: datetime) -> int:
    seconds = run.active_seconds
    if run.status == "active" and run.resumed_at:
        seconds += max(0, int((measured_at - run.resumed_at.replace(tzinfo=UTC)).total_seconds()))
    return seconds


def evidence_json(evidence: Evidence, *, step_title: str, sop_key: str) -> dict:
    return {
        "id": evidence.id,
        "runId": evidence.run_id,
        "stepId": evidence.step_id,
        "stepTitle": step_title,
        "sopKey": sop_key,
        "attemptId": evidence.attempt_id,
        "accepted": evidence.accepted,
        "sha256": evidence.sha256,
        "mediaType": evidence.media_type,
        "source": evidence.source,
        "model": evidence.model,
        "capturedAt": iso(evidence.captured_at),
        "width": evidence.width,
        "height": evidence.height,
        "assessmentId": evidence.assessment_id,
        "correlationId": evidence.correlation_id,
        "urlEndpoint": f"/api/v1/evidence/{evidence.id}/url",
    }


async def list_run_records(session: AsyncSession, actor: User, limit: int = 100, offset: int = 0):
    query = (
        authorized_runs(actor)
        .add_columns(WorkOrder, SOPVersion, SOP)
        .join(WorkOrder, Run.work_order_id == WorkOrder.id)
        .join(SOPVersion, Run.sop_version_id == SOPVersion.id)
        .join(SOP, SOPVersion.sop_id == SOP.id)
        .order_by(Run.created_at.desc(), Run.id.desc())
        .offset(offset)
        .limit(limit + 1)
    )
    rows = (await session.execute(query)).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    run_ids = [run.id for run, _, _, _ in rows]
    steps = (await session.scalars(select(RunStep).where(RunStep.run_id.in_(run_ids)))).all()
    totals = Counter(step.run_id for step in steps)
    completed = Counter(step.run_id for step in steps if step.status in SUCCESS)
    held = Counter(step.run_id for step in steps if step.status == "held")
    attempt_counts = dict(
        (
            await session.execute(
                select(StepAttempt.run_id, func.count())
                .where(StepAttempt.run_id.in_(run_ids))
                .group_by(StepAttempt.run_id)
            )
        ).all()
    )
    evidence_counts = Counter()
    accepted_counts = Counter()
    for run_id, accepted, count in (
        await session.execute(
            select(Evidence.run_id, Evidence.accepted, func.count())
            .where(Evidence.run_id.in_(run_ids))
            .group_by(Evidence.run_id, Evidence.accepted)
        )
    ).all():
        evidence_counts[run_id] += count
        if accepted:
            accepted_counts[run_id] += count
    reports = (
        await session.scalars(
            select(Report)
            .where(Report.run_id.in_(run_ids), Report.org_id == actor.org_id)
            .order_by(Report.revision.desc())
        )
    ).all()
    latest_reports = {}
    for report in reports:
        latest_reports.setdefault(report.run_id, report.id)
    measured_at = now()
    return {
        "items": [
            {
                "id": run.id,
                "status": run.status,
                "startedAt": iso(run.created_at),
                "elapsedSeconds": elapsed_seconds(run, measured_at),
                "workOrder": work_order_json(work, run.id),
                "sopVersionId": version.id,
                "sop": {
                    "id": sop.id,
                    "key": sop.key,
                    "title": version.definition.get("title", sop.title),
                    "version": version.version,
                    "scope": version.definition.get("scope", ""),
                    "prerequisites": version.definition.get("prerequisites", []),
                },
                "progress": {
                    "completed": completed[run.id],
                    "total": totals[run.id],
                    "held": held[run.id],
                },
                "attemptCount": attempt_counts.get(run.id, 0),
                "evidenceCount": evidence_counts[run.id],
                "acceptedEvidenceCount": accepted_counts[run.id],
                "reportId": latest_reports.get(run.id),
            }
            for run, work, version, sop in rows
        ],
        "offset": offset,
        "limit": limit,
        "hasMore": has_more,
        "nextOffset": offset + limit if has_more else None,
    }
