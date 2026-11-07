"""Explicit demonstration seed. Never creates fabricated attempts, evidence or reports."""

import argparse
import asyncio
import os

from sqlalchemy import select

from tara_server.auth import password_hasher
from tara_server.db.models import (
    SOP,
    Organization,
    Part,
    SOPChunk,
    SOPDocument,
    SOPVersion,
    User,
    WorkOrder,
    now,
    uid,
)
from tara_server.db.session import session_factory
from tara_server.schemas import SOPDefinition
from tara_server.settings import get_settings
from tara_server.storage import get_storage


def step(
    step_id,
    title,
    instruction,
    kind="attestation",
    rationale="",
    criteria=None,
    options=None,
    pass_options=None,
    fail="retry",
):
    return {
        "id": step_id,
        "title": title,
        "instruction": instruction,
        "rationale": rationale,
        "sources": [{"heading": title, "page": None}],
        "verification": {
            "kind": kind,
            "criteria": criteria or [],
            "options": options or [],
            "passOptions": pass_options or [],
            "acceptedResponse": "confirmed",
        },
        "onPass": {"action": "next"},
        "onFail": {"action": fail},
        "referenceMediaIds": [],
        "required": True,
    }


def definitions():
    return [
        {
            "sopKey": "SOP-KBD-01",
            "version": "1.4.0",
            "title": "Keyboard switch replacement",
            "scope": "Demonstration procedure for a supported hot-swap keyboard.",
            "prerequisites": [
                "Confirm hot-swap compatibility",
                "ESD-safe bench",
                "Approved replacement switch",
            ],
            "steps": [
                step(
                    "identify",
                    "Confirm device identity",
                    "Match the keyboard model to the work order. Disconnect power and confirm the ESD-safe bench is ready.",
                    rationale="Prevent work on the wrong asset and accidental powered service.",
                ),
                step(
                    "inspect-switch",
                    "Inspect the switch",
                    "Remove the keycap and place the complete switch housing clearly in view.",
                    "visual",
                    "The switch cannot be inspected through a fitted keycap.",
                    [
                        {"id": "keycap-removed", "description": "The keycap is fully removed"},
                        {
                            "id": "switch-visible",
                            "description": "The complete switch housing is clearly visible",
                        },
                    ],
                ),
                step(
                    "replace-switch",
                    "Fit the replacement switch",
                    "Confirm straight switch pins, align them to the hot-swap socket and seat the switch flush without force.",
                    "visual",
                    "Bent pins and forced insertion can damage the socket.",
                    [
                        {
                            "id": "switch-flush",
                            "description": "The replacement switch sits flush with the plate",
                        },
                        {
                            "id": "housing-intact",
                            "description": "The visible switch housing is intact and aligned",
                        },
                    ],
                ),
                step(
                    "test-key",
                    "Test the repaired key",
                    "Reconnect the keyboard and press the repaired key five times. Choose the observed result.",
                    "choice",
                    options=["registers-every-press", "double-types", "no-response"],
                    pass_options=["registers-every-press"],
                    fail="hold",
                ),
                step(
                    "finalize",
                    "Final inspection and close",
                    "Confirm the keycap is refitted, tools are removed and the repaired device is ready for handoff.",
                    "finalization",
                ),
            ],
            "allowPartialClose": True,
        },
        {
            "sopKey": "SOP-KBD-02",
            "version": "1.2.0",
            "title": "Keyboard cleaning and inspection",
            "scope": "Demonstration dry cleaning of an unplugged keyboard.",
            "prerequisites": ["Unplugged keyboard", "Approved dry brush"],
            "steps": [
                step(
                    "identify",
                    "Confirm and isolate device",
                    "Match the work-order serial and disconnect the keyboard.",
                ),
                step(
                    "clean",
                    "Clean the keyboard",
                    "Use the approved dry brush to remove loose debris; do not introduce liquid.",
                    "visual",
                    criteria=[
                        {
                            "id": "surface-clear",
                            "description": "The keyboard surface is visibly free of loose debris",
                        }
                    ],
                ),
                step(
                    "test",
                    "Test all keys",
                    "Reconnect and test the keys. Record whether each key registers correctly.",
                    "choice",
                    options=["all-keys-pass", "key-failure"],
                    pass_options=["all-keys-pass"],
                    fail="hold",
                ),
                step(
                    "finalize",
                    "Complete handoff inspection",
                    "Confirm the exterior is dry and clean, and all tools have been removed.",
                    "finalization",
                ),
            ],
            "allowPartialClose": True,
        },
        {
            "sopKey": "SOP-KBD-03",
            "version": "2.0.0",
            "title": "Stabilizer inspection and service",
            "scope": "Demonstration inspection for supported removable keycap stabilizers.",
            "prerequisites": ["Unplugged supported keyboard", "Keycap puller"],
            "steps": [
                step(
                    "identify",
                    "Confirm device identity",
                    "Match the work order and disconnect keyboard power.",
                ),
                step(
                    "remove-keycap",
                    "Remove the stabilized keycap",
                    "Remove the keycap evenly using the approved puller.",
                    "visual",
                    criteria=[
                        {
                            "id": "keycap-removed",
                            "description": "The stabilized keycap is removed and both stabilizer stems are visible",
                        }
                    ],
                ),
                step(
                    "inspect",
                    "Inspect stabilizer components",
                    "Inspect the visible housings and wire. Stop and escalate if a component is damaged.",
                    "choice",
                    options=["intact", "damaged"],
                    pass_options=["intact"],
                    fail="escalate",
                ),
                step(
                    "service",
                    "Clean the stabilizer area",
                    "Use the approved dry brush to remove loose debris without applying lubricant or liquids.",
                ),
                step(
                    "refit",
                    "Refit the keycap",
                    "Align the keycap and press evenly until both sides are seated.",
                    "visual",
                    criteria=[
                        {
                            "id": "even-seating",
                            "description": "The stabilized keycap is evenly seated on both sides",
                        }
                    ],
                ),
                step(
                    "test",
                    "Test stabilized key travel",
                    "Reconnect and press the stabilized key five times. Record the result.",
                    "choice",
                    options=["consistent-travel", "binding-or-no-response"],
                    pass_options=["consistent-travel"],
                    fail="hold",
                ),
                step(
                    "finalize",
                    "Complete final inspection",
                    "Confirm consistent travel, a clean work surface and no loose tools.",
                    "finalization",
                ),
            ],
            "allowPartialClose": True,
        },
    ]


