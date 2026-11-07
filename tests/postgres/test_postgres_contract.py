"""Actual PostgreSQL locks, full-text search and historical-record protections."""

import asyncio
import os
from uuid import uuid4

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from tara_server.db.models import AuditEvent, StepAttempt, User, WorkOrder
from tara_server.domain.execution import create_run, respond
from tara_server.domain.reports import evaluation
from tara_server.domain.sops import search_sop
from tara_server.errors import DomainError
from tara_server.schemas import ResponseCommand
from tara_server.seed import seed


@pytest.fixture
async def database():
    url = os.environ.get("TARA_POSTGRES_TEST_URL", "")
    if not url or not (make_url(url).database or "").endswith("_test"):
        raise RuntimeError("Set TARA_POSTGRES_TEST_URL to an isolated PostgreSQL *_test database.")
    engine = create_async_engine(url, connect_args={"command_timeout": 10})
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory.begin() as session:
        await seed(session, "postgres-contract-fixture-password")
        users = {user.role: user for user in (await session.scalars(select(User))).all()}
        template = await session.scalar(select(WorkOrder).where(WorkOrder.reference == "WO-1042"))
        assert template is not None
        work = WorkOrder(
            org_id=template.org_id,
            reference=f"PG-{uuid4()}",
            title=template.title,
            model=template.model,
            serial=template.serial,
            issue=template.issue,
            assigned_to=template.assigned_to,
            sop_version_id=template.sop_version_id,
        )
        session.add(work)
        await session.flush()
    yield factory, users, work
    await engine.dispose()


async def test_database_major_and_migration_head(database):
    factory, _, _ = database
    async with factory() as session:
        version = int(await session.scalar(text("SHOW server_version_num")))
        assert 180000 <= version < 190000
        expected_head = ScriptDirectory.from_config(Config("alembic.ini")).get_current_head()
        assert (
            await session.scalar(text("SELECT version_num FROM alembic_version")) == expected_head
        )


async def test_native_full_text_retrieval_returns_pinned_published_citations(database):
    factory, users, work = database
    async with factory() as session:
        result = await search_sop(session, users["technician"], work.sop_version_id, "switch")
        assert result["sopVersionId"] == work.sop_version_id
        assert 1 <= len(result["items"]) <= 3
        assert all(item["heading"] and item["text"] for item in result["items"])
        assert (
            await session.scalar(
                text("SELECT count(*) FROM pg_indexes WHERE indexname='sop_chunks_search_idx'")
            )
            == 1
        )


async def test_concurrent_requests_advance_once_and_duplicate_returns_original(database):
    factory, users, work = database
    actor = users["technician"]
    async with factory.begin() as session:
        snapshot = await create_run(session, actor, work.id)
    commands = [
        ResponseCommand(
            expectedVersion=snapshot["version"],
            expectedStepId=snapshot["currentStepId"],
            expectedAttemptId=snapshot["currentAttemptId"],
            idempotencyKey=str(uuid4()),
            response="confirmed",
        )
        for _ in range(2)
    ]

    async def submit(command):
        try:
            async with factory.begin() as session:
                result = await respond(session, actor, snapshot["id"], command)
                return "accepted", result
        except DomainError as error:
            return error.code, None

    outcomes = await asyncio.wait_for(
        asyncio.gather(*(submit(command) for command in commands)), timeout=12
    )
    assert sorted(outcome[0] for outcome in outcomes) == ["STALE_RUN", "accepted"]
    winner = next(index for index, outcome in enumerate(outcomes) if outcome[0] == "accepted")
    async with factory.begin() as session:
        duplicate = await respond(session, actor, snapshot["id"], commands[winner])
        assert duplicate == outcomes[winner][1]
        assert (
            await session.scalar(
                select(func.count())
                .select_from(StepAttempt)
                .where(StepAttempt.run_id == snapshot["id"])
            )
            == 1
        )


async def test_technician_evaluation_cannot_select_another_technicians_history(database):
    factory, users, work = database
    actor = users["technician"]
    async with factory() as session:
        baseline = await evaluation(session, actor)
        other = User(
            org_id=actor.org_id,
            username=f"pg-other-{uuid4()}",
            name="PostgreSQL isolation fixture",
            role="technician",
            password_hash=actor.password_hash,
        )
        session.add(other)
        await session.flush()
        foreign_work = WorkOrder(
            org_id=work.org_id,
            reference=f"PG-OTHER-{uuid4()}",
            title=work.title,
            model=work.model,
            serial=work.serial,
            issue=work.issue,
            assigned_to=other.id,
            sop_version_id=work.sop_version_id,
        )
        session.add(foreign_work)
        await session.flush()
        await create_run(session, other, foreign_work.id)
        foreign_view = await evaluation(session, actor, technician_id=other.id)
        assert foreign_view["runs"] == 0
        assert foreign_view["stepMetrics"] == []
        assert (await evaluation(session, actor))["runs"] == baseline["runs"]
        assert (await evaluation(session, other))["runs"] == 1


@pytest.mark.parametrize(
    "statement",
    [
        "UPDATE audit_events SET payload = '{}'::json WHERE run_id = :run_id",
        "DELETE FROM audit_events WHERE run_id = :run_id",
    ],
)
async def test_audit_history_rejects_direct_sql_mutation(database, statement):
    factory, users, work = database
    async with factory.begin() as session:
        snapshot = await create_run(session, users["technician"], work.id)
        assert (
            await session.scalar(
                select(func.count())
                .select_from(AuditEvent)
                .where(AuditEvent.run_id == snapshot["id"])
            )
            > 0
        )
    async with factory() as session:
        with pytest.raises(DBAPIError, match="append-only"):
            await session.execute(text(statement), {"run_id": snapshot["id"]})


@pytest.mark.parametrize(
    "assignment", ["definition = '{}'::json", "status = 'draft'", "version = 'tampered'"]
)
async def test_published_sop_cannot_be_changed_or_reopened(database, assignment):
    factory, _, work = database
    async with factory() as session:
        with pytest.raises(DBAPIError, match="immutable"):
            await session.execute(
                text(f"UPDATE sop_versions SET {assignment} WHERE id = :version_id"),
                {"version_id": work.sop_version_id},
            )
