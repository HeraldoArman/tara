"""Authenticated viewing of accepted and unaccepted private evidence frames."""

import asyncio

from fastapi import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tara_server.db.models import Evidence, User
from tara_server.domain.execution import authorize_run
from tara_server.errors import DomainError
from tara_server.images import image_dimensions
from tara_server.storage import get_storage


async def authorize_evidence(session: AsyncSession, actor: User, evidence_id: str) -> Evidence:
    evidence = await session.scalar(
        select(Evidence).where(Evidence.id == evidence_id, Evidence.org_id == actor.org_id)
    )
    if evidence is None:
        raise DomainError("NOT_FOUND", "Evidence not found.", 404)
    await authorize_run(session, actor, evidence.run_id)
    return evidence


async def evidence_content_response(
    session: AsyncSession, actor: User, evidence_id: str
) -> Response:
    evidence = await authorize_evidence(session, actor, evidence_id)
    if evidence.media_type not in {"image/jpeg", "image/png"}:
        raise DomainError("EVIDENCE_INVALID", "This evidence is not a supported image.", 409)
    content = await get_storage().read(evidence.object_key, expected_sha256=evidence.sha256)
    await asyncio.to_thread(image_dimensions, content, evidence.media_type)
    extension = "jpg" if evidence.media_type == "image/jpeg" else "png"
    return Response(
        content,
        media_type=evidence.media_type,
        headers={
            "Cache-Control": "private, no-store",
            "Content-Disposition": f'inline; filename="tara-evidence-{evidence.id}.{extension}"',
            "X-Content-Type-Options": "nosniff",
        },
    )
