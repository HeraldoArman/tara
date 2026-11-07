import asyncio
import hashlib
import time

import boto3
from botocore.config import Config

from tara_server.db.models import uid
from tara_server.errors import DomainError
from tara_server.settings import get_settings
from tara_server.telemetry import EVIDENCE_BYTES, EVIDENCE_DURATION


class ObjectStorage:
    def __init__(self):
        self.settings = get_settings()
        if self.settings.evidence_backend == "s3":
            self.client = boto3.client(
                "s3",
                endpoint_url=self.settings.s3_endpoint_url,
                aws_access_key_id=self.settings.s3_access_key_id or None,
                aws_secret_access_key=self.settings.s3_secret_access_key or None,
                region_name=self.settings.s3_region,
                config=Config(signature_version="s3v4", connect_timeout=3, read_timeout=5),
            )
        else:
            self.client = None

    async def put(self, content: bytes, media_type: str) -> tuple[str, str]:
        if not content or len(content) > self.settings.max_upload_bytes:
            raise DomainError(
                "VALIDATION_FAILED", "The evidence/source file exceeds its size limit.", 422
            )
        key = f"objects/{uid()}"
        digest = hashlib.sha256(content).hexdigest()
        started = time.monotonic()
        EVIDENCE_BYTES.observe(len(content))
        try:
            if self.client:
                await asyncio.to_thread(
                    self.client.put_object,
                    Bucket=self.settings.s3_bucket,
                    Key=key,
                    Body=content,
                    ContentType=media_type,
                    Metadata={"sha256": digest},
                )
            else:
                path = self.settings.evidence_local_path / key
                await asyncio.to_thread(path.parent.mkdir, parents=True, exist_ok=True)
                await asyncio.to_thread(path.write_bytes, content)
        except Exception:
            EVIDENCE_DURATION.labels(status="failed").observe(time.monotonic() - started)
            raise DomainError(
                "PROVIDER_UNAVAILABLE",
                "Evidence storage is unavailable. Retry before completing the step.",
                503,
            ) from None
        EVIDENCE_DURATION.labels(status="stored").observe(time.monotonic() - started)
        return key, digest

    async def signed_url(self, object_key: str) -> str | None:
        if self.client:
            return await asyncio.to_thread(
                self.client.generate_presigned_url,
                "get_object",
                Params={"Bucket": self.settings.s3_bucket, "Key": object_key},
                ExpiresIn=120,
            )
        return None

    async def read_local(self, key: str) -> bytes:
        root = self.settings.evidence_local_path.resolve()
        path = (root / key).resolve()
        if not path.is_relative_to(root):
            raise DomainError("FORBIDDEN", "Invalid object key.", 403)
        try:
            return await asyncio.to_thread(path.read_bytes)
        except OSError:
            raise DomainError("NOT_FOUND", "Evidence object not found.", 404) from None

    async def ready(self):
        if self.client:
            await asyncio.to_thread(self.client.head_bucket, Bucket=self.settings.s3_bucket)
        else:
            await asyncio.to_thread(
                self.settings.evidence_local_path.mkdir, parents=True, exist_ok=True
            )


def get_storage() -> ObjectStorage:
    return ObjectStorage()
