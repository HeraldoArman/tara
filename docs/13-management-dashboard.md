# Owner operations dashboard

`/dashboard` is the authenticated owner overview. The public `/` entry sends an
owner here after login. Technicians retain the work queue, supervisors retain the
existing operational flow, and SOP managers retain the SOP library. Direct access
to `/dashboard` checks the authenticated role on the server before reading any
management data.

The page reuses the original tara dashboard shell, typography, cards, color tokens,
and responsive layout. It combines the analytics overview with the existing work
queue, recent reports, SOP library access, and Create job action. Procedure review
starts in the SOP library, which links a specific version into SOP Intelligence.

## Live data and scope

The server loads these existing, organization-authorized endpoints concurrently:

- `/evaluation/summary`: execution and verification measures.
- `/work-orders`: the organization's job queue.
- `/reports`: recorded execution reports.
- `/sops`: available procedures and published-version availability.

A failure in one source leaves the other available sections usable. Unavailable
sections display errors, rather than claiming that no work exists. The dashboard
does not request camera or microphone permission. Existing session actions in the
queue retain their original authorization checks.

Analytics can be filtered by SOP and run-created UTC dates. The end date is
inclusive, matching the backend contract. An empty date range means all recorded
history. Applying filters refreshes the analytics; this is a snapshot, not a live
subscription. A failed refresh retains the previous results and their applied
scope. Queue and recent reports are explicitly independent of analytics filters.

## Metric meanings

| Label | Source | Meaning |
| --- | --- | --- |
| Recorded runs | `runs` | Execution sessions matching the filters |
| In progress | `active` | Runs currently active or paused |
| Assistant alerts | `alerts` | Recorded agent outputs in alert mode, including muted/suppressed speech |
| First-pass success | `firstPassRate` | Initial attempts that passed or were human-attested, including unfinished runs |
| Complete / Partial | `completed` / `partial` | Current run outcomes |
| Other statuses | Remaining recorded runs | Preserves statuses outside the three named outcomes |
| AI-verified steps | `aiVerified` | Checkpoints currently marked AI-verified |
| Human-attested steps | `attested` | Checkpoints attested by a human; distinct from AI verification |
| Held steps | `held` | Checkpoints currently held for follow-up |
| Open escalations | `openEscalations` | Recorded escalations still open |
| Returned reports | `returned` | Reports returned for review |

An em dash means an optional metric is unavailable. Known zero remains zero.
A complete run or a held step is not itself a compliance judgment. Missing visual
evidence does not automatically establish a violation.

## Charts

- Run composition is a stacked count bar with exact, labeled values.
- Technician activity uses the same count scale for every technician, with a
  complete data table. Volume is not labeled as a performance ranking.
- Procedure detail is shown after selecting an SOP. The backend groups steps by
  SOP version and step ID. Each row preserves its unique metric ID and displays
  the saved step title, ID, and version, so matching step IDs from different
  versions stay separate. Rows show held counts, attempts, initial passes, and
  runs with the step. Held bars use a shared zero baseline. Human attestation
  remains part of the initial-pass measure.

## Visual-state telemetry boundary

The backend does **not** currently expose counts of transitions into visual Active,
Warning, and Success states. `active`, `completed`, and `alerts` must not be relabeled
as those transition counts. The earlier deterministic sample series and aggregation
helpers remain isolated development fixtures; the production dashboard no longer
imports them or displays sample operational activity.

If state-entry telemetry is added later, record distinct event IDs, organization,
run, SOP/version, step, state, occurrence time, and session identity. Deduplicate
retries, use a declared reporting timezone, and keep state entries separate from
run completion, verification, and compliance verdicts.

## Verification

`tests/web/owner-dashboard.test.ts` verifies count semantics, unavailable metrics,
filter encoding, step-record parsing, and an isolated server-render check of the
actual dashboard route. The route checks cover guest/role redirects before data
access, real API values in the rendered page, key owner actions, and partial API
failure without losing available analytics. Deterministic test-only data lives in
`tests/fixtures/owner-dashboard-data.ts`.
