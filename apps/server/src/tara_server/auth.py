from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Cookie, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tara_server.db.models import User
from tara_server.db.session import get_session
from tara_server.errors import DomainError
from tara_server.settings import get_settings

password_hasher = PasswordHasher()
COOKIE_NAME = "tara_session"


def user_json(user: User) -> dict:
    return {
        "id": user.id,
        "organizationId": user.org_id,
        "username": user.username,
        "name": user.name,
        "role": user.role,
    }


def token_for(user: User) -> str:
    settings = get_settings()
    current = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": user.id,
            "org": user.org_id,
            "role": user.role,
            "iss": settings.jwt_issuer,
            "iat": current,
            "exp": current + timedelta(hours=settings.jwt_expire_hours),
        },
        settings.jwt_secret,
        algorithm="HS256",
    )


async def authenticate(session: AsyncSession, username: str, password: str) -> User:
    user = await session.scalar(select(User).where(User.username == username))
    try:
        password_hasher.verify(
            user.password_hash
            if user
            else "$argon2id$v=19$m=65536,t=3,p=4$T2JqQ2FkZW1vU2FsdDEyMw$"
            "vPV/3h4lxHpS6iGc2r4R5BDDx8uJDVyIuI1yNLbGZ5s",
            password,
        )
    except (VerificationError, InvalidHashError):
        raise DomainError("UNAUTHORIZED", "Invalid username or password.", 401) from None
    if user is None or not user.active:
        raise DomainError("UNAUTHORIZED", "Invalid username or password.", 401)
    return user


async def current_user(
    tara_session: str | None = Cookie(default=None),
    session: AsyncSession = Depends(get_session, scope="function"),
) -> User:
    settings = get_settings()
    try:
        claims = jwt.decode(
            tara_session or "",
            settings.jwt_secret,
            algorithms=["HS256"],
            issuer=settings.jwt_issuer,
            options={"require": ["sub", "org", "role", "iat", "exp", "iss"]},
        )
    except jwt.InvalidTokenError:
        raise DomainError("UNAUTHORIZED", "Sign in to continue.", 401) from None
    user = await session.get(User, claims["sub"])
    if not user or not user.active or user.org_id != claims["org"] or user.role != claims["role"]:
        raise DomainError("UNAUTHORIZED", "Your session is no longer valid. Sign in again.", 401)
    return user


def require_roles(user: User, *roles: str):
    if user.role not in roles:
        raise DomainError("FORBIDDEN", "Your role does not allow this action.", 403)
