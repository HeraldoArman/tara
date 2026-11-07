# 05 — API and frontend plan

## 1. Frontend principles

- Use [`new-design/`](../new-design/) as the live workspace’s new visual reference. It changes presentation only; functional behavior remains defined by this plan.
- Make execution state authoritative and visible; never rely on agent speech to know what happened.
- Keep correct execution quiet.
- Make **Ask TARa**, silent mode, active listening and alerts unmistakable.
- Provide accessible UI equivalents for voice actions without bypassing evidence rules.
- Use Next.js Server Components for initial queue/SOP/report/evaluation reads and client components only for interaction/realtime behavior.
- Generate TypeScript API types from FastAPI OpenAPI rather than maintaining parallel handwritten DTOs.

## 2. Application routes

| Route | Purpose |
| --- | --- |
| `/login` | Username/password login only |
| `/` | Assigned queue, filters, readiness, resume strip, shift stats and recent reports |
| `/runs/[id]` | Live video, checklist, evidence, alerts and assistant consultation |
| `/sops` | Authorized SOP/version library |
| `/sops/import` | Markdown/TXT/PDF upload and bounded AI decomposition request |
| `/sops/[id]/versions/[version]` | Draft editing, validation, citations and publication |
| `/reports` | Authorized report/review list |
| `/reports/[id]` | Steps, attempts, evidence, deviations, alerts, timeline, review and exports |
| `/evaluation` | Owner/supervisor/SOP-quality operational views |

There is deliberately no `/admin/users` route in v1. Initial users and roles are seeded.

## 3. Workspace composition

```text
┌─────────────────────────────────────────────────────────────────┐
│ WO / asset / pinned SOP version       Connection + silent state │
├──────────────────────────────┬──────────────────────────────────┤
│ Live bench preview           │ Current step and instruction     │
│ Scan/evidence status         │ Checked/current/locked checklist │
│ Last accepted/rejected frame │ Alert or consultation messages   │
│ Current criterion results    │ Reference/tool cards             │
│                              │ Ask TARa / Return to silent    │
│                              │ Typed input in consultation only │
├──────────────────────────────┴──────────────────────────────────┤
│ SOP drawer / activity drawer / parts / evidence / report links │
└─────────────────────────────────────────────────────────────────┘
```

### Always visible

- Current instruction, source clause and required criteria.
- Checked/current/locked/held status for every step.
- Agent connection and check state.
- Interaction mode: `Silent`, `Alert`, or `Ask TARa active`.
- **Ask TARa** or **Return to silent mode** action.
- Camera and mute state.
- Visible text for every proactive alert.

### Silent mode

- Normal microphone conversation is disabled.
- The composer is disabled or hidden with a clear “Activate Ask TARa to type” explanation.
- Automatic visual checks and accessible step-response controls still work.
- Passing results update the checklist without speech.
- Reference content may appear automatically when relevant, but it is not narrated.

### Alert mode

- A visible alert identifies the step, failed criterion/issue and safe next action.
- One short spoken correction may play unless muted/superseded.
- The user can retry through an accessible control or activate consultation for questions.
- The alert does not automatically open a continuing conversation.

### Consultation mode

- Entered only by clicking **Ask TARa**.
- Enables microphone input and the text composer.
- Supports all prototype help intents: rationale, SOP/activity drawers, reference images, tools, parts, web search, report contents and visual questions.
- Supports spoken attestation/choice responses; accessible controls remain available.
- **Return to silent mode** disables normal microphone/text turns. An optional inactivity return can be added only if user testing shows it is helpful.

## 4. Minimal REST API

Prefix application endpoints with `/api/v1`. The following is the planned surface, not a requirement to create unused CRUD for every table.

### Health

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/health/live` | FastAPI process liveness without external dependencies |
| `GET` | `/health/ready` | Expected Alembic head, PostgreSQL and evidence-storage readiness |

Next.js exposes its own minimal `/health` route. Railway deployment healthchecks and continuous synthetic checks are different concerns; see [11 — Railway deployment](11-railway-deployment.md).

### Authentication

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/auth/login` | Verify username/password and set an HttpOnly cookie containing the expiring JWT |
| `POST` | `/auth/logout` | Clear the login cookie |
| `GET` | `/auth/me` | Return current user, organization and role |

No refresh, registration, invitation or password-recovery endpoints in v1.

### Queue and runs

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/work-orders?filter=all|priority|standard` | Authorized queue |
| `GET` | `/work-orders/{id}` | Work-order and selected SOP details |
| `POST` | `/work-orders/{id}/runs` | Create or return the resumable run pinned to the correct SOP version |
| `GET` | `/runs/{id}` | Authoritative run, checklist, current attempt and open issues snapshot |
| `POST` | `/runs/{id}/connection` | Authorize connection, explicitly dispatch worker and return short-lived LiveKit credentials |
| `GET` | `/runs/{id}/activity` | Paginated audit/attempt/tool/alert history |
| `GET` | `/evidence/{id}/url` | Authorized short-lived evidence URL |

Live step mutations use worker RPC so the same realtime context, tool path and domain service handles voice and accessible UI actions. The browser must not create a second divergent execution path in Next.js.

### SOPs

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/sops` | Authorized SOP/version list |
| `GET` | `/sops/{id}/versions/{version}` | Definition, source citations and validation results |
| `POST` | `/sops/imports` | Multipart source upload and bounded synchronous draft decomposition |
| `PATCH` | `/sop-versions/{id}` | Edit a draft only |
| `POST` | `/sop-versions/{id}/validate` | Return schema and business validation errors |
| `POST` | `/sop-versions/{id}/publish` | Publish an immutable version |
| `GET` | `/sop-versions/{id}/search?q=...` | Test published retrieval and citations |

