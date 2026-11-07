"""Reload authorization at every tool/RPC boundary and commit before publishing."""

import time
from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy import select

from tara_server.db.models import (
    AgentOutput,
    Alert,
    Part,
    ToolCall,
    TranscriptTurn,
    User,
)
from tara_server.db.session import session_factory
from tara_server.domain import execution
from tara_server.errors import DomainError
from tara_server.schemas import Command


class DomainBridge:
    def __init__(self, run_id: str, actor_id: str):
        self.run_id = run_id
        self.actor_id = actor_id

    async def _actor(self, session) -> User:
        actor = await session.get(User, self.actor_id)
        if not actor or not actor.active:
            raise DomainError("UNAUTHORIZED", "Your session is no longer authorized.", 401)
        return actor

    async def transact(self, callback: Callable[..., Awaitable[Any]]):
        async with session_factory() as session:
            async with session.begin():
                actor = await self._actor(session)
                return await callback(session, actor)

    async def snapshot(self) -> dict:
        return await self.transact(
            lambda session, actor: execution.get_run_snapshot(
                session,
                actor,
                self.run_id,
            )
        )

    async def preflight_visual(self, command: Command) -> dict | None:
        """Reuse domain authorization, command hashing and replay before spending on a frame."""

        async def prepare(session, actor):
            _, replay = await execution.prepare(session, actor, self.run_id, command, "visual")
            return replay

        return await self.transact(prepare)

    async def execute(self, name: str, command=None, **kwargs) -> dict:
        operation = getattr(execution, name)

        async def invoke(session, actor):
            if command is None:
                return await operation(session, actor, self.run_id, **kwargs)
            return await operation(session, actor, self.run_id, command, **kwargs)

        return await self.transact(invoke)

    async def search_sop(self, query: str) -> dict:
        from tara_server.domain.sops import search_sop

        async def search(session, actor):
            run = await execution.authorize_run(session, actor, self.run_id)
            return await search_sop(session, actor, run.sop_version_id, query)

        return await self.transact(search)

    async def parts(self, query: str) -> dict:
        async def search(session, actor):
            await execution.authorize_run(session, actor, self.run_id)
            rows = (
                await session.scalars(
                    select(Part)
                    .where(
                        Part.org_id == actor.org_id,
                        (Part.name.ilike(f"%{query[:100]}%") | Part.sku.ilike(f"%{query[:100]}%")),
                    )
                    .limit(10)
                )
            ).all()
            return {
                "items": [
                    {
                        "id": row.id,
                        "sku": row.sku,
                        "name": row.name,
                        "stock": row.stock,
                        "location": row.location,
                        "priceCents": row.price_cents,
                        "currency": row.currency,
                    }
                    for row in rows
                ]
            }

        return await self.transact(search)

    async def audit(self, event_type: str, payload: dict):
        async def write(session, actor):
            run = await execution.authorize_run(session, actor, self.run_id)
            execution.audit(session, actor, run, event_type, payload)

        await self.transact(write)

    async def transcript(self, role: str, content: str, mode: str, metadata: dict | None = None):
        async def write(session, actor):
            await execution.authorize_run(session, actor, self.run_id)
            session.add(
                TranscriptTurn(
                    run_id=self.run_id,
                    role=role,
                    content=content[:8000],
                    mode=mode,
                    metadata_json=metadata or {},
                )
            )

        await self.transact(write)

    async def agent_output(
        self,
        content: str,
        mode: str,
        speech_status: str,
        alert_id: str | None = None,
        metadata: dict | None = None,
    ):
        async def write(session, actor):
            await execution.authorize_run(session, actor, self.run_id)
            if alert_id:
                row = await session.scalar(
                    select(Alert)
                    .where(
                        Alert.id == alert_id,
                        Alert.run_id == self.run_id,
                    )
                    .with_for_update()
                )
                if not row:
                    raise DomainError(
                        "INVALID_ALERT", "The triggering alert is no longer available.", 409
                    )
                row.status = speech_status
            session.add(
                AgentOutput(
                    run_id=self.run_id,
                    mode=mode,
                    alert_id=alert_id,
                    content=content[:8000],
                    speech_status=speech_status,
                    metadata_json=metadata or {},
                )
            )

        await self.transact(write)

    async def logged_tool(self, name: str, arguments: dict, call: Callable[[], Awaitable[Any]]):
        started = time.monotonic()
        status = "completed"
        result = {}
        try:
            result = await call()
            return result
        except Exception:
            status = "failed"
            raise
        finally:

            async def write(session, actor):
                await execution.authorize_run(session, actor, self.run_id)
                session.add(
                    ToolCall(
                        run_id=self.run_id,
                        name=name,
                        duration_ms=int((time.monotonic() - started) * 1000),
                        status=status,
                        sanitized_arguments={
                            key: value
                            for key, value in arguments.items()
                            if key in {"expectedStepId", "action", "panel", "outcome"}
                        },
                        result={
                            "status": status,
                            "runVersion": result.get("version")
                            if isinstance(result, dict)
                            else None,
                        },
                    )
                )

            await self.transact(write)
