"""Explicit technician registration of missing self-started session identifiers."""

from sqlalchemy.ext.asyncio import AsyncSession

from tara_server.db.models import User, WorkOrder
from tara_server.db.required import required
from tara_server.domain.execution import audit, authorize_run, get_run_snapshot
from tara_server.domain.sop_sessions import SESSION_REFERENCE_PREFIX
from tara_server.errors import DomainError
from tara_server.schemas import RunAssetRegistration


def missing_identifier(value: str) -> bool:
    return value.strip().casefold() == "not provided"


async def register_asset(
    session: AsyncSession, actor: User, run_id: str, command: RunAssetRegistration
) -> dict:
    run = await authorize_run(session, actor, run_id, mutate=True)
    if run.status != "active":
        raise DomainError(
            "TRANSITION_REJECTED",
            "Resume the active session before registering device details.",
            409,
        )
    work = await required(session, WorkOrder, run.work_order_id)
    if work.org_id != actor.org_id or work.assigned_to != actor.id:
        raise DomainError("FORBIDDEN", "This work order is not assigned to you.", 403)
    if not work.reference.startswith(SESSION_REFERENCE_PREFIX):
        raise DomainError(
            "TRANSITION_REJECTED",
            "Device details on an assigned work order cannot be replaced from the session.",
            409,
        )
    missing_model = missing_identifier(work.model)
    missing_serial = missing_identifier(work.serial)
    if not (missing_model or missing_serial):
        raise DomainError(
            "TRANSITION_REJECTED",
            "This session's model and serial are already registered and cannot be replaced.",
            409,
        )
    model = command.model.strip()
    serial = command.serial.strip() if command.serial is not None else None
    if not model or missing_identifier(model):
        raise DomainError(
            "VALIDATION_FAILED",
            "Enter and confirm the actual model from the device.",
            422,
        )
    if serial is not None and (not serial or missing_identifier(serial)):
        raise DomainError(
            "VALIDATION_FAILED",
            "Enter the actual serial from the device, or leave it omitted if unavailable.",
            422,
        )
    if (not missing_model and model != work.model) or (
        serial is not None and not missing_serial and serial != work.serial
    ):
        raise DomainError(
            "TRANSITION_REJECTED",
            "Keep existing device identifiers unchanged. Only missing details can be registered.",
            409,
        )
    registered = {}
    if missing_model:
        work.model = model
        registered["model"] = model
    if missing_serial and serial is not None:
        work.serial = serial
        registered["serial"] = serial
    if not registered:
        return await get_run_snapshot(session, actor, run.id)
    run.version += 1
    audit(
        session,
        actor,
        run,
        "run.asset_registered",
        {**registered, "source": "technician_confirmation"},
    )
    await session.flush()
    return await get_run_snapshot(session, actor, run.id)