async def seed(session, password: str):
    if await session.scalar(
        select(Organization).where(
            Organization.name.in_(["tara demonstration workshop", "TARa demonstration workshop"])
        )
    ):
        return
    org = Organization(id=uid(), name="tara demonstration workshop")
    session.add(org)
    await session.flush()
    users = {}
    for role, name in [
        ("technician", "Demo Technician"),
        ("supervisor", "Demo Supervisor"),
        ("sop_manager", "Demo SOP Manager"),
        ("owner", "Demo Owner"),
    ]:
        user = User(
            id=uid(),
            org_id=org.id,
            username=role,
            name=name,
            role=role,
            active=True,
            password_hash=password_hasher.hash(password),
        )
        session.add(user)
        users[role] = user
    await session.flush()
    for i, raw in enumerate(definitions()):
        definition = SOPDefinition.model_validate(raw).model_dump(mode="json", by_alias=True)
        sections = [
            {"heading": s["title"], "page": None, "text": f"{s['instruction']}\n{s['rationale']}"}
            for s in definition["steps"]
        ]
        content = "\n\n".join(f"# {s['heading']}\n{s['text']}" for s in sections).encode()
        key, digest = await get_storage().put(content, "text/markdown")
        doc = SOPDocument(
            id=uid(),
            org_id=org.id,
            filename=f"demo-{raw['sopKey']}.md",
            object_key=key,
            sha256=digest,
            sections=sections,
        )
        sop = SOP(id=uid(), org_id=org.id, key=definition["sopKey"], title=definition["title"])
        session.add_all([doc, sop])
        await session.flush()
        version = SOPVersion(
            id=uid(),
            org_id=org.id,
            sop_id=sop.id,
            document_id=doc.id,
            version_number=1,
            version=definition["version"],
            status="published",
            definition=definition,
            created_by=users["sop_manager"].id,
            published_at=now(),
        )
        session.add(version)
        await session.flush()
        for section in sections:
            session.add(
                SOPChunk(
                    org_id=org.id,
                    version_id=version.id,
                    heading=section["heading"],
                    page=None,
                    content=section["text"],
                    media_ids=[],
                )
            )
        session.add(
            WorkOrder(
                org_id=org.id,
                reference=f"WO-{1042 + i}",
                title=definition["title"],
                model=["Keychron K2", "Logitech MX Keys", "Keychron Q1"][i],
                serial=f"DEMO-{88214 + i}",
                issue=[
                    "Demonstration: E key intermittently registers twice.",
                    "Demonstration: debris between keys.",
                    "Demonstration: spacebar travel is uneven.",
                ][i],
                priority="priority" if i == 0 else "standard",
                assigned_to=users["technician"].id,
                sop_version_id=version.id,
                estimated_minutes=15 + i * 10,
            )
        )
    for sku, name, stock, location, price in [
        ("SW-GAT-BRN", "Gateron Brown hot-swap switch", 48, "Bench A · Bin 04", 65),
        ("TOOL-PULLER", "Wire keycap and switch puller", 6, "Tool wall · A2", 950),
        ("TOOL-BRUSH", "ESD-safe dry cleaning brush", 8, "Tool wall · B1", 720),
    ]:
        session.add(
            Part(
                org_id=org.id,
                sku=sku,
                name=name,
                stock=stock,
                location=location,
                price_cents=price,
                currency="USD",
            )
        )
    await session.flush()


