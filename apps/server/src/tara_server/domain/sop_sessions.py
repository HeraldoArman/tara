"""Start a technician's own execution from a selected published procedure."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tara_server.auth import require_roles
from tara_server.db.models import Run, User, WorkOrder, uid
from tara_server.domain.execution import audit, create_run, get_run_snapshot
from tara_server.domain.sops import authorized_version
from tara_server.errors import DomainError

SESSION_REFERENCE_PREFIX = "TARA-SESSION-"


async def start_sop_session(session: AsyncSession, actor: User, version_id: str) -> dict:
    require_roles(actor, "technician", "owner")
    version = await authorized_version(session, actor, version_id)
    if version.status != "published":
        raise DomainError(
            "TRANSITION_REJECTED",
            "Review and publish this SOP before starting a session.",
            409,
        )

    # Serialize this operator's starts. A double click, another tab, or a retry
    # after a lost response resumes the same open session for this exact version.
    await session.execute(select(User.id).where(User.id == actor.id).with_for_update())
    existing = await session.scalar(
        select(Run)
        .join(WorkOrder, WorkOrder.id == Run.work_order_id)
        .where(
            Run.org_id == actor.org_id,
            Run.technician_id == actor.id,
            Run.sop_version_id == version.id,
            Run.status.in_(["active", "paused"]),
            WorkOrder.org_id == actor.org_id,
            WorkOrder.assigned_to == actor.id,
            WorkOrder.reference.startswith(SESSION_REFERENCE_PREFIX),
        )
        .order_by(Run.created_at.desc())
        .limit(1)
    )
    if existing:
        return await get_run_snapshot(session, actor, existing.id)

    work = WorkOrder(
        id=uid(),
        org_id=actor.org_id,
        reference=f"{SESSION_REFERENCE_PREFIX}{uid()}",
        title=str(version.definition.get("title") or "SOP session")[:300],
        model="Not provided",
        serial="Not provided",
        issue="Session started from SOP selection.",
        priority="standard",
        assigned_to=actor.id,
        sop_version_id=version.id,
        estimated_minutes=0,
    )
    session.add(work)
    await session.flush()
    audit(
        session,
        actor,
        None,
        "work_order.self_started",
        {"workOrderId": work.id, "sopVersionId": version.id},
    )
    return await create_run(session, actor, work.id)
