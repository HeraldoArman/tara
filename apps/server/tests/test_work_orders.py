import copy

import httpx
import pytest
from sqlalchemy import func, select

from tara_server.api.main import app
from tara_server.auth import COOKIE_NAME, token_for
from tara_server.db.models import SOP, AuditEvent, Organization, SOPVersion, User, WorkOrder
from tara_server.db.session import get_session
from tara_server.domain.work_orders import create_work_order, list_assignees
from tara_server.errors import DomainError
from tara_server.schemas import WorkOrderInput
from tara_server.settings import get_settings


@pytest.fixture
async def assignment_client(workshop):
    session, users, work = workshop

    async def override_session():
        yield session

    app.dependency_overrides[get_session] = override_session
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            yield client, session, users, work
    finally:
        app.dependency_overrides.clear()


def work_input(work, **overrides):
    return {
        "reference": "ASSIGNED-1001",
        "title": "Inspect assigned equipment",
        "asset": {"model": "Keyboard", "serial": "ASSET-456"},
        "issue": "Inspect an unresponsive key.",
        "priority": "priority",
        "assignedUsername": "technician",
        "sopVersionId": work.sop_version_id,
        "estimatedMinutes": 25,
        **overrides,
    }


async def foreign_records(session, work):
    organization = Organization(name="Another organization")
    session.add(organization)
    await session.flush()
    user = User(
        org_id=organization.id,
        username="foreign-technician",
        name="Other Technician",
        role="technician",
        password_hash="unused-test-fixture",
        active=True,
    )
    sop = SOP(org_id=organization.id, key="FOREIGN-SOP", title="Other procedure")
    session.add_all([user, sop])
    await session.flush()
    original = await session.get(SOPVersion, work.sop_version_id)
    version = SOPVersion(
        org_id=organization.id,
        sop_id=sop.id,
        version_number=1,
        version="1.0",
        status="published",
        definition=copy.deepcopy(original.definition),
        created_by=user.id,
    )
    session.add(version)
    await session.flush()
    return user, version


async def test_owner_can_assign_published_work_and_only_assigned_technician_can_start(
    assignment_client,
):
    client, session, users, work = assignment_client
    origin = {"Origin": get_settings().app_origin}
    client.cookies.set(COOKIE_NAME, token_for(users["owner"]))
    payload = work_input(work)

    created = await client.post("/api/v1/work-orders", json=payload, headers=origin)

    assert created.status_code == 201
    assigned = created.json()
    assert assigned["reference"] == payload["reference"]
    assert assigned["asset"] == payload["asset"]
    assert assigned["status"] == "queued"
    assert assigned["assignedTo"] == users["technician"].id
    assert assigned["sopVersionId"] == work.sop_version_id
    assert assigned["estimatedMinutes"] == 25
    assert assigned["runId"] is None
    event = await session.scalar(
        select(AuditEvent).where(AuditEvent.event_type == "work_order.provisioned")
    )
    assert event.actor_id == users["owner"].id
    assert event.actor_role == "owner"
    assert event.payload["workOrderId"] == assigned["id"]
    assert (
        await client.post(f"/api/v1/work-orders/{assigned['id']}/runs", headers=origin)
    ).status_code == 403

    client.cookies.set(COOKIE_NAME, token_for(users["technician"]))
    queue = await client.get("/api/v1/work-orders")
    assert queue.status_code == 200
    assert assigned["id"] in {item["id"] for item in queue.json()["items"]}
    detail = await client.get(f"/api/v1/work-orders/{assigned['id']}")
    assert detail.status_code == 200
    assert detail.json()["assignedTo"] == users["technician"].id
    started = await client.post(f"/api/v1/work-orders/{assigned['id']}/runs", headers=origin)
    assert started.status_code == 200
    assert started.json()["workOrderId"] == assigned["id"]
    assert started.json()["status"] == "active"
    assert started.json()["interactionMode"] == "silent"
    assert started.json()["currentStepId"] is not None


async def test_owner_assignees_include_only_active_same_org_technicians_and_owners(
    assignment_client,
):
    client, session, users, work = assignment_client
    foreign, _version = await foreign_records(session, work)
    inactive = User(
        org_id=users["owner"].org_id,
        username="inactive-technician",
        name="Inactive Technician",
        role="technician",
        password_hash="unused-test-fixture",
        active=False,
    )
    session.add(inactive)
    await session.flush()
    client.cookies.set(COOKIE_NAME, token_for(users["owner"]))

    response = await client.get("/api/v1/work-orders/assignees")

    assert response.status_code == 200
    items = response.json()["items"]
    assert {item["id"] for item in items} == {users["technician"].id, users["owner"].id}
    assert all(item["organizationId"] == users["owner"].org_id for item in items)
    assert all(set(item) == {"id", "organizationId", "username", "name", "role"} for item in items)
    assert foreign.id not in {item["id"] for item in items}
    assert inactive.id not in {item["id"] for item in items}


