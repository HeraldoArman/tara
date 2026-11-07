from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    environment: str = "development"
    service_role: str = "api"
    database_url: str = "sqlite+aiosqlite:///./local.db"
    jwt_secret: str = "development-only-change-before-deployment-000000000"
    jwt_issuer: str = "tara"
    jwt_expire_hours: int = 8
    app_origin: str = "http://localhost:3001"
    cookie_secure: bool = False
    demo_password: str = ""
    livekit_url: str = ""
    livekit_api_key: str = ""
    livekit_api_secret: str = ""
    livekit_agent_name: str = "tara-agent"
    evidence_backend: str = "local"
    evidence_source: Literal["live_camera", "test_media"] = "live_camera"
    evidence_local_path: Path = Path(".data/evidence")
    s3_endpoint_url: str | None = None
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_bucket: str = "tara-evidence"
    s3_region: str = "us-east-1"
    sop_openai_api_key: str = ""
    sop_model: str = "gpt-4.1-mini"
    realtime_model: str = "gpt-realtime-2.1"
    realtime_voice: str = "marin"
    frame_max_age_seconds: int = 5
    web_search_url: str = "https://api.search.brave.com/res/v1/web/search"
    vision_model: str = "gpt-4.1-mini"
    openai_api_key: str = ""
    web_search_api_key: str = ""
    max_upload_bytes: int = 10 * 1024 * 1024
    max_pdf_pages: int = 80
    max_source_characters: int = 120_000

    @field_validator("database_url")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+asyncpg://", 1)
        return value

    @model_validator(mode="after")
    def production_requirements(self):
        if self.environment == "production":
            if self.evidence_source != "live_camera":
                raise ValueError(
                    "Production requires live camera evidence; test media is only for isolated fixtures"
                )
            if not self.database_url.startswith("postgresql+asyncpg://"):
                raise ValueError("Production requires PostgreSQL via asyncpg")
            if self.service_role != "worker" and (
                len(self.jwt_secret) < 32 or "development" in self.jwt_secret
            ):
                raise ValueError(
                    "Production requires a random JWT_SECRET of at least 32 characters"
                )
            if self.service_role != "worker" and (
                not self.cookie_secure or not self.app_origin.startswith("https://")
            ):
                raise ValueError("Production requires secure cookies and HTTPS APP_ORIGIN")
            if self.evidence_backend != "s3":
                raise ValueError("Production requires S3 evidence storage")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
