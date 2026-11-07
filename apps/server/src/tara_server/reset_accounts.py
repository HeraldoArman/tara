"""Reset existing workshop logins from an authorized private database operator shell."""

import argparse
import asyncio
import os

from sqlalchemy import select

from tara_server.auth import password_hasher
from tara_server.db.models import User
from tara_server.db.session import session_factory
from tara_server.domain.execution import audit


async def reset_accounts(owner_name: str | None, technician_name: str | None, minimum: int):
    password = os.environ.get("TARA_ACCOUNT_RESET_PASSWORD", "")
    if not minimum <= len(password) <= 1024:
        raise SystemExit(f"Set TARA_ACCOUNT_RESET_PASSWORD to at least {minimum} characters.")
    async with session_factory() as session:
        async with session.begin():
            owners = list(
                (
                    await session.scalars(
                        select(User)
                        .where(User.role == "owner", User.active.is_(True))
                        .with_for_update()
                    )
                ).all()
            )
            owner = next(
                (user for user in owners if user.username == (owner_name or "owner")), None
            )
            if owner is None and owner_name is None and len(owners) == 1:
                owner = owners[0]
            if owner is None:
                raise SystemExit("Select one active owner with --owner; no accounts were changed.")
            technicians = list(
                (
                    await session.scalars(
                        select(User)
                        .where(
                            User.org_id == owner.org_id,
                            User.role == "technician",
                            User.active.is_(True),
                        )
                        .with_for_update()
                    )
                ).all()
            )
            technician = next(
                (
                    user
                    for user in technicians
                    if user.username == (technician_name or "technician")
                ),
                None,
            )
            if technician is None and technician_name is None and len(technicians) == 1:
                technician = technicians[0]
            if technician is None:
                raise SystemExit(
                    "Select one technician in the owner's organization with --technician; "
                    "no accounts were changed. Candidates: "
                    + ", ".join(user.username for user in technicians)
                )
            for user in (owner, technician):
                user.password_hash = password_hasher.hash(password)
                audit(
                    session,
                    owner,
                    None,
                    "user.password_reset",
                    {"userId": user.id, "role": user.role, "source": "authorized_operator"},
                )
            names = [owner.username, technician.username]
    print("Requested account password reset completed: " + ", ".join(names))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--owner", help="Existing owner login; defaults only when unambiguous.")
    parser.add_argument("--technician", help="Existing technician in that owner's organization.")
    parser.add_argument("--allow-short-password", action="store_true")
    args = parser.parse_args()
    asyncio.run(reset_accounts(args.owner, args.technician, 8 if args.allow_short_password else 16))


if __name__ == "__main__":
    main()
