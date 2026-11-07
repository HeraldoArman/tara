import io

from PIL import Image, UnidentifiedImageError

from tara_server.errors import DomainError


def image_dimensions(content: bytes, media_type: str) -> tuple[int, int]:
    expected = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}
    if media_type not in expected:
        raise DomainError("VALIDATION_FAILED", "Supported images are JPEG, PNG and WebP.", 422)
    try:
        with Image.open(io.BytesIO(content)) as image:
            width, height = image.size
            if (
                image.format != expected[media_type]
                or not 0 < width <= 4096
                or not 0 < height <= 4096
                or width * height > 12_000_000
            ):
                raise ValueError("Unsupported dimensions or signature")
            image.verify()
            return width, height
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise DomainError(
            "VALIDATION_FAILED", "The image signature or dimensions are invalid.", 422
        ) from None