async def bootstrap_owner(session):
    username = os.environ.get("BOOTSTRAP_OWNER_USERNAME", "").strip()
    password = os.environ.get("BOOTSTRAP_OWNER_PASSWORD", "")
    organization = os.environ.get("BOOTSTRAP_ORGANIZATION", "tara workshop").strip()
    if not username or len(password) < 16 or not organization:
        raise SystemExit(
            "Owner bootstrap requires BOOTSTRAP_OWNER_USERNAME, BOOTSTRAP_OWNER_PASSWORD (16+ characters), and organization name."
        )
    existing = await session.scalar(select(User).where(User.username == username))
    if existing:
        if existing.role != "owner":
            raise SystemExit("The username already belongs to a non-owner account.")
        return
    org = Organization(id=uid(), name=organization)
    session.add(org)
    await session.flush()
    session.add(
        User(
            org_id=org.id,
            username=username,
            name="Workshop Owner",
            role="owner",
            password_hash=password_hasher.hash(password),
            active=True,
        )
    )
    await session.flush()


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--owner-only",
        action="store_true",
        help="Provision initial organization/owner from explicit runtime secrets.",
    )
    args = parser.parse_args()
    settings = get_settings()
    if args.owner_only:
        async with session_factory() as session:
            await bootstrap_owner(session)
            await session.commit()
        print("Initial organization and owner provisioned. No demonstration data created.")
        return
    if settings.environment == "production":
        raise SystemExit(
            "Demonstration fixtures cannot be seeded in production. Use --owner-only for initial owner provisioning."
        )
    if not settings.demo_password or len(settings.demo_password) < 10:
        raise SystemExit(
            "Set DEMO_PASSWORD (at least 10 characters) to create labeled demonstration accounts."
        )
    async with session_factory() as session:
        await seed(session, settings.demo_password)
        await session.commit()
    print(
        "Demonstration data ready. Usernames: technician, supervisor, sop_manager, owner. Password comes from DEMO_PASSWORD."
    )


if __name__ == "__main__":
    asyncio.run(main())
