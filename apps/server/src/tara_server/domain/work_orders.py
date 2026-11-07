"""Owner-controlled assignments shared by the application and operator imports."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tara_server.auth import require_roles
from tara_server.db.models import Organization, SOPVersion, User, WorkOrder
from tara_server.domain.execution import audit
from tara_server.errors import DomainError
from tara_server.schemas import WorkOrderInput


async def list_assignees(session: AsyncSession, owner: User) -> list[User]:
    require_roles(owner, "owner")
    return list(
        (
            await session.scalars(
                select(User)
                .where(
                    User.org_id == owner.org_id,
                    User.active.is_(True),
                    User.role.in_(["technician", "owner"]),
                )
                .order_by(User.name, User.username)
            )
        ).all()
    )


async def create_work_order(
    session: AsyncSession, owner: User, record: WorkOrderInput
) -> WorkOrder:
    require_roles(owner, "owner")
    if any(
        not value.strip()
        for value in (
            record.reference,
            record.title,
            record.asset.model,
            record.asset.serial,
            record.issue,
            record.assigned_username,
            record.sop_version_id,
        )
    ):
        raise DomainError("VALIDATION_FAILED", "Work-order fields must not be blank.", 422)
    # All creation paths take this PostgreSQL row lock before checking references.
    # The existing schema has no unique reference constraint; serialization avoids
    # duplicate references during concurrent application requests and CLI imports.
    await session.execute(
        select(Organization.id).where(Organization.id == owner.org_id).with_for_update()
    )
    technician = await session.scalar(
        select(User).where(
            User.org_id == owner.org_id,
            User.username == record.assigned_username,
            User.active.is_(True),
            User.role.in_(["technician", "owner"]),
        )
    )
    version = await session.scalar(
        select(SOPVersion).where(
            SOPVersion.id == record.sop_version_id,
            SOPVersion.org_id == owner.org_id,
            SOPVersion.status == "published",
        )
    )
    if not technician or not version:
        raise DomainError(
            "VALIDATION_FAILED",
            "Each work order needs an active assigned technician and a published SOP from the owner's organization.",
            422,
        )
    if await session.scalar(
        select(WorkOrder).where(
            WorkOrder.org_id == owner.org_id, WorkOrder.reference == record.reference
        )
    ):
        raise DomainError(
            "VALIDATION_FAILED",
            "A work-order reference is already in use; existing execution records are never overwritten.",
            409,
        )
    work = WorkOrder(
        org_id=owner.org_id,
        reference=record.reference,
        title=record.title,
        model=record.asset.model,
        serial=record.asset.serial,
        issue=record.issue,
        priority=record.priority,
        assigned_to=technician.id,
        sop_version_id=version.id,
        estimated_minutes=record.estimated_minutes,
    )
    session.add(work)
    await session.flush()
    audit(session, owner, None, "work_order.provisioned", {"workOrderId": work.id})
    return work
