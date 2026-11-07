import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from tara_server.db.models import Base, User, WorkOrder
from tara_server.seed import seed
from tara_server.settings import get_settings


@pytest.fixture
async def workshop(tmp_path, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "evidence_local_path", tmp_path / "evidence")
    monkeypatch.setattr(settings, "evidence_backend", "local")
    monkeypatch.setattr(settings, "evidence_source", "test_media")
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        await seed(session, "test-password-2026")
        await session.commit()
        users = {user.role: user for user in (await session.scalars(select(User))).all()}
        work = await session.scalar(select(WorkOrder).where(WorkOrder.reference == "WO-1042"))
        yield session, users, work
    await engine.dispose()
