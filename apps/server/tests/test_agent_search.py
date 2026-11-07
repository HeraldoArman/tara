import json

import httpx
import pytest

from tara_server.agent.search import search_references
from tara_server.errors import DomainError
from tara_server.settings import Settings


def settings(**kwargs):
    return Settings(_env_file=None, openai_api_key="provider-test-only", **kwargs)


async def test_openai_search_uses_real_citations_and_bounds_provider_work():
    def provider(request):
        body = json.loads(request.content)
        assert body["store"] is False
        assert body["tool_choice"] == {"type": "web_search"}
        assert body["max_tool_calls"] == 1
        assert request.extensions["timeout"]["read"] == 10
        return httpx.Response(
            200,
            json={
                "status": "completed",
                "output": [
                    {"type": "web_search_call", "status": "completed"},
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": "The public manufacturer reference explains the part.",
                                "annotations": [
                                    {
                                        "type": "url_citation",
                                        "url": "https://manufacturer.example/reference",
                                        "title": "Manufacturer reference",
                                        "start_index": 50,
                                    },
                                    {
                                        "type": "url_citation",
                                        "url": "javascript:alert(1)",
                                        "title": "Invalid",
                                    },
                                ],
                            }
                        ],
                    },
                ],
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
        result = await search_references(client, settings(), "public switch documentation")
    assert result["provider"] == "openai"
    assert result["supplementary"] is True
    assert [item["url"] for item in result["items"]] == ["https://manufacturer.example/reference"]
    assert result["retrievedAt"]


@pytest.mark.parametrize(
    "output",
    [
        [
            {
                "type": "message",
                "content": [{"type": "output_text", "text": "Invented https://example.com"}],
            }
        ],
        [
            {"type": "web_search_call", "status": "completed"},
            {"type": "message", "content": [{"type": "output_text", "text": "No cited source"}]},
        ],
    ],
)
async def test_search_never_fabricates_references_from_uncited_prose(output):
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda _: httpx.Response(200, json={"status": "completed", "output": output})
        )
    ) as client:
        with pytest.raises(DomainError, match="unavailable"):
            await search_references(client, settings(), "public query")


async def test_search_timeout_returns_safe_recovery():
    def provider(request):
        raise httpx.ReadTimeout("private-provider-internals", request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
        with pytest.raises(DomainError, match="Web search timed out") as failure:
            await search_references(client, settings(), "public query")
    assert "private-provider" not in failure.value.message


async def test_disabled_and_unconfigured_brave_fail_before_network():
    def provider(_):
        pytest.fail("An unavailable provider must not be called")

    async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
        for configured in (
            settings(web_search_provider="disabled"),
            settings(web_search_provider="brave", web_search_api_key=""),
        ):
            with pytest.raises(DomainError, match="disabled|Brave search key"):
                await search_references(client, configured, "public query")
