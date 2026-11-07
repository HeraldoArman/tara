import asyncio
import contextlib
import hashlib
import hmac
import time

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

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

    def _validate_read(self, content: bytes) -> bytes:
        if not content or len(content) > self.settings.max_upload_bytes:
            raise DomainError(
                "EVIDENCE_INVALID", "The stored object has an invalid or unsupported size.", 409
            )
        return content

    async def read(self, object_key: str, expected_sha256: str | None = None) -> bytes:
        """Read a bounded private object without exposing its storage endpoint."""
        if self.client:
            client = self.client
            maximum = self.settings.max_upload_bytes

            def read_s3() -> bytes:
                result = client.get_object(Bucket=self.settings.s3_bucket, Key=object_key)
                body = result["Body"]
                try:
                    if result.get("ContentLength", 0) > maximum:
                        raise DomainError(
                            "EVIDENCE_INVALID", "The stored object exceeds its size limit.", 409
                        )
                    return body.read(maximum + 1)
                finally:
                    with contextlib.suppress(Exception):
                        body.close()

            try:
                content = await asyncio.to_thread(read_s3)
            except DomainError:
                raise
            except ClientError as error:
                code = str(error.response.get("Error", {}).get("Code", ""))
                if code in {"NoSuchKey", "NotFound", "404"}:
                    raise DomainError("NOT_FOUND", "Evidence object not found.", 404) from None
                raise DomainError(
                    "PROVIDER_UNAVAILABLE", "Private evidence storage could not be read.", 503
                ) from None
            except Exception:
                raise DomainError(
                    "PROVIDER_UNAVAILABLE", "Private evidence storage could not be read.", 503
                ) from None
        else:
            content = await self.read_local(object_key)
        self._validate_read(content)
        if expected_sha256 is not None and not hmac.compare_digest(
            hashlib.sha256(content).hexdigest(), expected_sha256
        ):
            raise DomainError(
                "EVIDENCE_INTEGRITY_FAILED",
                "The stored evidence does not match its recorded digest.",
                409,
            )
        return content

    async def read_local(self, key: str) -> bytes:
        root = self.settings.evidence_local_path.resolve()
        path = (root / key).resolve()
        if not path.is_relative_to(root):
            raise DomainError("FORBIDDEN", "Invalid object key.", 403)

        def read_file() -> bytes:
            with path.open("rb") as source:
                return source.read(self.settings.max_upload_bytes + 1)

        try:
            content = await asyncio.to_thread(read_file)
        except FileNotFoundError:
            raise DomainError("NOT_FOUND", "Evidence object not found.", 404) from None
        except OSError:
            raise DomainError(
                "PROVIDER_UNAVAILABLE", "Private evidence storage could not be read.", 503
            ) from None
        return self._validate_read(content)

    async def ready(self):
        if self.client:
            await asyncio.to_thread(self.client.head_bucket, Bucket=self.settings.s3_bucket)
        else:
            await asyncio.to_thread(
                self.settings.evidence_local_path.mkdir, parents=True, exist_ok=True
            )


def get_storage() -> ObjectStorage:
    return ObjectStorage()
