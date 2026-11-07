# Management dashboard frontend

`/dashboard` presents the management view for understanding how often tara enters
Active, Warning, and Success during SOP execution. It follows the shared tara
design system and is a **frontend preview with sample data**. It does not read
organization telemetry or grant management permissions.

## Metric meaning

The dashboard counts **state entries**, not time spent in a state, employees,
completed workflows, or compliance verdicts. A Warning can request clearer evidence
or a corrective action; it is not automatically a confirmed violation. A Success
can represent a checkpoint; it does not imply that a whole SOP run is complete.
Active can be entered repeatedly as work resumes after guidance or verification.

The sum of Active, Warning, and Success is the displayed event total. Sleep is
outside this preview's three-series comparison. Any displayed change compares
equal consecutive periods; an increase in activity is not labeled a quality gain.
Never calculate a compliance score by treating `success / total events` as adherence.

## Data and aggregation

- `apps/web/src/components/dashboard/dashboard-data.ts` owns the presentation types
  and `dashboardDemoData`. The fixture contains deterministic daily counts for four
  sample procedures and a fifth procedure with no events to exercise the empty view.
- The sample covers **9 September–7 November 2026**, with the reporting timezone
  explicitly set to **Asia/Jakarta**. It is fixed rather than generated from the
  viewer's local clock; no live status is implied.
- `dashboard-analytics.ts` derives 7-, 14-, and 30-day inclusive date ranges, their
  immediately preceding equal periods, headline totals, daily series, SOP totals,
  and step totals. Filtering by SOP applies to every breakdown and both periods.
- Calendar arithmetic preserves date keys already bucketed in the dataset's
  timezone. It does not reassign events according to the browser's timezone.
- Daily gaps in this complete sample fixture are zero-filled. An SOP with no events
  retains its name and step metadata. Unknown SOP selections return an empty view,
  never an unfiltered organization total.
- Step aggregation includes SOP identity, so unrelated steps with matching IDs
  remain separate. The warning breakdown sorts by warning count, then event total.
- Records with unknown SOP/step identities are excluded from every breakdown rather
  than producing totals that cannot be reconciled with the visible procedures.

Use comparable count scales and a zero baseline for category bars. Daily series
show changes through time; per-SOP comparisons show where events occur. Warning
counts by step are an attention guide, not a severity or employee ranking. Provide
exact values and textual/table alternatives alongside color and chart shapes.

## Existing backend boundary

`GET /api/v1/evaluation/summary` already provides operational measures filtered by
SOP, technician, and run-created date. Those fields have different meanings:

| Existing field | Actual meaning |
| --- | --- |
| `active` | Runs whose current status is active or paused |
| `completed` | Runs whose current status is complete |
| `alerts` | Recorded agent outputs whose interaction mode is alert |
| `stepMetrics` | Attempt and result measures grouped by procedure step |

These values must not be renamed Active, Success, or Warning trigger counts.
Neither the checked-out backend nor the fetched main implementation exposes a
persisted visual-state entry series. The live execution workspace currently derives
its appearance from alerts, consultation, and run status, while the `/assistant`
preview has its own local presentation state. Preview controls are not telemetry.

Role names for the requested management experience remain a backend decision.
The existing server contract uses `technician`, `supervisor`, `sop_manager`, and
`owner`; the UI must not invent an authenticated `admin` or `head` claim. A future
live dashboard must use server-enforced organization scope and an explicit
management-read capability or confirmed role mapping. Hiding a navigation item is
not authorization. Keep the current sample route separate from that future gate.

## Proposed integration contract — not implemented

Record authoritative state transitions once, with fields equivalent to:

```ts
interface AssistantStateEntry {
  eventId: string;
  occurredAt: string; // ISO timestamp with timezone
  runId: string;
  sopId: string;
  sopVersionId: string;
  stepId: string | null;
  fromState: "sleep" | "active" | "warning" | "success";
  toState: "sleep" | "active" | "warning" | "success";
  reason: string;
}
```

The server must derive organization scope from the authenticated actor and define
which execution events cause each state entry. Deduplicate by event ID; repeated
snapshots, reconnect replay, rerenders, and animation frames must not increment
counts. Keep workflow completion and deterministic verification outcomes separate.

A proposed analytics endpoint could accept `from`, `to`, `timeZone`, `sopId`, and
`sopVersionId`, and return a generated-at timestamp, applied filters, authorized
scope, current/previous totals, daily buckets, per-SOP counts, and per-step counts.
Filter by the event's occurrence time, not the run's creation date. Define inclusive
calendar boundaries and version grouping explicitly. Include a coverage indicator;
missing or incomplete capture must remain unknown rather than be rendered as zero.

Replace the fixture at this boundary only after the backend confirms this contract.
Keep permission failures, unavailable analytics, empty filtered results, and partial
coverage distinguishable. No API, database schema, role rule, or event ingestion is
added by this frontend work.

## Interaction and export

The procedure selector and 7/14/30-day selector update the headline counts, previous
period comparison, daily trend, warning attention list, and SOP comparison together.
Selecting a procedure directly from its comparison row or attention item applies the
same filter. Sorting by warnings, activity, or name changes ordering without changing
counts. The fifth sample SOP demonstrates the zero-event view and reset action.

Charts use native SVG and HTML rather than a new chart dependency. The daily trend
offers pointer and keyboard access to exact values, with an expandable daily-count
table. Series have distinct line patterns and text labels as well as state colors.
Procedure comparisons expose named controls and exact counts. These alternatives
keep the information usable without relying on color or pointer-only tooltips.

**Export summary** downloads the currently filtered and sorted SOP totals as CSV.
Every row includes **Demo data**, the selected period boundaries, **Asia/Jakarta**,
SOP identity/version, each state count, and the reconciled total. CSV text cells are
quoted, embedded quotation marks are escaped, and formula-like labels are prefixed
to remain text in spreadsheet applications. The download includes a UTF-8 byte-order
mark and releases its temporary object URL. Export does not request or persist
organization data.

## Checks

`tests/unit/dashboard-analytics.test.ts` covers inclusive/current/previous boundaries,
exact reconciliation between breakdowns and totals, SOP isolation, shared step IDs,
zero-event views, missing daily records, empty datasets, and calendar boundaries.
`tests/unit/dashboard-format.test.ts` checks filtered CSV content and escaping, plus
previous-period comparisons when the earlier count is zero or unchanged.
Browser checks should confirm that SOP and period filters update every visualization,
the zero-event procedure has a useful empty state, and chart details are available
without relying on color or a pointer.
