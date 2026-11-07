# 08 — Testing, deployment and release gates

## 1. Testing strategy

Test deterministic business behavior before adding live model variability. The execution engine must be usable in tests with fake visual/attestation results while still enforcing exactly the same transition rules used by the worker.

| Layer | Main purpose |
| --- | --- |
| Pure unit tests | SOP validation, permissions, transitions, alert eligibility/deduplication and report semantics |
| Postgres integration | Migrations, tenant/assignment scope, idempotency, transactions, constraints and evaluation queries |
| Worker contract tests | Tool schemas, server-injected context, interaction modes, timeouts and cleanup with mocked providers |
| Model evaluation | Grounded answers and visual criterion accuracy on versioned datasets |
| Realtime smoke tests | Actual LiveKit/OpenAI audio, activation, alerts, tools, video and reconnect |
| Browser E2E | Queue-to-report journeys, accessible alternatives, permissions and PWA lifecycle |
| Operational tests | Latency, concurrency, soak, backup/restore and provider degradation |

## 2. SOP and execution tests

### SOP ingestion/publication

- Markdown, TXT and text-PDF fixtures preserve expected headings/page citations.
- Empty, oversized, encrypted and image-only documents fail clearly.
- Duplicate step/criterion IDs, missing citations, unsupported fields and invalid branches are rejected.
- Model-generated executable expressions are never evaluated.
- Draft edits validate; published versions reject modification.
- New runs pin the selected version; old runs remain on their original version.
- Prompt-injection text inside an SOP remains quoted data and cannot invoke publication/tools.

### Transition unit/integration cases

- Correct visual result advances exactly one step.
- Missing/failed/unclear required criterion cannot advance.
- Missing evidence object or failed evidence upload cannot produce `ai_verified`.
- Attestation and accepted choice produce the correct distinct status.
- Failed choice creates the configured hold/deviation/escalation.
- Retry/retest increments the attempt and preserves the rejected original.
- Duplicate tool/RPC request returns the original result without another advance.
- Two concurrent valid requests cannot advance two steps.
- Stale expected step/attempt/run version is rejected.
- Skip requests cannot bypass required steps.
- Full close fails with any unresolved required step.
- Partial close preserves held/unreached steps and reason.
- Report return creates rework and a new review/report revision.
- Run, step, attempt and audit event roll back together on failure.

## 3. Silent/alert/consultation tests

These are first-class release gates, not prompt-quality observations.

| Test | Required assertion |
| --- | --- |
| Join run | No greeting `generate_reply`, assistant audio or normal microphone conversation |
| Correct visual check | Step advances; no assistant audio output or routine response text |
| Correct attestation/choice | Step advances silently |
| Failed visual criterion | One alert linked to the exact rejected attempt; visible correction and at most one spoken response |
| Failed structured choice | Eligible deviation/alert is recorded and correction follows the published recovery |
| Identical repeated failure | No audio nag loop; suppression is logged and visual alert remains |
| New attempt/changed failure | A new alert is allowed and linked to the new event |
| Click **Ask TARa** | Consultation activates and normal microphone/text input becomes available |
| Ask a correct-work question | Agent responds using current-step/SOP context without requiring a failure |
| Return to silent | Normal microphone/text input is disabled and routine speech stops |
| Mute during alert | No audio, but visible alert and audit history remain |
| Reconnect | Returns to silent mode and authoritative current run; no repeated greeting |
| Provider speech failure | Visible correction survives and output failure is logged |

Assert actual audio/output behavior and microphone state, not only CSS labels or an empty chat array. `agent_outputs` must make proactive utterances auditable against eligible triggers.

## 4. RBAC and API tests

- Anonymous, malformed and expired JWT cases.
- Each role’s allowed and forbidden endpoints.
- Technician cannot access another assignee’s run, evidence, activity or report.
- Organization cannot be changed through body/query/path/model arguments.
- Supervisor can review but cannot use technician execution mutations unless separately authorized.
- SOP manager can publish but cannot approve reports by default.
- Owner evaluation access works without introducing a user-admin frontend.
- LiveKit room token grants and explicit dispatch metadata are scoped correctly.
- Dispatch/provider failure does not return false connection success.
- Signed evidence URL authorization and expiry.

## 5. Retrieval and grounded-answer evaluation

Create a small versioned set from real published SOPs:

- Exact clause lookup.
- Paraphrased “why” question.
- Tool/part/reference-media question.
- Question whose answer is outside the SOP.
- Contradictory web snippet versus approved SOP.
- Prompt-injection chunk.
- Question spanning a prerequisite and current step.

Measure:

- Correct source/chunk retrieved.
- Correct citation shown.
- Grounded answer rate.
- Appropriate “not found/unclear” rate.
- Full-text query and total response latency.

Only if lexical retrieval misses the required questions should a pgvector experiment proceed against the same dataset.

## 6. Vision evaluation

Build a reviewed dataset under realistic camera, lighting, distance and bench conditions. Include:

- Correct frame for each criterion.
- Clearly incorrect work.
- Keycap fitted/removed and switch visible/occluded examples.
- Wrong component/object.
- Blur, glare, darkness, occlusion and cropped frames.
- Empty/blank/camera-covered frames.
- Stale frame from a previous step/attempt.
- Ambiguous frames where `unclear` is the correct result.

Measure per SOP step and criterion:

- **False-accept rate:** incorrect/unclear work marked pass; primary release risk.
- False-reject rate.
- Unclear rate and retake usefulness.
- Criterion-level agreement with reviewers.
- Exact evidence/verdict linkage.
- Latency, image tokens and storage size.

