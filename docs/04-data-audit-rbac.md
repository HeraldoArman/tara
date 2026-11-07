# 04 — Data, evidence, audit, evaluation and RBAC

## 1. Persistence approach

Use PostgreSQL 18 for all structured state and S3-compatible object storage for documents/frames. Keep normal relational current-state tables for fast queries and an append-only audit table for history. Do not replay events to reconstruct ordinary runtime state.

## 2. Core entity groups

| Group | Tables/records | Purpose |
| --- | --- | --- |
| Identity | `organizations`, `users` | One-company scope, seeded users and roles |
| Work | `work_orders`, `parts` | Assigned jobs and real parts/reference records |
| SOP | `sops`, `sop_versions`, `sop_documents`, `sop_chunks`, `sop_media` | Immutable procedures, source provenance, retrieval and diagrams |
| Execution | `runs`, `run_steps`, `step_attempts` | Current workflow state and every check/response |
| Quality | `evidence`, `deviations`, `escalations` | Accepted/rejected artifacts and unresolved work |
| Agent | `transcript_turns`, `tool_calls`, `agent_outputs` | Final consultation turns, tool observability and proof of speech-mode compliance |
| Governance | `audit_events`, `reports`, `report_reviews` | Append-only history, report snapshots and review decisions |

Additional lookup/enum values should be PostgreSQL enums or constrained text where they improve integrity. Avoid creating tables for values that never need independent behavior.

## 3. Important records

### `users`

- `id`, `org_id`, `username`, `password_hash`, `role`, `active`, timestamps.
- Unique username within the organization.
- Roles: `technician`, `supervisor`, `sop_manager`, `owner`.
- Initial users come from a seed/administrative script. There is no user-admin UI in v1.

### `work_orders`

- Organization, external/reference ID, title, device/asset details, issue, priority.
- Assigned technician.
- SOP and version selected for new runs.
- SLA/estimate and queue status.
- No customer data beyond what the work record actually needs.

### `sop_versions`

- SOP, monotonically increasing version number and lifecycle status (`draft`, `published`, `archived`).
- Immutable validated `definition_json` after publication.
- Source document/hash, creator, publisher and publication timestamp.
- Unique `(sop_id, version_number)`.

Draft definitions may be edited. Published definitions receive no update endpoint.

### `runs`

- Organization, work order, assigned technician and pinned `sop_version_id`.
- Status, current step, row version and active timing.
- LiveKit room/dispatch identifiers as opaque operational metadata.
- Started, paused, ended and last-active timestamps.
- A partial unique constraint permits only one resumable active/paused run per work order.

### `run_steps`

- Run, published step ID and display order.
- Status, current attempt and completion timestamp.
- Latest outcome summary for fast UI/report queries.
- Unique `(run_id, sop_step_id)`.

### `step_attempts`

- Run, run step and monotonically increasing attempt number.
- Kind: visual, attestation, choice or finalization.
- Outcome and structured `result_json`.
- Exact criterion results/options, actor type/ID and model/tool correlation.
- Started/completed timestamps and error details.
- Unique `(run_step_id, attempt_number)` and a unique idempotency key where present.

### `evidence`

- Organization, run, step and attempt linkage.
- Object key and SHA-256 content hash.
- Media type, byte size, dimensions and capture/source timestamps.
- Source (`live_camera`, supported fallback) and accepted flag.
- Assessment/model identifiers and criterion-result reference.
- Created timestamp; no ordinary delete/update from the live UI.

### `audit_events`

Required envelope:

```text
id and organization_id
work_order_id, run_id and sop_version_id
run_step_id and attempt_id where applicable
event_type and structured payload
previous_state and new_state where applicable
actor_type, actor_id and actor_role
client_occurred_at when available and server_recorded_at
correlation_id, causation_id and idempotency_key
model/tool/version references where applicable
```

Event examples:

- Run created, joined, paused, resumed, reconnected and closed.
- Consultation activated/deactivated.
- Step entered, attempt started, visual criteria returned, attestation recorded.
- Evidence accepted/rejected/capture failed.
- Incorrect choice, skip attempted, unsafe request and coaching shown.
- Alert requested/spoken/muted/suppressed/failed.
- Tool requested/completed/failed and external search performed.
- Deviation/escalation created, assigned and resolved.
- Retest/rework opened and subsequently passed.
- Report generated/exported/approved/returned.

The API has no generic event update/delete endpoint. Database-level tamper resistance and retention policies can be strengthened later if a real compliance requirement appears; an application-level append-only label is not proof against a database administrator.

## 4. Agent output and transcript records

### `agent_outputs`

Use this small record to prove the interaction policy:

- Run, interaction mode (`alert` or `consultation`) and related alert/audit event.
- Trigger, final response text and speech status.
- Model/session identifiers, start/first-audio/end timestamps.
- Mute/suppression/error reason where relevant.

A proactive output without an eligible trigger event fails testing and should be treated as a defect.

### `transcript_turns`

- Store final user/assistant text for consultations and proactive alert text.
- Link to run, optional step, LiveKit/model item and agent output.
- Record interruption and timing metadata.
- Do not persist every interim transcription fragment.
- Do not store continuous raw audio by default. In silent mode the normal microphone conversation is disabled, so there is no hidden always-on transcript history.

### `tool_calls`

