"""Create the explicitly configured local MinIO bucket; never touches production."""

from urllib.parse import urlparse

from botocore.exceptions import ClientError

from tara_server.settings import get_settings
from tara_server.storage import get_storage


def main() -> None:
    settings = get_settings()
    endpoint = urlparse(settings.s3_endpoint_url or "")
    if settings.environment == "production" or endpoint.hostname not in {
        "localhost",
        "127.0.0.1",
        "::1",
        "minio",
    }:
        raise SystemExit("This command is restricted to explicitly configured local MinIO.")
    client = get_storage().client
    if client is None:
        raise SystemExit("Set EVIDENCE_BACKEND=s3 and the local MinIO environment variables.")
    try:
        client.head_bucket(Bucket=settings.s3_bucket)
    except ClientError as error:
        code = error.response.get("Error", {}).get("Code")
        if code not in {"404", "NoSuchBucket", "NotFound"}:
            raise SystemExit(
                "Cannot authorize the local bucket. Check MinIO credentials."
            ) from None
        client.create_bucket(Bucket=settings.s3_bucket)
    print("Local evidence bucket is ready.")


if __name__ == "__main__":
    main()
