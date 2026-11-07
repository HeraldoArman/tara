# TARa

TARa guides technicians through reviewed SOPs and preserves the evidence, attempts,
deviations and reviews behind every completed work order. The workspace uses
Next.js, a server-authoritative FastAPI execution service, PostgreSQL 18, private
S3-compatible evidence storage and one Python LiveKit/OpenAI realtime worker.

Correct work stays silent. **Ask TARa** explicitly activates consultation;
proactive corrections are tied to eligible recorded failures. Missing provider
credentials or failed visual assessment never produce simulated verification.

## Development

Requirements: Bun 1.4.4, Python 3.12+, uv and Docker Compose for PostgreSQL/MinIO.

```sh
bun install --frozen-lockfile
cd apps/server
uv sync --locked
cd ../..
cp .env.example .env
cp apps/server/.env.example apps/server/.env
```

Replace the example passwords/secrets in both ignored value files. The root file
configures Compose; `apps/server/.env` configures host-run Python tools. Use the
same local database and MinIO credentials in each. Never reuse these credentials
in production.

Start data services, initialize schema and seed the reviewed keyboard fixture:

```sh
docker compose up -d postgres minio
cd apps/server
uv run alembic upgrade head
uv run python ../../scripts/init-local-storage.py
uv run python -m tara_server.seed
uv run uvicorn tara_server.api.main:app --reload --port 8000
```

In another terminal, run `bun run dev:web` from the repository root and open
<http://localhost:3001>. Demo seeding requires an explicit `DEMO_PASSWORD`; all
seeded usernames are reported by the seed command. The fixture includes SOP-KBD-01
and WO-1042. Do not run demo seeding in production.

For the containerized web/API path, build with `docker compose build`, then run
migrations explicitly with `docker compose run --rm api alembic upgrade head`
before `docker compose up -d web api`. Initialize the local S3 bucket before the
API readiness check with the command above; source/evidence services must have a
real writable bucket.
Migrations never run independently in worker/web startup.

## Realtime and AI

SOP imports accept Markdown, TXT and unencrypted text-based PDFs up to 10 MiB.
The default extraction limits are 250 PDF pages and 300,000 text characters,
configurable with `MAX_PDF_PAGES` and `MAX_SOURCE_CHARACTERS`. Extraction has a
20-second deadline. Scanned/image-only PDFs require OCR and are not supported.
Oversized manuals should be split into individual procedures before import.

Set scoped `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` and the same
`LIVEKIT_AGENT_NAME` on API/worker. The worker needs `OPENAI_API_KEY`;
API offline SOP decomposition separately uses `SOP_OPENAI_API_KEY`. Set these in
ignored environment files or the deployment platform, never in browser code.

SOP drafting defaults to `gpt-6.1-sol` with low reasoning effort. Still-image
verification uses `gpt-6.1-terra` with reasoning disabled to preserve its bounded
response time. Voice consultation uses `gpt-realtime-2.1` and the `marin` voice.
Model changes require a credentialed provider check and evaluation on reviewed
bench images; passing application tests does not establish visual accuracy.

During Ask TARa, camera questions inspect one fresh frame with the vision model
without creating an attempt or verifying a step. Public web references use
`WEB_SEARCH_PROVIDER=openai` and `WEB_SEARCH_MODEL=gpt-6-luna`, reusing the worker's
OpenAI key with a ten-second deadline and linked source citations. Set the provider
to `disabled` to turn search off, or `brave` with `WEB_SEARCH_API_KEY` for the
five-second direct-search adapter. Public search never replaces an approved SOP.

```sh
cd apps/server
uv run python -m tara_server.agent.worker dev
```

The container alternative is `docker compose --profile realtime up -d worker`.
The `realtime` profile is explicit so the deterministic application can run
without provider keys. Realtime acceptance still requires actual audio, dispatch,
exact evidence correlation and reconnect tests; a running UI is insufficient.

## Checks

```sh
bun run check-types
bun run build
bunx tsc -p .railway/tsconfig.json
cd apps/server
uv run ruff check src tests
uv run ruff format --check src tests
uv run mypy src
uv run pytest -q
```

CI also upgrades PostgreSQL 18, checks Alembic drift, scans secrets and builds the
web/server Docker images. Provider-free tests use explicit fakes for deterministic
assertions; credentialed realtime smoke and reviewed model evaluation are separate
release gates. See [evaluation protocol](tests/evaluation/README.md).

## Repository

- `apps/web`: queue, SOP management, execution workspace, reports and evaluation.
- `apps/server/src/tara_server`: auth/RBAC, persistence, SOP ingestion, execution,
  audit, evidence, reports and realtime worker.
- `packages/ui`: shared UI primitives and tokens.
- `.railway/railway.ts`: one environment-scoped infrastructure definition.

The parent workspace's `../docs/` and `../new-design/` folders are the single
sources of truth for requirements, operational runbooks and the design reference.
They are deliberately kept outside this standalone repository.

Only this standalone `tara` repository is published to
[HeraldoArman/tara](https://github.com/HeraldoArman/tara).

## Deployment

Railway runs private API/worker, PostgreSQL 18 and private evidence storage with
one public Next.js origin. API requests stay same-origin through Next's private
proxy. Migrations run once in API pre-deploy. Runtime secrets are never web Docker
build arguments. See the parent workspace's `docs/deployment.md` and the
[Railway configuration](.railway/README.md).

Use the controlled administrative CLI, documented in the parent workspace's
`docs/admin-operations.md`, to provision
organization users and assign work orders after the initial owner bootstrap.
There is deliberately no self-service user administration screen.

Production requires isolated credentials/data, secure cookies, tested database
and evidence recovery, actual provider evaluation and measured latency budgets.
Railway buckets alone do not establish immutable evidence or automatic backups.

## Real-time assistant components

Start the web app with `bun run dev:web` and open
[the assistant preview](http://localhost:3001/assistant) to explore the shared
status, guidance, controls, verification badge and task-step components. Demo and
Product layouts share the same presentation state and use a simulated keyboard
or local webcam preview. This route does not connect to AI or submit execution
records; the application execution workspace lives separately at `/runs/[id]`.

See the parent workspace's `docs/12-assistant-components.md` for imports, ownership,
preview behavior and integration boundaries.
