import pytest
from sqlalchemy import func, select

from tara_server.admin import import_parts, import_work_orders, provision_user
from tara_server.db.models import Part, WorkOrder
from tara_server.errors import DomainError


async def test_provision_requires_owner_and_explicit_strong_password(workshop):
    session, users, _work = workshop
    with pytest.raises(DomainError):
        await provision_user(
            session,
            users["technician"],
            "new-tech",
            "New Technician",
            "technician",
            "strong-password-123456",
        )
    with pytest.raises(DomainError):
        await provision_user(
            session, users["owner"], "new-tech", "New Technician", "technician", "weak"
        )
    user = await provision_user(
        session,
        users["owner"],
        "new-tech",
        "New Technician",
        "technician",
        "strong-password-123456",
    )
    assert user.org_id == users["owner"].org_id
    assert user.password_hash.startswith("$argon2id$")
    with pytest.raises(DomainError):
        await provision_user(
            session, users["owner"], "new-tech", "New Name", "owner", "another-password-12345"
        )
    assert user.role == "technician"


async def test_work_import_pins_published_same_org_sop_and_never_overwrites(workshop):
    session, users, work = workshop
    raw = {
        "reference": "REAL-1001",
        "title": "Inspection",
        "asset": {"model": "Keyboard", "serial": "ASSET-123"},
        "issue": "Unresponsive key",
        "priority": "standard",
        "assignedUsername": "technician",
        "sopVersionId": work.sop_version_id,
        "estimatedMinutes": 20,
    }
    await import_work_orders(session, users["owner"], [raw])
    imported = await session.scalar(select(WorkOrder).where(WorkOrder.reference == "REAL-1001"))
    assert imported.assigned_to == users["technician"].id
    assert imported.sop_version_id == work.sop_version_id
    with pytest.raises(DomainError):
        await import_work_orders(session, users["owner"], [raw])
    with pytest.raises(DomainError):
        await import_work_orders(
            session,
            users["owner"],
            [{**raw, "reference": "REAL-1002", "assignedUsername": "supervisor"}],
        )
    assert await session.scalar(select(func.count()).select_from(WorkOrder)) == 4


async def test_real_parts_import_rejects_duplicate_stock_overwrite(workshop):
    session, users, _work = workshop
    raw = {
        "sku": "REAL-SWITCH",
        "name": "Approved switch",
        "stock": 12,
        "location": "Bin B",
        "priceCents": 120,
        "currency": "USD",
    }
    await import_parts(session, users["owner"], [raw])
    await session.flush()
    with pytest.raises(DomainError):
        await import_parts(session, users["owner"], [{**raw, "stock": 999}])
    part = await session.scalar(select(Part).where(Part.sku == "REAL-SWITCH"))
    assert part.stock == 12
