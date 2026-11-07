"""Opt-in local API fixture: real persistence, deterministic SOP drafting, no providers."""

import os
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
INSTRUCTIONS = (
    (
        "isolate",
        "Confirm isolation",
        "Confirm the device is disconnected before service.",
        "attestation",
    ),
    (
        "finalize",
        "Final inspection",
        "Record the final inspection and close the procedure.",
        "finalization",
    ),
)


def configure_fixture() -> None:
    if os.environ.get("TARA_E2E_SOP_LIFECYCLE") != "1":
        raise RuntimeError("Set TARA_E2E_SOP_LIFECYCLE=1 to enable this test-only API.")
    if os.environ.get("ENVIRONMENT") != "test":
        raise RuntimeError("This fixture requires ENVIRONMENT=test.")
    prefix = "sqlite+aiosqlite:///"
    database = os.environ.get("DATABASE_URL", "")
    if not database.startswith(prefix):
        raise RuntimeError("This fixture requires an isolated SQLite database.")
    cache = (ROOT / ".cache").resolve()
    database_path = Path(database[len(prefix) :]).resolve()
    evidence_path = Path(os.environ.get("EVIDENCE_LOCAL_PATH", "")).resolve()
    if not database_path.is_relative_to(cache) or not evidence_path.is_relative_to(
        cache
    ):
        raise RuntimeError(
            "The test database and evidence must be inside this checkout's .cache."
        )
    if urlsplit(os.environ.get("APP_ORIGIN", "")).hostname not in {
        "localhost",
        "127.0.0.1",
    }:
        raise RuntimeError("This fixture requires a loopback APP_ORIGIN.")
    # Explicit environment values override any .env loaded by the app's Settings.
    for key in (
        "OPENAI_API_KEY",
        "SOP_OPENAI_API_KEY",
        "LIVEKIT_URL",
        "LIVEKIT_API_KEY",
        "LIVEKIT_API_SECRET",
        "WEB_SEARCH_API_KEY",
        "ADDITIONAL_APP_ORIGINS",
    ):
        os.environ[key] = ""
    os.environ["WEB_SEARCH_PROVIDER"] = "disabled"
    os.environ["EVIDENCE_BACKEND"] = "local"
    os.environ["COOKIE_SECURE"] = "false"


def create_app():
    configure_fixture()
    from tara_server.api import main
    from tara_server.domain import sops
    from tara_server.errors import DomainError
    from tara_server.schemas import SOPDefinition

    async def fixture_decompose(sections: list[dict]) -> SOPDefinition:
        content = "\n".join(
            f"{section.get('heading', '')}\n{section.get('text', '')}"
            for section in sections
        )
        if "E2E lifecycle SOP" not in content:
            raise DomainError(
                "PROVIDER_UNAVAILABLE",
                "Only the E2E lifecycle source has a fixture draft.",
                503,
            )
        steps = []
        for step_id, title, instruction, kind in INSTRUCTIONS:
            source = next(
                (
                    section
                    for section in sections
                    if instruction in section.get("text", "")
                ),
                None,
            )
            if source is None:
                raise DomainError(
                    "VALIDATION_FAILED",
                    "The lifecycle fixture source is incomplete.",
                    422,
                )
            steps.append(
                {
                    "id": step_id,
                    "title": title,
                    "instruction": instruction,
                    "sources": [
                        {
                            "heading": source["heading"],
                            "page": source.get("page"),
                            "quote": instruction,
                        }
                    ],
                    "verification": {"kind": kind},
                }
            )
        return SOPDefinition.model_validate(
            {
                "sopKey": "E2E-LIFECYCLE",
                "version": "1.0.0",
                "title": "E2E lifecycle SOP",
                "scope": "Isolated automated lifecycle test only.",
                "prerequisites": ["Use the isolated test device."],
                "steps": steps,
            }
        )

    sops.decompose = fixture_decompose
    main.decompose = fixture_decompose

    @main.app.middleware("http")
    async def isolate_test_logins(request, call_next):
        # Browser scenarios share one loopback address; rate-limit behavior has separate API tests.
        if request.url.path == "/api/v1/auth/login":
            main.login_attempts.clear()
        return await call_next(request)

    return main.app


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        create_app(),
        host="127.0.0.1",
        port=int(os.environ.get("TARA_E2E_API_PORT", "8002")),
    )