- Tool name, sanitized arguments and structured result/error.
- Run/step/attempt and model function-call ID.
- Start/end/duration, timeout/cancellation and idempotency result.
- References to large evidence/search payloads rather than duplicating them into audit JSON.

## 5. Mistake and exception lifecycle

### Deviations

A deviation records a discrepancy between required and observed work:

- Type, severity, description, source attempt/evidence and current status.
- Created by technician, AI assessment or system rule.
- Resolution must reference a later successful attempt or authorized supervisor action.

### Escalations

An escalation requests supervisor attention:

- Current run/step, related deviation, reason and status.
- Creator, assignee, timestamps and resolution.
- Technicians may request one but cannot resolve their own escalation as supervisors.

### Retest and rework

- Retest creates a new attempt while preserving the failed attempt and open issue.
- A successful retest may resolve the related issue according to the published rule.
- Report return creates explicit rework and a new report revision; it does not simply erase a signature.
- Partial close leaves held/unreached steps visible and cannot convert them into compliant steps.

## 6. Reports and reviews

### Report snapshot

A report captures:

- Work order, technician, run and pinned SOP/version.
- Complete/partial outcome and active execution time.
- Every run step and every attempt.
- AI-verified, attested, held, skipped-by-rule and unreached steps separately.
- Accepted and rejected evidence galleries.
- Criterion failures, deviations, escalations and overrides.
- Tool calls, alerts and audit timeline.
- Report revision and content hash for integrity checking.

Use `ai_verified`, not an ambiguous claim that a human verified the work. Model confidence may appear as diagnostic metadata but not as a guarantee or percentage chance of correctness.

### Review

- `report_reviews` is append-only: submitted, returned, approved and later revisions.
- Supervisor/owner role required.
- Return requires a note and creates technician rework.
- Approval applies to a specific report revision.
- JSON export and print/PDF are read operations scoped to the same report authorization.

Do not describe the initial hash as tamper-proof digital signing. It is a content-integrity cue; real non-repudiation requires a separate requirement.

## 7. Minimal JWT and RBAC

### Authentication slice

- `POST /auth/login` verifies username/password and issues one expiring signed JWT.
- Passwords use Argon2id hashes.
- JWT includes subject, organization, role, issue/expiry times and issuer.
- FastAPI dependencies parse the token and enforce active user/role/organization checks.
- Initial accounts are seeded; owner can be provisioned by an administrative seed/script.
- No refresh-token service, MFA, SSO, invitation system or self-service recovery in v1.

### Authorization matrix

| Capability | Technician | Supervisor | SOP manager | Owner |
| --- | :---: | :---: | :---: | :---: |
| View assigned queue/run | Assigned only | Organization read | — | ✓ |
| Submit evidence/attestation | Assigned run | — | — | Optional owner-run only |
| Activate consultation and use allowed tools | Assigned run | If reviewing live, read-only tools | — | ✓ |
| Request escalation | ✓ | ✓ | — | ✓ |
| Resolve escalation | — | ✓ | — | ✓ |
| Approve/return reports | — | ✓ | — | ✓ |
| Import/edit/publish SOP | — | — | ✓ | ✓ |
| View evaluation | Own run history | Organization quality views | SOP quality views | ✓ |
| View/export evidence/report | Assigned/own | Organization scope | Only explicitly related SOP quality data | ✓ |

Authorization is enforced in repositories/services and at agent-tool boundaries, not only by hiding navigation. Every query includes organization scope; technician queries also include assignment/ownership.

## 8. Owner evaluation

Use ordinary SQL queries over `runs`, `run_steps`, `step_attempts`, `evidence`, `deviations` and `tool_calls`.

V1 metrics:

- Runs completed, partially completed and returned.
- First-pass success by SOP/version/step.
- Attempts and retakes per completed step.
- Failure count grouped by criterion.
- Attested versus AI-verified completion counts.
- Held/unreached steps and partial-close reasons.
- Deviation/escalation frequency and time to resolution.
- Active execution duration by run/step.
- Tool/model failure rate and latency.
- Alert count and repeated/suppressed alert count.

Do not reduce quality to one “compliance ring.” Show evidence coverage, exceptions and first-pass success as separate measures. Add materialized views or an analytics platform only after measured query problems.

## 9. Integrity, indexes and concurrency

Minimum constraints/indexes:

- Unique SOP version number per SOP.
- Unique run step per published step ID.
- Unique attempt number per run step.
- Unique idempotency key within the appropriate run/tool scope.
- One active/paused run per work order.
- Indexes on `(org_id, run_id)`, `(run_id, event_timestamp)`, attempt outcome/criterion query fields and report review scope.
- Optimistic `version` on runs or equivalent row locking for transitions.

The transaction that commits a step result must also commit its audit event and current-state change. Publishing LiveKit messages occurs after commit; consumers can always refetch the snapshot if an event is missed.

## 10. Data minimization and retention

Collect data needed for execution, evaluation, debugging and provenance—not unlimited raw media.

- Retain selected accepted/rejected evidence and final consultation/alert transcripts.
- Keep operational metrics without sensitive free text where possible.
- Make retention/deletion periods an organization deployment policy before production.
- Do not silently delete evidence still referenced by an active or retained report.
- Redact passwords, tokens, secret headers and arbitrary sensitive values from logs/tool arguments.
- Provide authorized export before any retention deletion if the organization requires it.
