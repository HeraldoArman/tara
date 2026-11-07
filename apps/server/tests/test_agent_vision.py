import base64
import json
from datetime import UTC, datetime

import httpx
import pytest

from tara_server.agent.vision import CapturedFrame, StillImageVerifier
from tara_server.errors import DomainError

STEP = {
    "instruction": "Show the exposed switch.",
    "verification": {
        "criteria": [
            {"id": "visible", "description": "The entire switch is visible"},
        ]
    },
}


@pytest.mark.asyncio
async def test_verdict_is_bound_to_exact_evidence_bytes():
    frame = CapturedFrame(b"exact-stored-jpeg", datetime.now(UTC))

    def provider(request):
        body = json.loads(request.content)
        content = body["input"][0]["content"]
        assert base64.b64decode(content[1]["image_url"].split(",")[1]) == frame.jpeg
        assert json.loads(content[0]["text"])["frameSha256"] == frame.sha256
        assert body["store"] is False
        return httpx.Response(
            200,
            json={
                "id": "assessment-1",
                "output": [
                    {
                        "content": [
                            {
                                "type": "output_text",
                                "text": json.dumps(
                                    {
                                        "criteria": [
                                            {
                                                "id": "visible",
                                                "verdict": "pass",
                                                "reason": "Switch housing is exposed",
                                            },
                                        ]
                                    }
                                ),
                            }
                        ]
                    }
                ],
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
        result = await StillImageVerifier(client, "test-credential", "configured-model").assess(
            frame, STEP
        )
    assert result.assessment_id == "assessment-1"
    assert result.criteria[0].verdict == "pass"
    assert result.model == "configured-model"


@pytest.mark.asyncio
async def test_incomplete_model_results_cannot_pass():
    def provider(_request):
        return httpx.Response(
            200,
            json={
                "id": "assessment-2",
                "output": [
                    {
                        "content": [
                            {
                                "type": "output_text",
                                "text": '{"criteria":[]}',
                            }
                        ]
                    }
                ],
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
        with pytest.raises(DomainError, match="failed safely"):
            await StillImageVerifier(client, "test-credential", "model").assess(
                CapturedFrame(b"jpeg", datetime.now(UTC)),
                STEP,
            )


@pytest.mark.asyncio
async def test_missing_provider_has_no_fabricated_verdict():
    async with httpx.AsyncClient() as client:
        with pytest.raises(DomainError, match="OpenAI key"):
            await StillImageVerifier(client, "", "model").assess(
                CapturedFrame(b"jpeg", datetime.now(UTC)),
                STEP,
            )
