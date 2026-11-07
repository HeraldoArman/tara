# 09 — Roadmap, tradeoffs, risks and deferred work

## 1. Delivery sequence

The order is intentional: prove the uncertain realtime/vision behavior early, then make deterministic execution correct, then expand UI/features. Do not spend the first milestone rebuilding every prototype screen before a real agent can complete one checked step.

### Milestone 0 — Documentation and technical spike

Deliver:

- This documentation set.
- One minimal Python LiveKit worker using the direct OpenAI plugin.
- Real audio activation/deactivation test.
- One silent passing visual check and one proactive failed-check alert.
- One idempotent execution tool against a temporary test service.
- Exact frame/verdict correlation evidence.
- Locked compatible Python dependencies and measured baseline traces.

Exit criteria:

- No greeting/routine speech.
- **Ask TARa** enables normal conversation; deactivation disables it.
- Alert is linked to a real failed-attempt event and is not duplicated.
- Exact frame correlation is demonstrated, or the on-demand still-image fallback is chosen.
- No continuous perception/memory/planner systems exist in the spike.

### Milestone 1 — Foundation

Deliver:

- Better-T-Stack frontend and original app preserved under `prototype/`.
- FastAPI + worker project, PostgreSQL 18, Alembic and local S3.
- Seeded organization/users, minimal JWT login and four-role dependencies.
- Railway staging deployment/CI, environment validation and health checks.
- Initial design-token/component port from the prototype.

Exit criteria:

- Login, queue fixture and role/organization API tests pass.
- Web/API/worker/Postgres/S3 run locally with reproducible commands.
- No time has been spent building auth administration features.

### Milestone 2 — SOP publishing and deterministic execution

Deliver:

- Markdown/TXT/text-PDF import and structured draft decomposition.
- Draft editor, validation and immutable publication.
- Versioned SOP definition and full-text chunks.
- Work orders, runs, run steps, attempts, evidence and audit events.
- Transactional transitions and report-snapshot foundation.
- Deterministic tests using fake assessment results.

Exit criteria:

- WO-1042 can execute entirely through domain calls without a model.
- Invalid, duplicate, concurrent and stale transitions are rejected correctly.
- Published SOP versions and all attempts are immutable/traceable.

### Milestone 3 — Real WO-1042 vertical slice

Deliver:

- Run creation/resume, LiveKit dispatch/token and realtime worker.
- Silent/alert/consultation modes.
- Real visual checks, attestation/choices and object-stored evidence.
- Live checked/current/locked/held checklist and visible alert history.
- Reconnect and stale-attempt protection.

Exit criteria:

- The correct path is quiet from join to close.
- Rejected inspection triggers one corrective alert and retains its frame.
- **Ask TARa** supports a grounded question without a preceding mistake.
- Refresh/reconnect restores the same run and current step.

### Milestone 4 — Prototype parity

Deliver:

- SOP/rationale/reference help, parts and real cited web search.
- Issue recording, won’t-seat, failed key test, escalation and retest.
- Activity drawer, complete/partial close and report generation.
- Accepted/rejected galleries, timeline, supervisor review, return/rework, JSON and print/PDF.
- Remaining queue/readiness/recent-report behavior.

Exit criteria:

- Every prototype agentic interaction has a real implementation or a clearly documented unsupported provider state.
- No simulated verdict/search/identity remains in the production path.
- Every failure branch has E2E coverage.

### Milestone 5 — Evaluation and production hardening

Deliver:

- Owner/supervisor/SOP quality evaluation views.
- Full-text retrieval evaluation and vision false-accept dataset.
- Accessibility, PWA lifecycle, security, latency/load and soak testing.
- Backup/restore, migration/release and worker-drain runbooks.
- Low-risk pilot dashboard for model/latency/cost/quality review.

Exit criteria:

- Release gates in [08](08-testing-deployment.md) pass.
- Initial pilot thresholds are agreed from measured results.
- Scope has not acquired unnecessary agents, databases or auth features.

## 2. Tradeoffs

| Decision | Benefit | Cost/limit | Upgrade trigger |
| --- | --- | --- | --- |
| Silent execution with explicit consultation | Quiet workspace, fewer model responses and less audio processing | User must discover/click **Ask TARa**; spoken mistakes are not heard while silent | Usability study shows activation is unclear or hands-free help is essential |
| Proactive alerts only at checks/events | Bounded latency/cost and no continuous narration | Mistakes between checks can go unnoticed | A validated use case justifies a separate activity-detection design |
| AI can pass every visual step | Maximum automation and prototype parity | False accepts can certify incorrect work | Reviewed evaluation determines where human confirmation is necessary |
| Direct OpenAI LiveKit plugin | Required realtime video path and direct provider control | Own API key/billing and provider coupling | LiveKit Inference gains required image support and proves better operations |
| One Python project, two processes | Shared domain transactions and fewer packages | API/worker dependencies are coupled | Independent release/scaling/dependency needs become real |
| Relational current state + audit events | Simple reads and transactions | Current projection and history both need writes | No change expected; event replay adds complexity without product value |
| JSONB published SOP definition | Flexible immutable document with schema validation | Less convenient ad hoc SQL inside definitions | Stable step reporting requirements justify more relational projections |
| PostgreSQL full-text RAG | No vector infra or query-embedding call | Weaker synonym/semantic retrieval | Evaluation set demonstrates unacceptable misses |
| Synchronous bounded SOP import | No queue/worker infrastructure | Large documents can hit request limits | Real imports exceed practical request duration |
| JWT + seeded users | Very small auth implementation | No self-service identity lifecycle | Actual customer/security requirement appears |
| One organization with `org_id` | Minimal operations with basic scope retained | Not a multi-tenant SaaS control plane | A second customer organization is approved |
| Online PWA | Installability without unsafe offline transitions | Field execution needs connectivity | Offline operation becomes a funded/core requirement |
| Selected evidence/final transcripts | Useful audit with bounded storage/privacy exposure | No complete raw media replay | Legal/operational requirement explicitly demands more retention |
| Full realtime model initially | Best starting point for vision quality evaluation | Potentially higher cost/latency than mini | Same-dataset benchmark proves mini meets quality targets |

