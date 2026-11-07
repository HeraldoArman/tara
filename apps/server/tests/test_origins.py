import pytest
from pydantic import ValidationError

from tara_server.settings import Settings


def test_allowed_origins_normalize_and_deduplicate_exact_configured_origins():
    settings = Settings(
        app_origin="HTTPS://TARA.HERALDOARMAN.COM:443/",
        additional_app_origins=(
            " https://web-production-4f08e.up.railway.app/ ,"
            "https://tara.heraldoarman.com, http://localhost:3001/ ,,"
        ),
    )
    assert settings.app_origin == "https://tara.heraldoarman.com"
    assert settings.allowed_origins == [
        "https://tara.heraldoarman.com",
        "https://web-production-4f08e.up.railway.app",
        "http://localhost:3001",
    ]
    assert Settings().additional_app_origins == ""


@pytest.mark.parametrize(
    "origin",
    [
        "*",
        "https://*.example.com",
        "ftp://example.com",
        "https://user:password@example.com",
        "https://example.com/not-an-origin",
        "https://example.com?query=1",
        "https://example.com#fragment",
        "null",
        "https://example.com:99999",
        "https://%65xample.com",
    ],
)
def test_origin_configuration_rejects_wildcards_credentials_and_non_origins(origin):
    with pytest.raises(ValidationError, match="exact HTTP"):
        Settings(additional_app_origins=origin)


def test_origin_ports_and_ipv6_remain_exact():
    settings = Settings(
        app_origin="http://[::1]:3001/",
        additional_app_origins="https://example.com:8443,http://example.com:80/",
    )
    assert settings.allowed_origins == [
        "http://[::1]:3001",
        "https://example.com:8443",
        "http://example.com",
    ]
    assert "https://example.com" not in settings.allowed_origins
