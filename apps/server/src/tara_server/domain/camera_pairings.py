"""Revocable camera-only phone capabilities, bound to one assigned execution."""

import asyncio
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from livekit import api
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tara_server.db.models import CameraPairing, Run, User, now, uid
from tara_server.domain.execution import audit, authorize_run, iso
from tara_server.errors import DomainError
from tara_server.settings import get_settings

OPEN_RUNS = {"active", "paused"}
CLAIM_LIFETIME = timedelta(minutes=10)
PAIRED_LIFETIME = timedelta(hours=8)


def participant_identity(pairing: CameraPairing) -> str:
    return f"tara-camera-{pairing.id}"


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=value.tzinfo or UTC)


def _configured():
    settings = get_settings()
    if not all((settings.livekit_url, settings.livekit_api_key, settings.livekit_api_secret)):
        raise DomainError(
            "PROVIDER_UNAVAILABLE", "Phone camera pairing is not configured for this session.", 503
        )
    return settings


async def _ensure_room(run_id: str) -> None:
    settings = _configured()
    try:
        async with asyncio.timeout(6):
            async with api.LiveKitAPI(
                settings.livekit_url, settings.livekit_api_key, settings.livekit_api_secret
            ) as client:
                room = await client.room.create_room(
                    api.CreateRoomRequest(
                        name=f"tara-run-{run_id}", empty_timeout=300, max_participants=3
                    )
                )
    except Exception:
        raise DomainError(
            "PROVIDER_UNAVAILABLE", "The phone camera room is unavailable. Try again shortly.", 503
        ) from None
    if room.max_participants and room.max_participants < 3:
        raise DomainError(
            "TRANSITION_REJECTED",
            "This older session has no room for a phone camera. Start a new session to use phone pairing.",
            409,
        )


async def _remove_participant(
    session: AsyncSession, actor: User, run: Run, pairing: CameraPairing
) -> None:
    if pairing.claimed_at is None:
        return
    try:
        settings = _configured()
        async with asyncio.timeout(5):
            async with api.LiveKitAPI(
                settings.livekit_url, settings.livekit_api_key, settings.livekit_api_secret
            ) as client:
                await client.room.remove_participant(
                    api.RoomParticipantIdentity(
                        room=f"tara-run-{run.id}", identity=participant_identity(pairing)
                    )
                )
    except api.ServerError as error:
        if error.code == api.ServerErrorCode.NOT_FOUND:
            return
        audit(session, actor, run, "camera_pairing.removal_failed", {"pairingId": pairing.id})
    except Exception:
        # Revocation still commits. The worker stops selecting this identity and
        # the phone's capability-status poll also stops its local media.
        audit(session, actor, run, "camera_pairing.removal_failed", {"pairingId": pairing.id})


async def _current(session: AsyncSession, run_id: str) -> CameraPairing | None:
    return await session.scalar(
        select(CameraPairing).where(
            CameraPairing.run_id == run_id, CameraPairing.revoked_at.is_(None)
        )
    )


def _pairing_json(pairing: CameraPairing) -> dict:
    return {
        "id": pairing.id,
        "expiresAt": iso(pairing.expires_at),
        "participantIdentity": participant_identity(pairing),
        "claimed": pairing.claimed_at is not None,
    }


async def create_pairing(session: AsyncSession, actor: User, run_id: str) -> dict:
    run = await authorize_run(session, actor, run_id, mutate=True)
    if run.status not in OPEN_RUNS:
        raise DomainError("TRANSITION_REJECTED", "This session is already closed.", 409)
    await _ensure_room(run.id)
    previous = await _current(session, run.id)
    if previous:
        previous.revoked_at = now()
        audit(session, actor, run, "camera_pairing.revoked", {"pairingId": previous.id})
        await session.flush()
        await _remove_participant(session, actor, run, previous)
    secret = secrets.token_urlsafe(32)
    pairing = CameraPairing(
        id=uid(),
        org_id=actor.org_id,
        run_id=run.id,
        created_by=actor.id,
        secret_hash=hashlib.sha256(secret.encode()).hexdigest(),
        expires_at=now() + CLAIM_LIFETIME,
    )
    session.add(pairing)
    await session.flush()
    audit(session, actor, run, "camera_pairing.created", {"pairingId": pairing.id})
    return {key: value for key, value in _pairing_json(pairing).items() if key != "claimed"} | {
        "token": secret
    }


