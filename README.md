# tara

> 🏆 **Top 5 — [SEA x OpenAI Hackathon ID](https://seaxopenai-hackathon-id.sea.com/)**
> Granted GPT Pro: US$100 for one year (US$3,600 total value)

tara guides technicians through reviewed SOPs and preserves the evidence, attempts,
deviations and reviews behind every completed work order. The workspace uses
Next.js, a server-authoritative FastAPI execution service, PostgreSQL 18, private
S3-compatible evidence storage and one Python LiveKit/OpenAI realtime worker.

Correct work stays silent. **Ask tara** explicitly activates consultation;
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

SOP imports accept Markdown, TXT, DOCX and unencrypted text-based PDFs up to 10 MiB.
The default extraction limits are 250 PDF pages and 300,000 text characters,
configurable with `MAX_PDF_PAGES` and `MAX_SOURCE_CHARACTERS`. Extraction has a
20-second deadline. Scanned/image-only PDFs require OCR and are not supported.
Oversized manuals should be split into individual procedures before import.
AI drafting has a separate 60-second total deadline and requests concise output.
Timeout, rate-limit, credential and invalid-response failures have distinct
diagnostics. The saved source can be retried without uploading it again.

Set scoped `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` and the same
`LIVEKIT_AGENT_NAME` on API/worker. The worker needs `OPENAI_API_KEY`;
API offline SOP decomposition separately uses `SOP_OPENAI_API_KEY`. Set these in
ignored environment files or the deployment platform, never in browser code.

SOP drafting defaults to `gpt-6.1-sol` with low reasoning effort. Still-image
verification uses `gpt-6.1-terra` with reasoning disabled to preserve its bounded
response time. Voice consultation uses `gpt-realtime-2.1` and the `marin` voice.
Model changes require a credentialed provider check and evaluation on reviewed
bench images; passing application tests does not establish visual accuracy.

During Ask tara, camera questions inspect one fresh frame with the vision model
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

Owners create and assign work from **Create job** in the work queue or
**Create job from this SOP** on a published procedure. Select a published version
and an active technician (or yourself); the assigned account then sees
**Start video session** in its queue. **Start bench camera** connects the assistant
and publishes the camera to LiveKit in one action, then enables voice listening.
Use **Pause listening** or **Resume listening** to control the microphone, and
**Enable speaker** to restore audio replies. Text consultation remains available
if microphone access is denied. tara speaks only in response to a request;
recorded mistakes appear visually without spoken interruptions.

Technicians and owners can also choose **Select SOP & start session** from the
work queue, then select a saved published version in **SOP intelligence** and
choose **Start session**. The backend creates a session assigned to that user,
pinned to the selected version, and records it in the normal queue/report flow.
An open session started from the same version is resumed on repeat requests.
Asset details are explicitly marked as not provided for these sessions.
Technicians cannot assign or reassign other users' work.

**Reports** includes read-only session records while work is ongoing. Each record
shows progress, attempts, issues and saved camera images. Completing a session or
closing it with unresolved work creates its immutable final report. **Evaluation**
uses real authorized sessions, including unfinished work, and links procedure
steps and recent images back to their session records. Unclear checks are counted
separately from confirmed failures. Visual evidence coverage measures distinct
required camera checkpoints with accepted frames; saved-image counts include
frames that were not accepted. Evidence images load through authenticated
same-origin endpoints backed by private S3 storage, with per-image retry controls.

Inside a connected session, **Pair phone camera** optionally replaces the laptop
camera. Scan the QR code with a phone and choose **Start phone camera** in its
camera-only Product view. The laptop stays in Demo view and keeps the microphone,
assistant speaker and procedure controls. The rear phone camera is used for the
laptop preview and tara's visual checks; the phone receives no session audio or
procedure controls. **Use laptop camera** disconnects the phone and restores the
normal camera flow. The phone camera starts horizontally, requesting landscape
fullscreen where supported; otherwise turn the phone sideways before starting.
Keep the phone page open and its screen awake while sharing.

Pairing links expire after ten minutes if unused and permit only camera
publication into that specific session, without a phone sign-in. Claimed
pairings last up to eight hours and can be revoked or replaced from the laptop.
The QR secret stays in the URL fragment and only its hash is stored. Ending the
session revokes the pairing. No pairing is needed to use the laptop camera.

**Read model label** reads visible model/serial text from a fresh camera frame and
shows the transcription and any unreadable fields. Hold the underside label close
and steady, with enough light. You can also ask tara to read the label. Camera
capture requests 1080p and preserves detail for text reading. For a session started
directly from an SOP, review and save its missing model before comparing identity
against the procedure. Serial registration is optional; a serial check is required
only when the published procedure explicitly calls for it. Existing assigned-job
identifiers remain fixed.
Label reading does not complete a step. Use **Check current frame**, or **Retest
current frame** for a held visual step, to perform a fresh verification. Warnings
remain until the required criteria are satisfied; unreadable text is reported as
unclear rather than a confirmed model mismatch.

The keyboard switch-replacement demo PDF in `output/pdf/` is version 1.1 and
checks the keyboard model and target key without requiring a serial number.
Import, review and publish that revision to use it in new sessions; existing
published procedures and their sessions keep their original requirements.

The live assistant receives the selected published SOP's ordered steps and the
session's known device details. It can explain the procedure without a separate
work order or registered identifiers. Large procedures include a step outline
and retrieve further details from that same saved SOP. Identity matching remains
required only when the current published check calls for it.

For demos with limited equipment, tara suggests practical functional substitutes
for ordinary tools and keeps guidance brief. It does not demand a professional
kit or unused tools in the camera view. Explicit published equipment and safety
checks still apply; simulated actions remain demonstrations rather than verified
work. Tool calls run without spoken processing narration, and replies explain
the result or a useful next action.

For a demo, ask tara to "assume this step passed for the demo" to advance the
current step as **demo assumed**. It is recorded as unverified, without evidence,
and does not satisfy the requirements for a complete report. Existing issues
remain open. Each step requires its own explicit request.

Choose **Review my progress**, or ask which step you are on and whether anything
was skipped. The assistant compares one fresh camera frame with the selected
SOP's steps, then checks the candidate against recorded progress. It separates
explicit recorded skips from earlier required steps without verification. An
unclear view stays uncertain, and invisible actions cannot be reconstructed from
a still image. This review does not advance or verify any step. Without an
available camera, it reports saved progress and explains the limitation.

SOP intelligence loads saved source passages and configured checks from the API.
Its visual checkpoint labels describe the procedure's verification method, not
a completed verification. Owners and SOP managers can import a source into a
saved AI draft, review it, and publish it before execution. Other roles can only
select published versions. Exported maps preserve the selected version and
source links.

Use the controlled administrative CLI, documented in the parent workspace's
`docs/admin-operations.md`, to provision organization users or bulk-import work
orders after the initial owner bootstrap. There is deliberately no self-service
user administration screen.

Production requires isolated credentials/data, secure cookies, tested database
and evidence recovery, actual provider evaluation and measured latency budgets.
Railway buckets alone do not establish immutable evidence or automatic backups.

## Real-time assistant components

Start the web app with `bun run dev:web` and open
[the assistant preview](http://localhost:3001/assistant) to explore the shared
status, guidance, controls, verification badge and task-step components. Demo and
Product layouts share the same presentation state and use a simulated keyboard
or local webcam preview. This route does not connect to AI or submit execution
records.

Assigned jobs open the connected workspace at `/runs/[id]`, using the same
assistant components and Demo/Product layouts. The current instruction, citations,
corrections, verification labels and completed count come from the pinned run
snapshot. Camera, pause/resume, visual checks, recorded confirmations, Ask tara,
evidence, session records and report creation use the existing authenticated
backend and LiveKit worker. Appearance controls and simulated completion remain
exclusive to the preview. Correct work stays silent; an attestation is labeled
separately from AI visual verification.

See the parent workspace's `docs/12-assistant-components.md` for imports, ownership,
preview behavior and integration boundaries.
