import pytest
from pydantic import ValidationError

from tara_server.auth import authenticate, token_for
from tara_server.db.models import Organization, User, uid
from tara_server.domain import execution
from tara_server.domain.sops import extract_sections, publish, search_sop, validate_definition
from tara_server.errors import DomainError
from tara_server.schemas import Command
from tara_server.seed import definitions


async def test_assignment_and_organization_cannot_be_overridden(workshop):
    session, users, work = workshop
    snapshot = await execution.create_run(session, users["technician"], work.id)
    other = User(
        id=uid(),
        org_id=users["technician"].org_id,
        username="another-technician",
        name="Another technician",
        role="technician",
        active=True,
        password_hash="unused",
    )
    session.add(other)
    await session.flush()
    with pytest.raises(DomainError) as error:
        await execution.get_run_snapshot(session, other, snapshot["id"])
    assert error.value.code == "FORBIDDEN"
    org = Organization(id=uid(), name="Other organization")
    session.add(org)
    await session.flush()
    foreign = User(
        id=uid(),
        org_id=org.id,
        username="foreign-owner",
        name="Foreign owner",
        role="owner",
        active=True,
        password_hash="unused",
    )
    session.add(foreign)
    await session.flush()
    with pytest.raises(DomainError) as error:
        await execution.get_run_snapshot(session, foreign, snapshot["id"])
    assert error.value.code == "NOT_FOUND"
    with pytest.raises(ValidationError):
        Command(expectedVersion=1, idempotencyKey="test-command", organizationId=org.id)


async def test_publication_immutable_and_retrieval_pinned(workshop):
    session, users, work = workshop
    with pytest.raises(DomainError) as error:
        await publish(session, users["sop_manager"], work.sop_version_id)
    assert error.value.code == "TRANSITION_REJECTED"
    result = await search_sop(session, users["technician"], work.sop_version_id, "keycap removed")
    assert 1 <= len(result["items"]) <= 3
    assert all(chunk["heading"] for chunk in result["items"])
    assert result["sopVersionId"] == work.sop_version_id


async def test_login_uses_password_hashes_and_disabled_users_are_rejected(workshop):
    session, users, _work = workshop
    user = await authenticate(session, "technician", "test-password-2026")
    assert user.id == users["technician"].id
    assert user.password_hash.startswith("$argon2id$")
    assert token_for(user).count(".") == 2
    with pytest.raises(DomainError):
        await authenticate(session, "technician", "wrong-password")
    user.active = False
    with pytest.raises(DomainError):
        await authenticate(session, "technician", "test-password-2026")


def test_source_validation_rejects_binary_fake_pdf_and_unresolved_citations():
    for filename, content in [
        ("attack.docx", b"PK"),
        ("fake.pdf", b"not pdf"),
        ("binary.txt", b"\0invalid"),
    ]:
        with pytest.raises(DomainError):
            extract_sections(filename, content)
    definition = definitions()[0]
    errors = validate_definition(definition, [{"heading": "Wrong source", "page": None}])
    assert any("citation" in error for error in errors)
    definition["steps"][1]["id"] = definition["steps"][0]["id"]
    assert any("unique" in error for error in validate_definition(definition, []))


async def test_sop_json_mode_request_includes_json_task_and_disables_provider_storage(monkeypatch):
    import json

    import httpx

    from tara_server.domain.sops import decompose
    from tara_server.settings import get_settings

    monkeypatch.setattr(get_settings(), "sop_openai_api_key", "unit-test-only")
    definition = definitions()[0]
    requests = []

    async def respond(request):
        body = json.loads(request.content)
        requests.append(body)
        assert "json" in body["input"].lower()
        assert json.loads(body["input"])["sections"][0]["heading"] == "Source heading"
        assert body["store"] is False
        return httpx.Response(
            200,
            json={
                "output": [{"content": [{"type": "output_text", "text": json.dumps(definition)}]}]
            },
        )

    original = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(respond), **kwargs),
    )
    draft = await decompose(
        [{"heading": "Source heading", "page": None, "text": "Untrusted source text."}]
    )
    assert draft.sop_key == definition["sopKey"]
    assert len(requests) == 1