## 3. Risk register

| Risk | Impact | Early signal | Mitigation / release gate |
| --- | --- | --- | --- |
| AI false-accepts incorrect work | Incorrect or unsafe completion/report | Reviewer disagreement, vague criteria, wrong-object passes | Exact evidence, criterion outputs, unclear rejection, per-SOP evaluation and initial 100% review |
| Stored frame differs from assessed frame | Audit evidence does not prove verdict | Correlation test fails or stale result advances | Phase-0 gate; use bounded explicit image verification or block auto-completion |
| Agent becomes talkative despite requirement | Technician distraction and higher latency | Greetings, pass compliments, repeated alerts | Audio disabled by default, orchestration gates, no routine `generate_reply`, alert dedup and E2E audio assertions |
| User cannot get help hands-free quickly | Frustration or unsafe workaround | **Ask TARa** not discovered/used | Prominent accessible button, clear state, usability test; do not secretly revert to always-on listening |
| Mistake occurs between checks | Delayed/missed correction | Pilot incident reports | Visible check cadence and documented limitation; add detection only as a separately validated feature |
| SOP decomposition invents steps/criteria | Unsafe published procedure | Missing citations or reviewer edits | Structured schema, source links, business validation and mandatory human publication |
| Model/provider update changes behavior | Quality or latency regression | Evaluation drift after dependency/model change | Lock dependencies, configurable explicit model, versioned eval before rollout |
| OpenAI/LiveKit outage | Live execution blocked | Provider errors/timeouts | Preserve state/instructions, controlled alerts, retry/reconnect and no simulated passes |
| Full-text retrieval misses terminology | Wrong/unhelpful answer | Grounded-answer eval misses | Better chunks/synonyms first; measured pgvector experiment only if needed |
| External web content manipulates agent | Wrong instruction or tool misuse | Injection-oriented snippets | Consultation-only search, untrusted-data prompts, no arbitrary fetch/code execution, SOP precedence |
| Evidence/transcript collection harms privacy | Trust/compliance exposure | Unexpected raw media or broad access | Silent mic default, selected frames/final turns, signed URLs and organization retention policy |
| PWA/media lifecycle loses state | Duplicate or stale step completion | Background/refresh/reconnect failures | Silent rejoin, fresh snapshot, stale-frame drop and idempotency tests |
| Audit growth affects queries/storage | Slow reports/evaluation and rising cost | Table/object growth and p95 queries | Pagination/indexes, usage measurement and defined retention before adding analytics infrastructure |
| Scope reproduces old Memora complexity | Slow delivery and high latency | New planners, memory loops, tool chains or databases | One-agent/one-tool-step rule, deferred list and milestone review |

## 4. Explicitly deferred

Do not add these during v1 without replacing an existing requirement and revisiting the plan:

- Always-on conversational microphone or continuous spoken coaching.
- Continuous activity/mistake recognition between checks.
- Multi-agent handoffs, supervisor agents, planner loops and autonomous memory.
- Long-term semantic/episodic user memory.
- DOCX, scanned PDF/OCR and video-file SOP ingestion.
- Automatic SOP publication.
- Arbitrary workflow expressions/scripts or a visual DAG builder.
- Offline visual verification/completion and background sync of completions.
- Multiple customer organizations and tenant administration.
- SSO, MFA, refresh-token rotation, invitations, password recovery and user-admin UI.
- Neo4j, FAISS, standalone vector database, Redis, Celery, Kafka and Kubernetes.
- Continuous raw audio/video retention.
- Native mobile apps and external ERP/EAM integrations.
- Cryptographic signing/non-repudiation claims beyond basic content hashes.

## 5. Operational decisions still needed before production

These do not block the initial scaffold/spike:

- Actual pilot camera, microphone, bench lighting and browser/device.
- Web-search provider and whether external search is enabled by default.
- Railway region/resource tier, PostgreSQL backup/HA choice, and whether Railway Bucket controls meet evidence-retention requirements.
- Retention periods for evidence, transcripts, reports and logs.
- Reviewed per-SOP visual false-accept/false-reject release thresholds.
- Pilot concurrency and monthly usage/cost budget.

Avoid turning these into broad new subsystems. They are configuration/operational decisions unless a requirement changes.

## 6. Change control for the main idea

Before adding any new AI call or agent capability, ask:

1. Is it needed for SOP publishing, an activated consultation, or an eligible execution alert?
2. Can direct current-step context or one SQL query provide the same result?
3. Does it add a continuous loop, another model path or a mandatory tool chain?
4. How are latency, false accepts, provenance and silence tested?
5. What existing complexity can be removed instead?

If the answer is merely “the agent could be more autonomous,” defer it. The product advantage is controlled execution and credible evidence, not the number of agents.