@pytest.mark.parametrize("role", ["technician", "supervisor", "sop_manager"])
async def test_other_roles_cannot_list_assignees_or_assign_jobs(assignment_client, role):
    client, session, users, work = assignment_client
    client.cookies.set(COOKIE_NAME, token_for(users[role]))
    before = await session.scalar(select(func.count()).select_from(WorkOrder))

    assert (await client.get("/api/v1/work-orders/assignees")).status_code == 403
    response = await client.post(
        "/api/v1/work-orders",
        json=work_input(work),
        headers={"Origin": get_settings().app_origin},
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"
    assert await session.scalar(select(func.count()).select_from(WorkOrder)) == before


async def test_assignment_endpoints_require_an_authenticated_session(assignment_client):
    client, _session, _users, work = assignment_client
    assert (await client.get("/api/v1/work-orders/assignees")).status_code == 401
    response = await client.post(
        "/api/v1/work-orders",
        json=work_input(work),
        headers={"Origin": get_settings().app_origin},
    )
    assert response.status_code == 401


@pytest.mark.parametrize("foreign_field", ["assignedUsername", "sopVersionId"])
async def test_owner_cannot_assign_cross_org_users_or_procedures(assignment_client, foreign_field):
    client, session, users, work = assignment_client
    foreign, version = await foreign_records(session, work)
    value = foreign.username if foreign_field == "assignedUsername" else version.id
    client.cookies.set(COOKIE_NAME, token_for(users["owner"]))
    before = await session.scalar(select(func.count()).select_from(WorkOrder))

    response = await client.post(
        "/api/v1/work-orders",
        json=work_input(work, **{foreign_field: value}),
        headers={"Origin": get_settings().app_origin},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_FAILED"
    assert await session.scalar(select(func.count()).select_from(WorkOrder)) == before


async def test_owner_cannot_assign_draft_procedure(assignment_client):
    client, session, users, work = assignment_client
    original = await session.get(SOPVersion, work.sop_version_id)
    draft = SOPVersion(
        org_id=original.org_id,
        sop_id=original.sop_id,
        version_number=2,
        version="2.0",
        status="draft",
        definition=copy.deepcopy(original.definition),
        created_by=users["owner"].id,
    )
    session.add(draft)
    await session.flush()
    client.cookies.set(COOKIE_NAME, token_for(users["owner"]))

    response = await client.post(
        "/api/v1/work-orders",
        json=work_input(work, sopVersionId=draft.id),
        headers={"Origin": get_settings().app_origin},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_FAILED"


@pytest.mark.parametrize("assignee", ["inactive", "supervisor", "sop_manager", "missing"])
async def test_ineligible_assignees_cannot_receive_work(assignment_client, assignee):
    client, session, users, work = assignment_client
    username = assignee
    if assignee == "inactive":
        users["technician"].active = False
        username = users["technician"].username
        await session.flush()
    client.cookies.set(COOKIE_NAME, token_for(users["owner"]))

    response = await client.post(
        "/api/v1/work-orders",
        json=work_input(work, assignedUsername=username),
        headers={"Origin": get_settings().app_origin},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_FAILED"


async def test_duplicate_reference_returns_conflict_without_overwriting_or_auditing_new_job(
    assignment_client,
):
    client, session, users, work = assignment_client
    original = (work.title, work.assigned_to, work.sop_version_id)
    client.cookies.set(COOKIE_NAME, token_for(users["owner"]))
    before = await session.scalar(select(func.count()).select_from(WorkOrder))

    response = await client.post(
        "/api/v1/work-orders",
        json=work_input(work, reference=work.reference),
        headers={"Origin": get_settings().app_origin},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "VALIDATION_FAILED"
    assert (work.title, work.assigned_to, work.sop_version_id) == original
    assert await session.scalar(select(func.count()).select_from(WorkOrder)) == before
    assert not await session.scalar(
        select(AuditEvent).where(AuditEvent.event_type == "work_order.provisioned")
    )


async def test_creation_cannot_set_organization_actor_or_execution_status(assignment_client):
    client, session, users, work = assignment_client
    client.cookies.set(COOKIE_NAME, token_for(users["owner"]))
    payload = work_input(work)
    payload.update(
        {"organizationId": "another-org", "assignedTo": users["owner"].id, "status": "complete"}
    )

    response = await client.post(
        "/api/v1/work-orders", json=payload, headers={"Origin": get_settings().app_origin}
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_FAILED"
    assert (
        await session.scalar(select(WorkOrder).where(WorkOrder.reference == payload["reference"]))
        is None
    )


async def test_owner_can_assign_to_self_and_start_work(assignment_client):
    client, _session, users, work = assignment_client
    client.cookies.set(COOKIE_NAME, token_for(users["owner"]))
    origin = {"Origin": get_settings().app_origin}
    created = await client.post(
        "/api/v1/work-orders",
        json=work_input(work, assignedUsername=users["owner"].username),
        headers=origin,
    )

    assert created.status_code == 201
    assert created.json()["assignedTo"] == users["owner"].id
    started = await client.post(f"/api/v1/work-orders/{created.json()['id']}/runs", headers=origin)
    assert started.status_code == 200
    assert started.json()["workOrderId"] == created.json()["id"]


async def test_shared_creation_and_assignee_domain_services_require_owner(workshop):
    session, users, work = workshop
    with pytest.raises(DomainError) as error:
        await create_work_order(
            session, users["technician"], WorkOrderInput.model_validate(work_input(work))
        )
    assert error.value.code == "FORBIDDEN"
    with pytest.raises(DomainError) as error:
        await list_assignees(session, users["supervisor"])
    assert error.value.code == "FORBIDDEN"


async def test_shared_creation_rejects_whitespace_only_fields(workshop):
    session, users, work = workshop
    with pytest.raises(DomainError) as error:
        await create_work_order(
            session,
            users["owner"],
            WorkOrderInput.model_validate(work_input(work, reference="   ")),
        )
    assert error.value.code == "VALIDATION_FAILED"
    assert error.value.status == 422
