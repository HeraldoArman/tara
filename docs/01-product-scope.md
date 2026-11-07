# 01 — Product scope and interaction contract

## 1. Product promise

TARa keeps a technician inside an approved SOP and leaves a supervisor with a truthful record of execution. Its assistant is intentionally restrained: correct work should feel quiet and efficient, while mistakes and explicit requests for help receive immediate attention.

## 2. Existing prototype inventory

The implementation must preserve the behavior represented by these files, not their simulated internals.

### New visual design

The redesigned live workspace is extracted at [`new-design/`](../new-design/) from `new-design.zip`. It is **design-only**:

- It changes the live workspace layout, visual hierarchy, typography, colors, glass treatment, responsive composition and copy.
- Its Demo/Product layouts, manual state selector and Sleep/Pause presentation are prototype affordances, not new SOP or agent behavior.
- Queue, report, data, evidence, audit and execution logic are unchanged.
- The functional requirements in this document and [03](03-sop-rag-agent.md) take precedence whenever the design implies otherwise.
- See [10 — New design reference](10-new-design.md) for the exact file differences and implementation rules.

| Area | Existing behavior to carry forward | Prototype source |
| --- | --- | --- |
| Work queue | Assigned jobs, priority filters, start/resume, current-step resume strip, readiness, shift metrics and recent reports | `index.html`, `assets/js/dashboard.js`, `assets/js/data.js` |
| Live workspace | WO/SOP header, continuous bench preview, webcam control, elapsed time, current clause, visual scanning state, evidence thumbnail, progress and conversation | `workspace.html`, `assets/js/session.js`, `assets/js/scene.js` |
| SOP grounding | Current clause, instruction, rationale, prerequisites, controlled version metadata and refusal to skip required work | `assets/js/data.js`, `session.js` |
| Visual verification | Automatic checks on evidence-step entry, per-criterion verdicts, accepted/rejected frames and retakes | `session.js`, `scene.js` |
| Attestation and choices | Technician confirmation, pass/fail test choices, coaching and held states | `session.js` |
| Reference help | Diagrams, how-to lists, explanations and tool guidance | `assets/js/live-data.js`, `session.js` |
| Parts and search | SKU, stock/location, price and supplementary web results | `live-data.js`, `session.js` |
| Mistakes and escalation | Rejected evidence, failed tests, deviations, second opinions, retest and partial close | `session.js` |
| Audit drawer | Chronological gates, attestations, tools, deviations and escalations | `session.js` |
| Report | Complete/partial outcome, step record, accepted/rejected evidence, timeline, supervisor review, JSON export and print/PDF | `report.html`, `assets/js/report.js` |
| Persistence | Resume and durable reports replace browser-local storage | `assets/js/core.js` |

Prototype-only behavior to remove:

- Scripted visual verdicts, including attaching a real webcam image to a simulated verdict.
- Hardcoded WO-1042 routing and one global SOP object.
- Hardcoded user/supervisor identities.
- `localStorage` as the system of record.
- Mutable sign-off, non-cryptographic digest claims and reports that overwrite repeated runs.
- Always-on browser speech recognition and unsolicited conversational replies.
- Fake readiness checks, search results and online/agent indicators.

A sample WO-1042 report may remain as a clearly labeled development/demo fixture, never as fabricated production data.

## 3. Personas and primary jobs

### Technician

- See assigned work and resume an interrupted run.
- Follow a visible checked/current/locked/held checklist.
- Complete visual, attestation and structured-choice steps.
- Receive proactive correction after a detected problem.
- Ask for SOP, visual, parts or supplementary web help only when desired.
- Retry, retest, report a problem and request escalation.
- Finish completely or partially without hiding unresolved work.

### Supervisor

- Review accepted and rejected evidence, mistakes and timing.
- Resolve escalations.
- Approve a report or return it for actual rework.
- Compare step outcomes and first-pass rates within the organization.

### SOP manager

- Upload a supported source document.
- Generate and edit a structured breakdown.
- Confirm source citations, criteria and failure behavior.
- Publish immutable versions and inspect retrieval quality.

### Owner

- Evaluate technician/SOP/step performance and operational quality.
- Access organization-wide runs and reports.
- Use the same seeded role model without requiring a separate admin product in v1.

## 4. Agent interaction contract

### 4.1 Modes

The worker and browser share an explicit interaction mode. This is application state and output policy, not merely wording in the system prompt.

| Mode | Entry | Microphone conversation | Agent speech | Exit |
| --- | --- | --- | --- | --- |
| **Silent execution** | Default on join and after every consultation/alert | Disabled | None for routine events or correct work | Eligible alert or **Ask TARa** activation |
| **Proactive alert** | Server records an eligible mistake/exception event | Disabled unless the user separately activates consultation | One short corrective response about that event | Alert playout completes, is interrupted by activation, or is superseded |
| **Consultation** | Technician clicks **Ask TARa** | Enabled | Normal answers to user questions | Technician clicks **Return to silent mode**, or a defined inactivity timeout returns to silent |

The initial agent join must not produce a greeting. A correct step must not produce “great,” “well done,” a repeated instruction or a spoken next-step announcement.

### 4.2 Events eligible for proactive speech

