FROM ghcr.io/astral-sh/uv:0.10.9 AS uv
FROM python:3.12.12-slim AS builder
COPY --from=uv /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
WORKDIR /app/apps/server
COPY apps/server/pyproject.toml apps/server/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev --no-install-project
COPY apps/server/src ./src
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev

FROM python:3.12.12-slim AS runner
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PATH="/app/apps/server/.venv/bin:$PATH"
WORKDIR /app/apps/server
RUN groupadd --system tara && useradd --system --gid tara --create-home tara
COPY --from=builder --chown=tara:tara /app/apps/server /app/apps/server
COPY --chown=tara:tara apps/server/alembic.ini ./alembic.ini
COPY --chown=tara:tara apps/server/alembic ./alembic
USER tara
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn tara_server.api.main:app --host 0.0.0.0 --port \"${PORT:-8000}\""]
