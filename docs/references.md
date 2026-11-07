# References and evidence

## 1. Local product sources

The existing prototype is the normative source for screens and interaction intent:

| Source | Used for |
| --- | --- |
| `README.md` | Demo scenario, feature summary and honest prototype limitations |
| `index.html` | Queue, readiness, shift metrics, recent reports and navigation |
| `workspace.html` | Live camera, scan state, current step, chat/voice UI and typed fallback |
| `report.html` | Report shell |
| `assets/js/data.js` | WO-1042, SOP-KBD-01 v1.4, step definitions, statuses and readiness fixtures |
| `assets/js/core.js` | Local session/report model, persistence, evidence/report calculations and overlays |
| `assets/js/session.js` | Intents, state transitions, scans, tools, failures, escalation, voice and close-out |
| `assets/js/live-data.js` | Reference diagrams, parts and simulated research result shapes |
| `assets/js/report.js` | Step/evidence/deviation/timeline/review/export presentation |
| `assets/js/scene.js` | Simulated camera and frame-capture behavior |
| `assets/css/` | Visual tokens, responsive layouts, dialogs, session and print styling |
| `new-design.zip` | Source archive for the new live-workspace design |
| `new-design/workspace.html` | Extracted redesigned live workspace |
| `new-design/assets/css/session.css` | New workspace visual system |
| `new-design/README.md` | Design prototype notes and presentation controls |

Important observed limitations reflected in the plan:

- Visual verdicts are scripted even when webcam mode supplies the attached image.
- Work order, SOP, technician and supervisor are hardcoded.
- Sessions/reports are browser-local and mutable.
- The prototype’s “REC” is not continuous video recording.
- Search, readiness and online indicators are simulated.
- The report hash is not cryptographic proof.
- The existing always-on browser speech behavior is intentionally replaced by the new silent/activation requirement.

### New design archive

`new-design.zip` was extracted to `new-design/` without its nested `.git`. Only the live workspace design changed:

- `workspace.html` — rewritten layout;
- `assets/css/session.css` — new visual system;
- `assets/js/session.js` — prototype presentation states/focused guidance;
- `README.md` — design notes.

Queue, report, data, scene and core/report/dashboard logic match the existing prototype by checksum. The design is visual guidance only; its manual state selector, Sleep/Pause and layout switch do not define production SOP/agent behavior. See [10 — New design reference](10-new-design.md).

## 2. Reference repositories

### `/home/pongo/projects/saas-app`

Used only as a reference for:

- Bun/Nx monorepo conventions.
- Python `uv`, typed settings, Ruff/mypy/pytest and container patterns.
- Small LiveKit `AgentServer`/`AgentSession` worker structure.

Its STT → LLM → TTS pipeline and TypeScript backend/auth/database stack are not copied.

### `/home/pongo/projects/ristek/memora-hihi`

Used as an anti-reference for latency/complexity and as a limited deployment-operations reference:

- Parallel realtime video and secondary scene/perception processing.
- Large tool registry and prompt-mandated tool chains.
- Background extraction, retrieval, embeddings and proactive planning.
- Event-loop/video concerns documented in `docs/debug/audio-latency-event-loop-blocking.md`.
- Root-context Bun/uv Docker builds, standalone Next output, Compose health checks and separate API/worker commands in `apps/dashboard/Dockerfile`, `apps/backend/Dockerfile` and `docker-compose.yml`.
- Railway service-configuration incidents documented in `docs/debug/railway-backend-empty-deploy-logs.md`: stale pre-deploy state and an API/worker shared-config regression.

No Memora domain architecture, memory pipeline, graph/vector stores, tool registry or unauthenticated token route is carried into this plan. No live latency figures from that project are treated as benchmarks for the new system. Its legacy `railway.json` files are not copied into TARa; [11](11-railway-deployment.md) uses current Railway TypeScript IaC instead.

## 3. Official LiveKit documentation

Accessed 2026-11-06 using the current rendered documentation.

### OpenAI Realtime API

<https://docs.livekit.io/agents/models/realtime/openai.md>

Facts used:

- LiveKit Inference lists `openai/gpt-realtime-2.1` and `openai/gpt-realtime-2.1-mini`.
- The direct plugin is installed with `livekit-agents[openai]~=1.8` and uses `OPENAI_API_KEY`.
- Direct OpenAI video input is available in Python.
- LiveKit Inference realtime models do not support image/video input.
- OpenAI supports semantic/server VAD and response interruption options.
- Loading conversation history can have realtime output side effects; this plan uses compact run context on reconnect instead of replaying old chat.

The exact direct-plugin model identifier/account availability remains a technical-spike check rather than an assumed fact.

### Live video input

<https://docs.livekit.io/agents/multimodality/vision/video.md>

Facts used:

- `video_input=True` enables supported realtime video in Python.
- Default sampling is 1 FPS while speaking and one frame every three seconds otherwise.
- OpenAI sends each video frame as an image message in conversation context.
- Each frame consumes input tokens/context.
- LiveKit provides latest-frame/image-encoding patterns.

These facts motivate on-demand bounded frames rather than default continuous streaming.

### Agent session options

