from sqlalchemy.ext.asyncio import AsyncSession

from tara_server.db.models import Base
from tara_server.errors import DomainError


async def required[RecordT: Base](
    session: AsyncSession, model: type[RecordT], identifier: str
) -> RecordT:
    record = await session.get(model, identifier)
    if record is None:
        raise DomainError("NOT_FOUND", "A required linked record is unavailable.", 404)
    return record