- A required visual criterion fails.
- A visual check is unclear and requires technician action after capture/retake guidance is needed.
- A submitted structured response indicates a failed test or incorrect result.
- A technician attempts to skip required work or requests an unsafe/out-of-SOP action.
- A deviation is created or a step is held.
- An escalation is opened or requires technician action.
- Repeated invalid tool arguments or a failed mutation block progress.
- Camera, evidence, network or model failure prevents a required check.

Not every technical event deserves speech. Routine reconnect success, accepted evidence, ordinary tool results while silent, token usage and internal retries remain visual/logged only.

### 4.3 Alert rules

1. An alert references a specific run, step, attempt and audit event.
2. It states the problem and the next safe action in one to three short sentences.
3. It does not announce a broad diagnosis unsupported by the evidence.
4. An unchanged failure does not trigger repeated speech on every frame or event.
5. A new attempt or changed failed criterion may trigger a new alert.
6. A newer safety-relevant alert supersedes a stale queued alert; alerts are not accumulated in an unbounded queue.
7. Manual mute suppresses audio but never hides the visual alert or audit event.
8. If speech generation fails, the visible correction remains available.

### 4.4 Consultation rules

- **Ask TARa** is a visible button with a clear active/inactive state.
- Clicking it is the explicit consent/action that enables normal microphone conversation.
- The text composer is available in consultation mode as an equivalent input method.
- The user can ask about correct work, rationale, reference images, parts, web results, reports and activity without first making a mistake.
- Closing consultation disables normal microphone input and returns to silent execution.
- An alert may still speak while consultation is active if a new eligible execution event occurs; it must not hijack the conversation with stale information.

### 4.5 Detection boundary

Automatic visual checks occur on evidence-step entry and on explicit retry. Attestations and structured choices produce events when submitted. Consequently:

- The agent can proactively correct mistakes exposed by those checks/events.
- It may not notice a physical mistake between checks.
- It does not continuously classify every hand movement or narrate activity.
- Any future continuous mistake detector requires a separate measured product decision, not an extra hidden loop in the worker.

## 5. Core user journeys

### 5.1 Publish an SOP

1. SOP manager uploads Markdown, TXT or text-based PDF.
2. The system extracts source sections and generates a draft breakdown.
3. The manager reviews each step, citation, visual criterion and failure branch.
4. Validation rejects missing references, duplicate IDs, impossible transitions or unsupported verification configuration.
5. The manager publishes an immutable version.
6. Only that published version becomes available to new work-order runs.

### 5.2 Correct execution stays quiet

1. Technician starts an assigned work order and joins silent mode.
2. The current instruction and criteria are visible.
3. An automatic visual check passes and stores its frame.
4. The checklist advances without speech.
5. An attestation is submitted and accepted without speech.
6. The run closes only when every required completion rule is satisfied.

### 5.3 Mistake triggers correction

1. A visual check finds that the keycap is still fitted.
2. The server records a rejected attempt and its failed criterion.
3. The UI keeps the step active and displays the problem.
4. The agent gives one short corrective spoken alert.
5. The technician corrects the work and requests/retries the check.
6. A later passing attempt advances quietly; the rejected attempt remains in history.

### 5.4 User requests help without a mistake

1. Technician clicks **Ask TARa**.
2. The agent answers “what tool should I use?” using the current step and approved SOP references.
3. Reference images open without requiring a second agent/tool chain.
4. Technician clicks **Return to silent mode**.
5. Execution continues without routine commentary.

### 5.5 Failure, escalation and partial close

1. A key test returns “double types.”
2. The step becomes held, and a deviation/escalation is recorded.
3. The agent proactively explains the allowed recovery.
4. Retest creates a new attempt; old failures are not resolved prematurely.
5. The technician can complete a partial close only through an allowed transition.
6. The report keeps the held/unreached steps and exception visible.

## 6. V1 scope boundaries

Included:

- One organization, four roles and assigned work orders.
- One live run per work order with resume support.
- Ordered SOP steps with explicit failure branches.
- AI visual completion, attestations, structured choices and finalization.
- Full step/attempt/evidence/audit history.
- Real parts records and a real cited web-search provider when configured.
- Owner/supervisor operational evaluation from relational queries.

Deferred:

- Arbitrary branching workflow designer.
- Continuous activity recognition.
- Offline AI verification or offline step completion.
- Multiple simultaneous technicians editing one run.
- Native mobile applications.
- DOCX, scanned PDFs and OCR.
- External ERP/EAM/inventory synchronization.
- General-purpose long-term agent memory.

## 7. Product acceptance requirements

- **INT-01:** Joining a run produces no greeting or unsolicited speech.
- **INT-02:** Passing checks and routine transitions produce no speech.
- **INT-03:** Every proactive utterance has an eligible audit event and alert ID.
- **INT-04:** Normal voice/text consultation starts only from explicit activation.
- **INT-05:** Returning to silent mode disables normal microphone conversation.
- **INT-06:** Mute never removes visible corrections or audit records.
- **INT-07:** Repeated identical failures do not create an audio nag loop.
- **EXEC-01:** The live checklist always agrees with the server snapshot.
- **EXEC-02:** A rejected attempt never advances or counts as accepted evidence.
- **EXEC-03:** Retest never erases the failed attempt.
- **HELP-01:** Rationale, SOP, reference, parts, activity and web-help intents remain available in consultation mode.
- **RPT-01:** Complete and partial reports preserve all unresolved work and exceptions.