<https://docs.livekit.io/agents/logic/sessions.md>

Facts used:

- `VoiceActivityVideoSampler` supports speaking/silent frame-rate controls.
- Session `userdata` can hold per-session state.
- `max_tool_steps` limits consecutive tool calls.
- Session lifecycle events support close/state/transcript handling.

### Function tools

<https://docs.livekit.io/agents/logic/tools/definition.md>

Facts used:

- `@function_tool` and `RunContext` provide validated tool definitions/context.
- Mutating tools should prevent interruption where necessary.
- Read-only work needs explicit cancellation/timeout handling.
- `ToolError` provides controlled model-facing failures.
- Returning no tool result can complete a tool silently, useful for routine silent-mode mutations.

### Tool-loop design

<https://docs.livekit.io/agents/logic/tools/design.md>

Used for small tool results, bounded external calls and avoiding unnecessary sequential tool work.

### External data and RAG

<https://docs.livekit.io/agents/build/external-data.md>

Used for grounding/tool feedback boundaries; this plan implements retrieval through direct async PostgreSQL services rather than extra agent layers.

### Events and usage

<https://docs.livekit.io/agents/build/events.md>

Facts used:

- `session_usage_updated` supports aggregate usage tracking.
- Per-message latency is available through current chat-message metrics.
- Session-level `metrics_collected` is deprecated for the new usage/latency approach described in the docs.

### Session reports

<https://docs.livekit.io/testing/observability/data.md>

Used as a reference for worker/session lifecycle reporting and `on_session_end` integration options.

### Explicit agent dispatch

<https://docs.livekit.io/agents/server/agent-dispatch.md>

Used for named explicit dispatch rather than unrestricted automatic worker assignment.

## 4. Scaffold and backend documentation

### Better-T-Stack

- <https://www.better-t-stack.dev/docs>
- <https://www.better-t-stack.dev/docs/cli>
- <https://github.com/AmanVarshney01/create-better-t-stack>

Used to validate the requested frontend-only/backend-none direction and addon choices. Generated versions must be locked when scaffolding rather than inferred from another project.

### FastAPI security

<https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/>

Used for the minimal JWT/password pattern and current recommendation of `pwdlib[argon2]` with Argon2 password hashing. The plan intentionally implements only a small subset suitable for this application.

### SQLAlchemy asyncio

<https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html>

Used for `create_async_engine`, async sessions and asyncpg integration shared by FastAPI and the worker.

### Alembic

<https://alembic.sqlalchemy.org/>

Used for explicit versioned migrations and release-job migration execution.

### PostgreSQL 18 full-text search

<https://www.postgresql.org/docs/18/textsearch.html>

Used for the initial grounded SOP retrieval approach without another database. Retrieval quality must be evaluated before considering pgvector.

## 5. Railway deployment documentation

Accessed 2026-11-06. The detailed decisions are in [11 — Railway deployment](11-railway-deployment.md).

- [Infrastructure as Code](https://docs.railway.com/infrastructure-as-code) and [IaC reference](https://docs.railway.com/infrastructure-as-code/reference): project-level `.railway/railway.ts`, reviewed plan/apply, resource references and environment isolation.
- [Config as Code](https://docs.railway.com/reference/config-as-code): legacy `railway.json`/`railway.toml` deprecation and the 2026-12-01 hard cutoff; these files are not the new deployment baseline.
- [Pre-deploy commands](https://docs.railway.com/deployments/pre-deploy-command): separate container, private networking/environment access, fail-before-start behavior and no default timeout.
- [Healthchecks](https://docs.railway.com/deployments/healthchecks): `PORT`, traffic-switching behavior, healthcheck hostname and no continuous monitoring after deployment.
- [Deployment teardown](https://docs.railway.com/deployments/deployment-teardown): overlap, SIGTERM drain and eventual SIGKILL behavior.
- [Build-time versus runtime secrets](https://railway.com/guides/build-time-vs-runtime-secrets): explicit Docker `ARG` opt-in and why runtime secrets must stay out of images.
- [PostgreSQL](https://docs.railway.com/databases/postgresql) and [PostgreSQL HA](https://docs.railway.com/databases/postgresql-ha): private connection variables, official pinned major images including 18, backups and the distinction between backups and HA.
- [Storage Buckets](https://docs.railway.com/storage-buckets): private S3-compatible objects, credential references, virtual-hosted URLs, public-network connectivity, immutable region and current lack of automatic backups, versioning, object locks and lifecycle configuration.
- [Monorepo builds](https://docs.railway.com/deployments/monorepo): full-context monorepo and watch-pattern decisions.

## 6. Research limits

- No real OpenAI/LiveKit session was opened during planning.
- No latency, cost or visual-accuracy benchmark has been run for the new application.
- Model/provider behavior and API availability can change; dependencies must be locked and the technical spike rerun against the selected versions.
- The documentation supports realtime video, but exact still-frame-to-verdict evidence correlation for this application remains an implementation validation item.
- No production compliance, safety certification, retention period or acceptable false-accept threshold has been supplied.
- No Railway project was provisioned or mutated, no IaC plan was applied, and no container build, deployment, migration, worker drain or backup/restore was executed for this deployment plan.
