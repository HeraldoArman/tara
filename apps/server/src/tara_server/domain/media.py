import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tara_server.auth import require_roles
from tara_server.db.models import SOPDocument, SOPMedia, User
from tara_server.domain.execution import audit
from tara_server.domain.sops import authorized_version
from tara_server.errors import DomainError
from tara_server.images import image_dimensions
from tara_server.storage import get_storage


def media_json(media: SOPMedia):
    return {
        "id": media.id,
        "title": media.title,
        "heading": media.heading,
        "page": media.page,
        "width": media.width,
        "height": media.height,
        "sha256": media.sha256,
        "mediaType": media.media_type,
        "urlEndpoint": f"/api/v1/sop-media/{media.id}/url",
    }


async def import_media(
    session: AsyncSession,
    actor: User,
    version_id: str,
    content: bytes,
    media_type: str,
    title: str,
    heading: str,
    page: int | None,
):
    require_roles(actor, "sop_manager", "owner")
    version = await authorized_version(session, actor, version_id)
    if version.status != "draft":
        raise DomainError(
            "TRANSITION_REJECTED",
            "Published SOP reference media is immutable. Create a new draft version.",
            409,
        )
    document = await session.get(SOPDocument, version.document_id) if version.document_id else None
    if not document or not any(
        s.get("heading") == heading and s.get("page") == page for s in document.sections
    ):
        raise DomainError(
            "VALIDATION_FAILED",
            "Media must cite an extracted heading/page in this draft's source.",
            422,
        )
    if not title.strip() or len(title) > 300 or len(heading) > 300:
        raise DomainError(
            "VALIDATION_FAILED", "Provide a reference title and supported source heading.", 422
        )
    width, height = await asyncio.to_thread(image_dimensions, content, media_type)
    key, digest = await get_storage().put(content, media_type)
    media = SOPMedia(
        org_id=actor.org_id,
        version_id=version.id,
        title=title.strip(),
        heading=heading,
        page=page,
        object_key=key,
        sha256=digest,
        media_type=media_type,
        size_bytes=len(content),
        width=width,
        height=height,
    )
    session.add(media)
    await session.flush()
    audit(
        session,
        actor,
        None,
        "sop.reference_uploaded",
        {"sopVersionId": version.id, "mediaId": media.id},
    )
    return media_json(media)


async def authorize_media(session: AsyncSession, actor: User, media_id: str) -> SOPMedia:
    media = await session.scalar(
        select(SOPMedia).where(SOPMedia.id == media_id, SOPMedia.org_id == actor.org_id)
    )
    if not media:
        raise DomainError("NOT_FOUND", "SOP reference media not found.", 404)
    await authorized_version(session, actor, media.version_id)
    return media