Model self-confidence is not ground truth. Release thresholds must be agreed from the pilot’s risk tolerance; do not invent a universal “95% safe” claim. Any unresolved exact-frame correlation problem blocks visual auto-completion.

## 7. Realtime and browser E2E

Credentialed nightly/pre-release realtime tests:

1. FastAPI creates run, dispatch and token.
2. Real browser/client joins and worker reaches session ready without greeting.
3. One activated audio turn produces intelligible output.
4. Typed consultation produces equivalent behavior.
5. A tool reads the correct organization’s SOP/run.
6. A mutation is idempotent and survives interruption semantics.
7. Barge-in works during consultation and does not duplicate writes.
8. A silent visual check sends bounded frames and correct pass produces no speech.
9. A failed check produces one corrective alert.
10. Reconnect restores the pinned SOP/current step and drops stale frames.
11. OpenAI/LiveKit/tool/storage failures produce controlled visible outcomes.

Playwright paths:

- Login and queue filters.
- Start/resume and readiness failures.
- Complete WO-1042 happy path.
- First rejected inspection and successful retry.
- Won’t-seat and failed key-test paths.
- Escalation, retest and partial close.
- Ask TARa SOP/reference/parts/web/activity interactions.
- Report evidence modal, review, return/rework, JSON and print.
- Keyboard-only operation and accessible dialog/focus behavior.
- Camera/microphone denial, refresh, offline/reconnect and stale snapshot recovery.

## 8. CI gates

Planned checks on every pull request:

```text
Ultracite check
Next.js TypeScript check and production build
Python Ruff check + format check
Python mypy
Python unit tests
PostgreSQL 18 integration tests and Alembic upgrade/drift check
OpenAPI-generated type drift check
Web/API/worker Docker builds
Railway TypeScript IaC plan when `.railway/**` changes
Secret scanning
```

Run real-provider realtime tests nightly or before release with protected credentials. Keep unit tests independent of external providers so ordinary CI remains fast and reliable.

## 9. Local development topology

Planned Compose services:

- `web` — Next.js.
- `api` — FastAPI/Uvicorn.
- `worker` — same server source/image revision, LiveKit start command.
- `postgres` — PostgreSQL 18 with persistent volume.
- `minio` — local S3-compatible source/evidence objects.

Planned root command shape:

```bash
bun install
cd apps/server && uv sync
bun run db:up
bun run db:migrate
bun run seed:demo
bun run dev
```

The exact scripts are implementation outputs; they are not claimed to exist yet. `seed:demo` creates the initial users, one organization, parts and the reviewed SOP-KBD-01/WO-1042 fixture. Production secrets/default demo passwords must never be reused.

## 10. Production deployment

The deployment target is Railway; [11 — Railway deployment](11-railway-deployment.md) is the detailed implementation and operations plan.

- Manage one Railway project with isolated staging/production environments through reviewed `.railway/railway.ts` TypeScript IaC, not new legacy `railway.json` files.
- Build and deploy web, API and worker from the same source revision using root-context Dockerfiles.
- Use Railway PostgreSQL 18 over private networking and a private S3-compatible evidence bucket with explicitly accepted backup/retention limits.
- Run Alembic once in the API pre-deploy command with a bounded timeout. Do not run competing migrations in every API/worker startup.
- Start API and worker as separate services with runtime-only secrets and explicit per-service start commands.
- Expose only Next.js publicly; its server proxies same-origin `/api` requests to private FastAPI. Browser media connects directly to LiveKit.
- Check API/database/storage readiness before traffic switching, then prove worker registration with a real explicit-dispatch smoke test.
- Drain old realtime workers gracefully and test forced-deadline reconnect behavior.
- Use backward-compatible migrations so web/API/worker rollback remains possible without automatic database downgrades.
- Keep the initial deployment simple: one region/replica, no Kubernetes, PR environments or autoscaling control plane.

## 11. Backup and recovery

- Enable PostgreSQL backups and test restoring to a clean instance.
- Define object-storage versioning/retention appropriate to evidence policy.
- Record the schema migration and object metadata needed by each report.
- Verify restored report/evidence references and organization isolation.
- Document recovery from worker loss, API loss, database failover and revoked provider credentials.

## 12. Rollout gates

### Gate A — Technical feasibility

- Realtime audio/tool/interruption smoke passes.
- Silent/alert/consultation behavior passes.
- Exact frame/verdict correlation is proven or the bounded still-image fallback is selected.

### Gate B — Deterministic vertical slice

- WO-1042 runs with real database transitions/evidence and no scripted verdicts.
- All state-machine/RBAC/integration tests pass.

### Gate C — Prototype parity

- Every prototype help/failure/report journey works with real services.
- Accessibility and reconnect paths pass.

### Gate D — Low-risk pilot

- Start with keyboard/low-risk SOPs only.
- Supervisors review all initial AI visual completions and rejected samples.
- Latency, cost, grounded-answer and false-accept results meet agreed pilot thresholds.

### Gate E — Broader procedures

- Expand only after each new SOP has its own reviewed criteria and evaluation set.
- Do not infer safety on a new domain from keyboard-repair results.

## 13. Definition of done

A feature is not done when its page renders. It is done when:

- Authorization and organization scope are tested.
- State and audit commit correctly, including retries/failures.
- Silent/alert/consultation behavior matches the contract.
- Evidence and source provenance are visible.
- Errors do not simulate success.
- Reconnect/resume is safe.
- Relevant latency/usage metrics exist.
- The corresponding prototype journey has an automated test.
