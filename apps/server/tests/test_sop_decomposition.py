import asyncio
import json

import httpx
import pytest

from tara_server.db.models import SOPDocument
from tara_server.domain import sops
from tara_server.errors import DomainError
from tara_server.settings import Settings

PRIVATE_KEY = "unit-test-private-api-key"
PRIVATE_OUTPUT = "private-provider-response-do-not-log"
PRIVATE_SOURCE = "private-source-text-do-not-log"
SECTIONS = [{"heading": "Equipment", "page": 1, "text": PRIVATE_SOURCE}]
DRAFT = {
    "sopKey": "SOP-TEST",
    "version": "1.0",
    "title": "Equipment inspection",
    "steps": [
        {
            "id": "inspect",
            "title": "Inspect equipment",
            "instruction": "Confirm that the equipment is ready for work.",
            "sources": [{"heading": "Equipment", "page": 1}],
            "verification": {"kind": "finalization"},
        }
    ],
}


def completed(text: str) -> dict:
    return {"status": "completed", "output": [{"content": [{"type": "output_text", "text": text}]}]}


@pytest.fixture
def provider(monkeypatch, tmp_path):
    settings = Settings(
        _env_file=None,
        environment="development",
        sop_openai_api_key=PRIVATE_KEY,
        evidence_backend="local",
        evidence_local_path=tmp_path / "evidence",
    )
    monkeypatch.setattr(sops, "get_settings", lambda: settings)
    original_client = httpx.AsyncClient
    requests = []
    options = []

    def install(handler):
        async def respond(request):
            requests.append(request)
            return await handler(request)

        def create_client(**kwargs):
            options.append(kwargs)
            return original_client(transport=httpx.MockTransport(respond), **kwargs)

        monkeypatch.setattr(httpx, "AsyncClient", create_client)
        return requests, options

    return install


def assert_safe_failure(error, caplog, reason, *, status=503, code="PROVIDER_UNAVAILABLE"):
    assert error.code == code
    assert error.status == status
    assert error.details["reason"] == reason
    assert set(error.details).issubset({"reason", "upstreamStatus", "documentId"})
    visible = f"{error.message} {error.details} {caplog.text}"
    for private in (PRIVATE_KEY, PRIVATE_OUTPUT, PRIVATE_SOURCE):
        assert private not in visible


async def test_valid_draft_uses_low_verbosity_and_bounded_provider_timeout(provider):
    async def respond(_request):
        return httpx.Response(200, json=completed(json.dumps(DRAFT)))

    requests, options = provider(respond)

    draft = await sops.decompose(SECTIONS)

    assert draft.sop_key == DRAFT["sopKey"]
    assert len(requests) == 1
    body = json.loads(requests[0].content)
    assert json.loads(body["input"])["sections"] == SECTIONS
    assert body["store"] is False
    assert body["reasoning"] == {"effort": "low"}
    assert body["text"] == {"format": {"type": "json_object"}, "verbosity": "low"}
    assert requests[0].headers["authorization"] == f"Bearer {PRIVATE_KEY}"
    assert options[0]["timeout"].connect == 5.0
    assert options[0]["timeout"].read == 60.0


async def test_hard_deadline_cancels_a_slow_provider(provider, monkeypatch, caplog):
    cancelled = asyncio.Event()

    async def respond(_request):
        try:
            await asyncio.sleep(1)
        except asyncio.CancelledError:
            cancelled.set()
            raise
        return httpx.Response(200, json=completed(json.dumps(DRAFT)))

    requests, _ = provider(respond)
    monkeypatch.setattr(sops, "SOP_DECOMPOSITION_TIMEOUT_SECONDS", 0.01)

    with pytest.raises(DomainError) as error:
        await sops.decompose(SECTIONS)

    assert cancelled.is_set()
    assert len(requests) == 1
    assert_safe_failure(error.value, caplog, "timeout", status=504, code="TIMEOUT")


@pytest.mark.parametrize(
    ("exception", "reason", "status", "code"),
    [
        (httpx.ReadTimeout, "timeout", 504, "TIMEOUT"),
        (httpx.ConnectTimeout, "timeout", 504, "TIMEOUT"),
        (httpx.ConnectError, "provider_error", 503, "PROVIDER_UNAVAILABLE"),
    ],
)
async def test_transport_failure_is_classified_without_leaking_exception_text(
    provider, caplog, exception, reason, status, code
):
    async def respond(request):
        raise exception(f"{PRIVATE_OUTPUT} {PRIVATE_KEY}", request=request)

    requests, _ = provider(respond)

    with pytest.raises(DomainError) as error:
        await sops.decompose(SECTIONS)

    assert len(requests) == 1
    assert_safe_failure(error.value, caplog, reason, status=status, code=code)


