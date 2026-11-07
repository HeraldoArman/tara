# TARa API contract

All API paths use `/api/v1`. JSON field names use camelCase. Lists return `{ "items": [] }`. Cookie authentication uses `tara_session`; the API checks Origin for cookie-authenticated mutations. Errors return `{ "error": { "code", "message", "requestId", "details" } }`.

- `GET /auth/me` → `{id, organizationId, username, name, role}`.
- `POST /auth/login` accepts `{username,password}` and returns the user.
- `GET /work-orders?filter=all|priority|standard` → items with `{id,reference,title,asset:{model,serial},issue,priority,status,assignedTo,sopVersionId,estimatedMinutes,runId}`.
- `POST /work-orders/{id}/runs` → authoritative run snapshot.
- `GET /runs/{id}` → `{id,workOrderId,version,status,interactionMode,currentStepId,currentAttemptId,workOrder,sop:{id,key,title,version},steps,alerts,evidence,deviations,escalations,startedAt,elapsedSeconds}`.
- Each run step contains `{id,title,instruction,rationale,sources,verification,status,attempts}`. Verification `kind` is `visual|attestation|choice|finalization`; visual criteria contain `{id,description}`, choice options/passOptions are strings. Each attempt has `{id,number,kind,outcome,result,createdAt}`.
- `POST /runs/{id}/connection` → `{url,token,roomName,workerIdentity}` only after explicit successful worker dispatch. Missing configuration returns `PROVIDER_UNAVAILABLE`.
- Worker RPC mutations use `{expectedVersion,expectedStepId,expectedAttemptId?,idempotencyKey,...}`. Responses contain the latest snapshot; `run.finish` additionally supplies `reportId`.
- `GET /runs/{id}/activity` → `{items}` chronological audit records.
- `GET /sops` → `{items}` of SOPs with versions; `GET /sops/{id}/versions/{version}` returns the version object with `{id,sopId,key,title,version,status,definition,validationErrors,source}`. Version path accepts display version or numeric version number.
- `POST /sops/imports` accepts multipart `file`. Supported Markdown/TXT/text PDFs become drafts, never automatically published. `PATCH /sop-versions/{id}` accepts `{definition}`. Validate/publish use POST; search uses `GET .../search?q=`.
- `GET /reports` → `{items}`. `GET /reports/{id}` → `{id,runId,outcome,status,workOrder,sop,steps,evidence,deviations,escalations,auditEvents,reviews,createdAt,digest}`. Review POST accepts `{decision:"approved"|"returned",note}`. Export is authorized JSON.
- `GET /evaluation/summary` returns aggregate counts, firstPassRate, evidenceCoverage, stepMetrics, criterionFailures and latency records.
- `GET /parts?q=` → `{items}` real seeded/organization part records.

Unconfigured realtime, vision, decomposition, web search or evidence providers return explicit errors; no production verdict is fabricated. Development seeds are labeled demonstration data.

## Reference media and evidence provenance

Run snapshots and SOP versions include `media` records: `{id,title,heading,page,width,height,mediaType,urlEndpoint}`. Step `referenceMediaIds` resolve only within the pinned version. Search responses include associated `media` in the same result.

A manager/owner uploads a cited draft reference with `POST /sop-versions/{id}/media` using multipart fields `file,title,heading,page?`. JPEG/PNG/WebP file signatures and actual dimensions are validated. Published media is immutable; adding or changing references requires a new draft version. `GET /sop-media/{id}/url` returns an authorized 120-second viewing link. Publication rejects reference IDs outside the exact version.

Evidence adds actual `width,height`, provider `assessmentId` and server command `correlationId`. SHA-256 covers the exact stored assessed bytes. Invalid image signatures cannot produce a passing attempt. Report exports expose `snapshot` and `digestScope` so the immutable snapshot's canonical JSON hash can be reproduced.

## Operational measurements

`GET /observability/metrics` is limited to owner/supervisor and emits Prometheus text. Named metrics cover API request counts/durations, domain operation durations/safe error codes, attempt outcomes, idempotent replays, selected object sizes/storage durations, eligible alert creation and explicit consultation activations. OpenTelemetry spans cover run creation, transitions, retrieval, source decomposition and import. An exporter can be configured by the runtime; absent an exporter, no distributed-trace delivery is claimed. Metrics contain bounded labels; request bodies, credentials and signed URL query strings are excluded. Provider/worker usage is recorded separately by the realtime worker. Latency targets are not measured performance claims.
