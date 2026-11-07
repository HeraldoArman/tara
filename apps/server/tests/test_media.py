import copy
import io

import pytest
from PIL import Image

from tara_server.db.models import SOPVersion, uid
from tara_server.domain.media import authorize_media, import_media
from tara_server.domain.sops import publish, search_sop
from tara_server.errors import DomainError
from tara_server.images import image_dimensions


def jpeg():
    output = io.BytesIO()
    Image.new("RGB", (80, 50), "white").save(output, format="JPEG")
    return output.getvalue()


async def test_managed_reference_media_citation_authorization_and_immutable_publish(workshop):
    session, users, work = workshop
    published = await session.get(SOPVersion, work.sop_version_id)
    draft = SOPVersion(
        id=uid(),
        org_id=published.org_id,
        sop_id=published.sop_id,
        document_id=published.document_id,
        version_number=2,
        version="1.4.1",
        status="draft",
        definition=copy.deepcopy(published.definition),
        created_by=users["sop_manager"].id,
    )
    session.add(draft)
    await session.flush()
    reference = await import_media(
        session,
        users["sop_manager"],
        draft.id,
        jpeg(),
        "image/jpeg",
        "Approved switch reference",
        "Inspect the switch",
        None,
    )
    assert reference["width"] == 80
    assert reference["height"] == 50
    assert reference["urlEndpoint"].endswith("/url")
    with pytest.raises(DomainError):
        await authorize_media(session, users["technician"], reference["id"])
    definition = copy.deepcopy(draft.definition)
    definition["steps"][1]["referenceMediaIds"] = [reference["id"]]
    draft.definition = definition
    result = await publish(session, users["sop_manager"], draft.id)
    assert result["media"][0]["id"] == reference["id"]
    assert await authorize_media(session, users["technician"], reference["id"])
    retrieved = await search_sop(session, users["technician"], draft.id, "keycap switch")
    assert any(item["id"] == reference["id"] for item in retrieved["media"])
    with pytest.raises(DomainError):
        await import_media(
            session,
            users["sop_manager"],
            draft.id,
            jpeg(),
            "image/jpeg",
            "Changed reference",
            "Inspect the switch",
            None,
        )


async def test_nonexistent_reference_id_blocks_publication(workshop):
    session, users, work = workshop
    published = await session.get(SOPVersion, work.sop_version_id)
    definition = copy.deepcopy(published.definition)
    definition["steps"][0]["referenceMediaIds"] = ["unknown-media"]
    draft = SOPVersion(
        org_id=published.org_id,
        sop_id=published.sop_id,
        document_id=published.document_id,
        version_number=2,
        version="1.4.1",
        status="draft",
        definition=definition,
        created_by=users["sop_manager"].id,
    )
    session.add(draft)
    await session.flush()
    with pytest.raises(DomainError) as error:
        await publish(session, users["sop_manager"], draft.id)
    assert error.value.code == "VALIDATION_FAILED"
    assert any("reference media" in item for item in error.value.details["errors"])


def test_actual_image_signature_and_dimensions_are_required():
    assert image_dimensions(jpeg(), "image/jpeg") == (80, 50)
    with pytest.raises(DomainError):
        image_dimensions(b"not-a-real-image", "image/jpeg")
    with pytest.raises(DomainError):
        image_dimensions(jpeg(), "image/png")