@pytest.mark.parametrize(
    ("upstream_status", "reason"),
    [(401, "credentials"), (403, "credentials"), (429, "rate_limited"), (500, "provider_error")],
)
async def test_http_failure_exposes_only_safe_status_and_reason(
    provider, caplog, upstream_status, reason
):
    async def respond(_request):
        return httpx.Response(
            upstream_status,
            json={"error": {"message": f"{PRIVATE_OUTPUT} {PRIVATE_KEY}"}},
        )

    requests, _ = provider(respond)

    with pytest.raises(DomainError) as error:
        await sops.decompose(SECTIONS)

    assert len(requests) == 1
    assert error.value.details["upstreamStatus"] == upstream_status
    assert_safe_failure(error.value, caplog, reason)


@pytest.mark.parametrize(
    "body",
    [
        None,
        [],
        {"status": "completed", "output": None},
        {"status": "completed", "output": PRIVATE_OUTPUT},
        {"status": "completed", "output": [None]},
        {"status": "completed", "output": [{"content": None}]},
        {"status": "completed", "output": [{"content": [PRIVATE_OUTPUT]}]},
        {"status": "completed", "output": [{"content": [{"type": "output_text", "text": None}]}]},
        {"status": "completed", "output": []},
        completed(PRIVATE_OUTPUT),
        completed(json.dumps({"sopKey": PRIVATE_OUTPUT})),
    ],
    ids=[
        "null-body",
        "list-body",
        "null-output",
        "string-output",
        "null-output-item",
        "null-content",
        "string-content-item",
        "null-text",
        "empty-output",
        "invalid-json-output",
        "invalid-draft-schema",
    ],
)
async def test_malformed_provider_envelopes_and_drafts_fail_safely(provider, caplog, body):
    async def respond(_request):
        return httpx.Response(
            200, content=json.dumps(body), headers={"content-type": "application/json"}
        )

    provider(respond)

    with pytest.raises(DomainError) as error:
        await sops.decompose(SECTIONS)

    assert_safe_failure(error.value, caplog, "invalid_draft")


async def test_non_json_http_body_is_an_invalid_draft_without_exposing_body(provider, caplog):
    async def respond(_request):
        return httpx.Response(200, content=PRIVATE_OUTPUT)

    provider(respond)

    with pytest.raises(DomainError) as error:
        await sops.decompose(SECTIONS)

    assert_safe_failure(error.value, caplog, "invalid_draft")


async def test_refusal_is_distinct_from_an_invalid_draft_and_does_not_log_refusal_text(
    provider, caplog
):
    async def respond(_request):
        return httpx.Response(
            200,
            json={
                "status": "completed",
                "output": [{"content": [{"type": "refusal", "refusal": PRIVATE_OUTPUT}]}],
            },
        )

    provider(respond)

    with pytest.raises(DomainError) as error:
        await sops.decompose(SECTIONS)

    assert_safe_failure(error.value, caplog, "refusal")


async def test_incomplete_response_rejects_even_valid_partial_draft(provider, caplog):
    async def respond(_request):
        return httpx.Response(
            200,
            json={
                **completed(json.dumps(DRAFT)),
                "status": "incomplete",
                "incomplete_details": {"reason": "max_output_tokens", "private": PRIVATE_OUTPUT},
            },
        )

    provider(respond)

    with pytest.raises(DomainError) as error:
        await sops.decompose(SECTIONS)

    assert_safe_failure(error.value, caplog, "incomplete")


async def test_provider_timeout_retains_saved_source_and_original_failure_details(
    workshop, provider, caplog
):
    session, users, _work = workshop

    async def respond(request):
        raise httpx.ReadTimeout(PRIVATE_OUTPUT, request=request)

    provider(respond)

    with pytest.raises(DomainError) as error:
        await sops.import_source(
            session,
            users["sop_manager"],
            "inspection.md",
            f"# Equipment\n{PRIVATE_SOURCE}".encode(),
        )

    assert_safe_failure(error.value, caplog, "timeout", status=504, code="TIMEOUT")
    document_id = error.value.details["documentId"]
    await session.rollback()
    document = await session.get(SOPDocument, document_id)
    assert document is not None
    assert document.filename == "inspection.md"
    assert document.sections[0]["text"].strip() == PRIVATE_SOURCE