If import times out, the stored original/hash allows retry without changing the source. A persisted background-job system is deliberately deferred.

### Reports, evaluation and parts

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/reports` | Authorized report list |
| `GET` | `/reports/{id}` | Full report snapshot and review history |
| `POST` | `/reports/{id}/reviews` | Supervisor/owner approve or return with note |
| `GET` | `/reports/{id}/export` | Authorized JSON export |
| `GET` | `/evaluation/summary` | Filtered organization/SOP/step/technician metrics |
| `GET` | `/parts?q=...` | Real organization parts records |

Print/PDF uses the report page’s print stylesheet rather than another rendering service.

## 5. Worker RPC from the browser

Use small versioned methods with run ID, expected run version and idempotency key where relevant.

| Method | Purpose |
| --- | --- |
| `assistant.activate` | Enter consultation and enable normal microphone/text interaction |
| `assistant.deactivate` | Return to silent mode |
| `assistant.text` | Send a text turn only while consultation is active |
| `run.get_context` | Recover the latest committed worker/server context |
| `run.retry` | Create a new visual attempt when allowed |
| `run.respond` | Submit attestation/structured choice through accessible UI |
| `run.control` | Retest, pause, resume or another enumerated legal action |
| `run.finish` | Request complete/partial close with required reason |

The worker validates every request with shared domain services. Browser-supplied expected step/attempt IDs prevent stale clicks from affecting a newer step. RPC errors return safe machine-readable codes and human-readable recovery text.

## 6. Worker-to-browser messages

Use a versioned envelope:

```json
{
  "schemaVersion": 1,
  "eventId": "01...",
  "runId": "01...",
  "type": "run.updated",
  "occurredAt": "2026-11-06T14:00:00Z",
  "payload": {}
}
```

Message types:

- `run.snapshot` — full authoritative state on join/recovery.
- `run.updated` — committed checklist/current-step/run-version change.
- `attempt.updated` — scanning, rejected, accepted or failed attempt state.
- `evidence.saved` — metadata/thumbnail reference, never a large base64 image.
- `alert.created` — visible correction linked to an eligible event.
- `agent.state` — interaction mode, activity, microphone and mute state.
- `agent.transcript` — final consultation/alert text for display.
- `ui.present` — SOP, activity, parts, evidence or report panel payload.
- `error` — safe actionable failure state.

The browser applies an event only to the matching run and current run version. If it detects a gap or stale state, it requests/fetches a fresh snapshot. Checkmarks are never client-only optimistic completions.

## 7. API error contract

Use consistent machine-readable errors:

```json
{
  "error": {
    "code": "STALE_STEP",
    "message": "The current step changed. Review the refreshed instruction and try again.",
    "requestId": "01...",
    "details": {}
  }
}
```

Required categories include unauthorized, forbidden, not found, stale run/step/attempt, duplicate request, validation failed, evidence missing, transition rejected, provider unavailable and timeout. Never expose credentials, raw provider responses or stack traces to the browser/model.

## 8. Readiness checks

Replace the prototype’s scripted success with real checks:

- Camera availability and actual track readiness.
- Microphone permission only when consultation is activated; do not request it prematurely.
- Secure-context and browser capability check.
- Published SOP version availability.
- API and LiveKit reachability.
- Recent agent/session latency if available, labeled with its measurement time.

A failed microphone check does not block silent visual execution. A failed required camera/evidence check does block visual completion.

## 9. Accessibility

- Voice-first does not mean voice-only.
- Every voice action has a keyboard-accessible equivalent in the appropriate mode.
- **Ask TARa**, mute and alert states have accessible names and state announcements.
- Use a small polite live region for step/alert updates, not an entire chat/page `aria-live` container.
- Dialogs/drawers have names, initial focus, focus trap/return and background inertness.
- Step status is conveyed by text/icon as well as color.
- Evidence images have useful criterion/step alt text and keyboard-openable details.
- Touch targets and dense mobile layouts are tested on the actual bench device.
- Provide a visible way to stop microphone consultation; no hidden always-on microphone.

## 10. PWA and reconnect behavior

Cache:

- Application shell, icons, fonts and static assets.
- Only explicitly safe/read-only resources with an intentional cache policy.

Do not cache by default:

- JWT/login responses.
- Authorized queue/run/report API responses.
- Signed evidence URLs.
- LiveKit credentials.

On reconnect:

1. Stop treating the displayed checklist as current.
2. Reauthorize and refetch the run snapshot.
3. Obtain fresh LiveKit credentials if required.
4. Rejoin in silent mode unless the user explicitly activates consultation again.
5. Drop stale pending visual frames; never upload them as fresh evidence.
6. Deduplicate any retried mutation with its idempotency key.

The PWA does not support offline AI verification or offline step completion in v1.

## 11. Prototype-to-component migration

- Port the redesigned workspace tokens, typography, panels, drawers, tool cards and report print styles before considering further redesign.
- Treat the new design’s Demo/Product layouts as two renderings of one authoritative state. Do not treat its manual state selector or Sleep/Pause presentation as a run-status control.
- If the redesign conflicts with the silent/alert/consultation, evidence or authorization contract, the functional documents win. See [10 — New design reference](10-new-design.md).
- Replace `M.SOP`, `M.TECH`, scripted intents and local session globals with typed API/realtime state.
- Keep the simulated canvas only in `prototype/`; production development fixtures use real camera frames or clearly labeled test media.
- Do not copy the old regex chain into React. Current-step actions use typed schemas, and natural-language help goes through the realtime agent in consultation mode.
