"""Operator-only provisioning; passwords are read from runtime environment, never CLI flags."""

import argparse
import asyncio
import json
import os
from pathlib import Path
from typing import Literal

from pydantic import Field
from sqlalchemy import select

from tara_server.auth import authenticate, password_hasher, require_roles
from tara_server.db.models import Part, SOPVersion, User, WorkOrder
from tara_server.db.session import session_factory
from tara_server.domain.execution import audit
from tara_server.errors import DomainError
from tara_server.schemas import Schema


class AssetInput(Schema):
    model: str = Field(min_length=1, max_length=200)
    serial: str = Field(min_length=1, max_length=200)


class WorkOrderInput(Schema):
    reference: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=300)
    asset: AssetInput
    issue: str = Field(min_length=1, max_length=4000)
    priority: Literal["priority", "standard"] = "standard"
    assigned_username: str
    sop_version_id: str
    estimated_minutes: int = Field(default=20, ge=1, le=10080)


class PartInput(Schema):
    sku: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=300)
    stock: int = Field(ge=0)
    location: str = Field(min_length=1, max_length=200)
    price_cents: int = Field(ge=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)


async def provision_user(session, owner: User, username: str, name: str, role: str, password: str):
    require_roles(owner, "owner")
    if role not in {"technician", "supervisor", "sop_manager", "owner"}:
        raise DomainError("VALIDATION_FAILED", "Choose a supported role.", 422)
    if (
        not username.strip()
        or len(username) > 100
        or not name.strip()
        or len(name) > 200
        or len(password) < 16
    ):
        raise DomainError(
            "VALIDATION_FAILED",
            "Provide username, name and a password of at least 16 characters.",
            422,
        )
    if await session.scalar(select(User).where(User.username == username)):
        raise DomainError(
            "VALIDATION_FAILED",
            "This username already exists; provisioning never replaces an existing account.",
            409,
        )
    user = User(
        org_id=owner.org_id,
        username=username,
        name=name,
        role=role,
        password_hash=password_hasher.hash(password),
        active=True,
    )
    session.add(user)
    await session.flush()
    audit(session, owner, None, "user.provisioned", {"userId": user.id, "role": role})
    return user


async def import_work_orders(session, owner: User, records: list):
    require_roles(owner, "owner")
    if len(records) > 500:
        raise DomainError("VALIDATION_FAILED", "Import at most 500 work orders per operation.", 422)
    for raw in records:
        record = WorkOrderInput.model_validate(raw)
        technician = await session.scalar(
            select(User).where(
                User.org_id == owner.org_id,
                User.username == record.assigned_username,
                User.active.is_(True),
                User.role.in_(["technician", "owner"]),
            )
        )
        version = await session.scalar(
            select(SOPVersion).where(
                SOPVersion.id == record.sop_version_id,
                SOPVersion.org_id == owner.org_id,
                SOPVersion.status == "published",
            )
        )
        if not technician or not version:
            raise DomainError(
                "VALIDATION_FAILED",
                "Each work order needs an active assigned technician and a published SOP from the owner's organization.",
                422,
            )
        if await session.scalar(
            select(WorkOrder).where(
                WorkOrder.org_id == owner.org_id, WorkOrder.reference == record.reference
            )
        ):
            raise DomainError(
                "VALIDATION_FAILED",
                "A work-order reference is already in use; imports never overwrite execution records.",
                409,
            )
        work = WorkOrder(
            org_id=owner.org_id,
            reference=record.reference,
            title=record.title,
            model=record.asset.model,
            serial=record.asset.serial,
            issue=record.issue,
            priority=record.priority,
            assigned_to=technician.id,
            sop_version_id=version.id,
            estimated_minutes=record.estimated_minutes,
        )
        session.add(work)
        await session.flush()
        audit(session, owner, None, "work_order.provisioned", {"workOrderId": work.id})


async def import_parts(session, owner: User, records: list):
    require_roles(owner, "owner")
    if len(records) > 1000:
        raise DomainError("VALIDATION_FAILED", "Import at most 1000 parts per operation.", 422)
    for raw in records:
        record = PartInput.model_validate(raw)
        if await session.scalar(
            select(Part).where(Part.org_id == owner.org_id, Part.sku == record.sku)
        ):
            raise DomainError(
                "VALIDATION_FAILED",
                "This part SKU already exists; imports never silently overwrite stock.",
                409,
            )
        session.add(Part(org_id=owner.org_id, **record.model_dump()))
    audit(session, owner, None, "parts.provisioned", {"count": len(records)})


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    user_parser = commands.add_parser("provision-user")
    user_parser.add_argument("--username", required=True)
    user_parser.add_argument("--name", required=True)
    user_parser.add_argument(
        "--role", choices=["technician", "supervisor", "sop_manager", "owner"], required=True
    )
    for name in ["import-work-orders", "import-parts"]:
        commands.add_parser(name).add_argument("file", type=Path)
    args = parser.parse_args()
    username = os.environ.get("ADMIN_OWNER_USERNAME", "")
    password = os.environ.get("ADMIN_OWNER_PASSWORD", "")
    if not username or not password:
        raise SystemExit(
            "Set ADMIN_OWNER_USERNAME and ADMIN_OWNER_PASSWORD in the operator environment."
        )
    try:
        async with session_factory() as session:
            async with session.begin():
                owner = await authenticate(session, username, password)
                require_roles(owner, "owner")
                if args.command == "provision-user":
                    await provision_user(
                        session,
                        owner,
                        args.username,
                        args.name,
                        args.role,
                        os.environ.get("PROVISION_USER_PASSWORD", ""),
                    )
                else:
                    if args.file.stat().st_size > 2 * 1024 * 1024:
                        raise DomainError(
                            "VALIDATION_FAILED", "Import files must be within 2 MB.", 422
                        )
                    records = json.loads(args.file.read_text())
                    if not isinstance(records, list):
                        raise DomainError(
                            "VALIDATION_FAILED", "Import a JSON array of records.", 422
                        )
                    if args.command == "import-work-orders":
                        await import_work_orders(session, owner, records)
                    else:
                        await import_parts(session, owner, records)
    except (DomainError, ValueError, OSError) as error:
        # Deliberately omit input payloads and credentials, including Pydantic validation inputs.
        raise SystemExit(
            error.message
            if isinstance(error, DomainError)
            else "The import file does not match the documented schema."
        ) from None
    print("Administrative provisioning completed. No existing execution history was overwritten.")


if __name__ == "__main__":
    asyncio.run(main())