async def pairing_state(session: AsyncSession, actor: User, run_id: str) -> dict:
    run = await authorize_run(session, actor, run_id)
    pairing = await _current(session, run.id)
    if run.status not in OPEN_RUNS or not pairing or _utc(pairing.expires_at) <= now():
        return {"pairing": None}
    creator = await session.get(User, pairing.created_by)
    if not _creator_valid(creator, run, pairing):
        return {"pairing": None}
    return {"pairing": _pairing_json(pairing)}


async def revoke_pairing(session: AsyncSession, actor: User, run_id: str) -> dict:
    run = await authorize_run(session, actor, run_id, mutate=True)
    pairing = await _current(session, run.id)
    if pairing:
        pairing.revoked_at = now()
        audit(session, actor, run, "camera_pairing.revoked", {"pairingId": pairing.id})
        await session.flush()
        await _remove_participant(session, actor, run, pairing)
    return {"revoked": True}


def _creator_valid(creator: User | None, run: Run, pairing: CameraPairing) -> bool:
    return bool(
        creator
        and creator.active
        and creator.role in {"technician", "owner"}
        and creator.org_id == pairing.org_id == run.org_id
        and creator.id == run.technician_id
    )


async def _capability(
    session: AsyncSession, pairing_id: str, secret: str, *, lock: bool
) -> tuple[CameraPairing, User, Run]:
    pairing = await session.get(CameraPairing, pairing_id)
    digest = hashlib.sha256(secret.encode()).hexdigest()
    if not pairing or not hmac.compare_digest(pairing.secret_hash, digest):
        raise DomainError("NOT_FOUND", "This phone camera link is not available.", 404)
    creator = await session.get(User, pairing.created_by)
    if not creator or not creator.active:
        raise DomainError("PAIRING_EXPIRED", "This phone camera link is no longer active.", 410)
    try:
        run = await authorize_run(session, creator, pairing.run_id, mutate=lock)
    except DomainError:
        raise DomainError(
            "PAIRING_EXPIRED", "This phone camera link is no longer active.", 410
        ) from None
    if lock:
        # Lock order is always run first. Refresh after waiting so replacement or
        # revocation committed by another request cannot be claimed from cache.
        await session.refresh(pairing)
    if (
        pairing.revoked_at is not None
        or _utc(pairing.expires_at) <= now()
        or run.status not in OPEN_RUNS
        or not _creator_valid(creator, run, pairing)
    ):
        raise DomainError("PAIRING_EXPIRED", "This phone camera link expired or was unpaired.", 410)
    return pairing, creator, run


async def phone_connection(session: AsyncSession, pairing_id: str, secret: str) -> dict:
    pairing, creator, run = await _capability(session, pairing_id, secret, lock=True)
    settings = _configured()
    await _ensure_room(run.id)
    if pairing.claimed_at is None:
        pairing.claimed_at = now()
        pairing.expires_at = pairing.claimed_at + PAIRED_LIFETIME
        audit(session, creator, run, "camera_pairing.claimed", {"pairingId": pairing.id})
        await session.flush()
    identity = participant_identity(pairing)
    remaining = max(1, int((_utc(pairing.expires_at) - now()).total_seconds()))
    token = (
        api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(identity)
        .with_name("Paired phone camera")
        .with_ttl(timedelta(seconds=min(600, remaining)))
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=f"tara-run-{run.id}",
                can_publish=True,
                can_publish_sources=["camera"],
                can_subscribe=False,
                can_publish_data=False,
                can_update_own_metadata=False,
                can_manage_agent_session=False,
            )
        )
        .to_jwt()
    )
    return {
        "url": settings.livekit_url,
        "token": token,
        "roomName": f"tara-run-{run.id}",
        "participantIdentity": identity,
        "expiresAt": iso(pairing.expires_at),
    }


async def phone_status(session: AsyncSession, pairing_id: str, secret: str) -> dict:
    try:
        pairing, _creator, _run = await _capability(session, pairing_id, secret, lock=False)
    except DomainError:
        return {"active": False, "expiresAt": None}
    return {"active": True, "expiresAt": iso(pairing.expires_at)}


async def camera_identity(session: AsyncSession, actor: User, run_id: str) -> str:
    run = await authorize_run(session, actor, run_id, mutate=True)
    if run.status not in OPEN_RUNS:
        raise DomainError("TRANSITION_REJECTED", "This session is already closed.", 409)
    pairing = await _current(session, run.id)
    if (
        pairing
        and pairing.claimed_at is not None
        and _utc(pairing.expires_at) > now()
        and pairing.created_by == actor.id
        and _creator_valid(actor, run, pairing)
    ):
        return participant_identity(pairing)
    return actor.id
