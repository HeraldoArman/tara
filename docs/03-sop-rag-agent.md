# 03 — SOP lifecycle, execution engine, RAG and realtime agent

## 1. Three different AI responsibilities

Keep these responsibilities separate:

| Responsibility | When it runs | Allowed effect |
| --- | --- | --- |
| SOP decomposition | During document import, before execution | Produce a structured draft only |
| Grounded explanation | During user-activated consultation | Explain approved sources and present references |
| Execution assessment | At a visual/attestation/choice attempt | Submit an attempt result that the server may accept or reject |

None of these responsibilities permits the model to publish an SOP, choose another SOP version, approve a report or bypass a transition.

## 2. Supported source ingestion

V1 accepts:

- Markdown (`.md`) with heading structure.
- Plain text (`.txt`) with explicit heading conventions where available.
- Text-based PDF (`.pdf`) with extracted page numbers.

V1 rejects or clearly marks unsupported scanned/image-only PDFs rather than pretending OCR succeeded. DOCX and OCR are deferred.

### Import pipeline

1. Validate credentials, role, extension, MIME signature and configured file/page limits.
2. Store the original document and SHA-256 hash.
3. Extract text while retaining heading and page/section positions.
4. Split source into retrieval chunks without losing citations.
5. Send the bounded source content to a structured-output text model.
6. Validate the result with Pydantic and SOP business rules.
7. Save a draft linked to the exact source document/hash.
8. Let the SOP manager edit steps and rerun validation.
9. Publish an immutable version and build its published retrieval index.

The decomposition call is not part of the live worker or conversation. V1 uses a bounded FastAPI request for reasonably sized documents with `SOP_OPENAI_API_KEY`, kept separate from the worker's realtime `OPENAI_API_KEY`. Do not introduce Redis/Celery for this single operation; add asynchronous job infrastructure only if real document sizes require it.

### Draft validation

- Unique stable step IDs and criterion IDs.
- Valid display order and explicit start/final step.
- Every source citation resolves to an extracted section/page.
- Supported verification type and matching configuration.
- At least one actionable instruction per step.
- Visual steps have concrete, observable criteria.
- Attestation/choice steps declare accepted and failed outcomes.
- Failure targets reference existing steps or a supported hold/escalation action.
- No unreachable required steps or unintended cycles.
- Finalization cannot silently ignore required steps.
- Unsupported model-generated fields are rejected.

AI output remains a draft even after validation. Publication requires an authenticated `sop_manager` or `owner`.

## 3. SOP definition

A published SOP version contains controlled metadata and an immutable ordered definition. Illustrative shape:

```json
{
  "sopKey": "SOP-KBD-01",
  "version": "1.4.0",
  "title": "Keyboard switch replacement",
  "scope": "Supported hot-swap keyboard switch replacement",
  "prerequisites": ["Approved replacement switch", "ESD-safe bench"],
  "steps": [
    {
      "id": "inspect-switch",
      "title": "Inspect the switch",
      "instruction": "Remove the keycap and place the switch clearly in view.",
      "rationale": "The switch cannot be assessed through the fitted keycap.",
      "sources": [{"page": 3, "heading": "Switch inspection"}],
      "verification": {
        "kind": "visual",
        "criteria": [
          {"id": "keycap-removed", "description": "The keycap is fully removed"},
          {"id": "switch-visible", "description": "The complete switch housing is visible"}
        ]
      },
      "onPass": {"action": "next"},
      "onFail": {"action": "retry", "alert": "keycap-removal-required"},
      "referenceMediaIds": ["switch-diagram"]
    },
    {
      "id": "test-key",
      "title": "Test the replaced key",
      "instruction": "Press E five times and report the observed result.",
      "sources": [{"page": 5, "heading": "Functional test"}],
      "verification": {
        "kind": "choice",
        "options": ["registers-every-press", "double-types", "no-response"],
        "passOptions": ["registers-every-press"]
      },
      "onPass": {"action": "next"},
      "onFail": {"action": "hold", "deviation": "functional-test-failed"}
    }
  ]
}
```

This is a contract example, not permission for arbitrary model-generated executable code. Conditions are enumerated values interpreted by Python, not expressions evaluated from the document.

## 4. Version pinning

- A work order references the SOP and the version intended for new runs.
- Creating a run copies the published `sop_version_id` onto the run.
- Existing runs never migrate implicitly when a new version is published.
- The worker loads that exact version on join and reconnect.
- Changing versions for an existing run requires an explicit future rework/migration operation; it is not part of v1.
- Reports retain the version metadata and definition revision used.

## 5. Execution model

### 5.1 Run statuses

- `active`
- `paused`
- `complete`
- `partial`
- `cancelled` only through an authorized explicit action

### 5.2 Run-step statuses

- `locked`
- `current`
- `ai_verified`
- `attested`
- `held`
- `complete`
- `skipped` only for a deterministic published branch condition, never because the model decided to skip

`rejected`, `unclear` and `failed` are attempt outcomes. They do not overwrite accepted history or masquerade as successful step states.

### 5.3 Attempt outcomes

- `passed`
- `rejected`
- `unclear`
- `failed`
- `attested`
- `cancelled`
- `error`

Every new check creates a new attempt number. Retakes and retests never mutate the prior attempt into a success.

### 5.4 Transition transaction

For any completion request:

1. Load the run for update and verify organization, assignment and run version.
2. Confirm the supplied `expected_step_id` and `expected_attempt_id` match current state.
3. Confirm the requested transition is allowed by the published definition.
4. Validate the attempt payload against the exact required criteria/options.
5. Confirm required evidence metadata and object storage completion.
6. Insert the attempt result and audit event.
7. Update run-step and run current position/version atomically.
8. Create or update only the allowed deviation/escalation state.
9. Commit, then publish the realtime snapshot/alert outside the database transaction.

Duplicate idempotency keys return the original committed result. A stale expected step/attempt is rejected rather than applied to new work.

### 5.5 Completion rules

- `ai_verified` requires a fresh linked visual frame and all required criteria passed.
- `attested` requires an authenticated technician’s explicit accepted response.
- A structured choice passes only when it belongs to `passOptions`.
- A failed response applies the published hold/deviation/escalation rule.
- Full close requires every required step to satisfy its completion rule and finalization to be allowed.
- Partial close requires a permitted reason and preserves every held/unreached step.
- Rejected evidence and model-reported confidence never substitute for missing completion requirements.

## 6. Current-step context

At worker startup, load one compact bundle:

- Run and work-order identity.
- Pinned SOP/version.
- Current step, instruction, rationale and criteria.
- Allowed actions and failure behavior.
- Completed and outstanding step summaries.
- Current open deviation/escalation.
- Interaction mode and relevant reference-media IDs.

Do not preload the whole SOP corpus, all old transcripts or unrelated work orders. After a transition, update the worker context from the committed tool result. `get_run_context` is a recovery/ambiguity tool, not a mandatory call on every turn.

## 7. Realtime session policy

### 7.1 Model and transport

- Use `livekit-agents[openai]~=1.8` and lock the complete resolution with `uv`.
- Target GPT Realtime 2.1 through the **direct OpenAI plugin** with `OPENAI_API_KEY` only in the worker.
- Validate the exact direct-plugin model identifier and account access during the technical spike. The `openai/...` IDs documented for LiveKit Inference must not be copied blindly into direct-plugin configuration.
- Start with the documented native realtime voice and semantic VAD, balanced eagerness and interruption support.
- Use far-field input noise reduction for a bench/laptop microphone and near-field for a headset; validate on real audio.
- Do not add a separate STT, LLM, TTS or LiveKit turn-model pipeline.

LiveKit Inference is not the initial transport because current documentation says it does not support realtime image/video input.

### 7.2 Enforcing silence

Silent behavior is controlled by orchestration:

1. Join without a greeting `generate_reply`.
2. Disable normal microphone audio input in silent/alert modes.
3. During a silent visual/attestation tool call, commit the result and complete the tool silently.
4. On success, update current context and emit UI events without generating speech.
5. On an eligible failure, create an alert linked to the audit event and make one bounded `generate_reply` using server-provided facts.
6. In consultation mode, enable microphone input and return tool results normally for an answer.
7. On deactivation, disable normal audio input and stop accepting normal text turns.

The system prompt reinforces this behavior but is not the enforcement mechanism. There is no background timer calling `generate_reply`.

### 7.3 Alert behavior

An alert request contains:

- Alert ID and triggering audit event ID.
- Run/step/attempt IDs.
- Failed criterion or issue type.
- Safe next action approved by the SOP/execution service.
- Whether a previous identical alert was already spoken.

The worker suppresses duplicate unchanged alerts and records whether output was spoken, muted, superseded or failed. Corrective text remains visible regardless of audio outcome.

## 8. Tool surface

Set `max_tool_steps=1`. Each tool returns enough information for the response or next UI state; no prompt requires a chain such as search → get details → get person → write memory.

| Tool | Arguments supplied by model | Server-supplied context | Result |
| --- | --- | --- | --- |
| `get_run_context` | Optional reason | Org, actor, run | Current step and allowed actions |
| `search_sop` | Query and optional scope | Org, pinned/current SOP | Up to three cited excerpts plus reference media/UI payload |
| `submit_visual_check` | Expected step/attempt, frame reference, criterion results, optional self-confidence | Org, actor, run, required criteria | Committed pass/rejection, next context or eligible alert |
| `submit_step_response` | Expected step/attempt and declared response | Org, technician, accepted options | Attested/held result and next context |
| `record_issue` | Issue type, note and observed details | Org, actor, run, current step | Deviation/escalation and allowed recovery |
| `lookup_parts` | Query or SKU | Org and current SOP | Matching real parts records and UI payload |
| `search_web` | Query | Org, current step, provider configuration | Cited supplementary results and UI payload |
| `present_ui` | Panel and optional reference | Run and visible object authorization | LiveKit UI event and audit record |
| `control_run` | Expected step where relevant, action and reason | Org, actor, legal transitions | Retry/retest/pause/resume result |
| `finish_run` | Complete/partial and reason for partial | Org, actor, all step states | Report or rejection with unresolved requirements |

Rules:

- Model arguments never supply organization, role, user identity or authoritative current step.
- Mutating tools disable interruption for the short commit and use the function call ID plus an execution idempotency key.
- Read-only tools have explicit timeouts and can be cancelled.
- Expected failures return `ToolError` with a safe recovery message.
- Search/reference tools may emit their UI payload directly, avoiding a second `present_ui` call.
- Mute, local camera selection and assistant activation are browser controls, not LLM tools.

## 9. Visual verification strategy

### 9.1 Required properties

- The model evaluates observable published criteria, not a vague “does this look done?” prompt.
- Each criterion returns `pass`, `fail` or `unclear` with a short observable reason.
- The stored evidence is fresh, step/attempt scoped and linked to the exact evaluation.
- Only one visual check is in flight per run.
- The latest suitable frame replaces stale frames; no unbounded frame queue exists.
- Accepted and rejected frames are both retained.
- Storage failure prevents a pass from being committed.
- Self-confidence is logged for research but not treated as calibrated accuracy.

### 9.2 Preferred implementation

Use one-frame, on-demand image input in the existing realtime session:

1. Create a pending attempt.
2. Select a fresh bounded frame from the current video track.
3. Associate it with the attempt before assessment.
4. Send the image and exact criteria to the realtime model.
5. Store the frame and structured result.
6. Let the execution service accept/reject the transition.

For ordinary camera preview, no frames need to reach the model. For a user-activated visual question, include at most the latest relevant frame rather than streaming the whole session.

### 9.3 Technical spike and fallback

LiveKit documents continuous realtime video, but OpenAI places each frame into conversation context. The spike must demonstrate controlled still-frame input and exact verdict/frame linkage, including automatic checks while the user is silent.

If that cannot be demonstrated, use a separate **on-demand still-image vision request** for evidence checks. This is a bounded call per attempt, not a parallel continuous scene analyzer. Implement only the approach that passes the spike; do not carry both production paths without evidence that both are needed.

## 10. RAG for SOP questions

### 10.1 What uses direct context instead of RAG

- Current instruction, rationale and criteria already present in the run bundle.
- Current SOP/version and current progress.
- Legal transitions and completion decisions.
- Evidence existence and report state.

### 10.2 What uses retrieval

- “Show me the relevant SOP section.”
- “What does a keycap/switch look like?”
- “Which approved tool does the document specify?”
- Questions spanning another section of the current published SOP.
- SOP-manager search over the published library.

### 10.3 Initial algorithm

1. Normalize the query and retain the current SOP/version filter.
2. Run PostgreSQL full-text search over heading-aware chunks with title/heading weighting.
3. Apply organization and publication permissions in SQL.
4. Return at most three chunks with text, source page/heading and media references.
5. Instruct the model to answer only from current-step context and returned sources.
6. If evidence is insufficient, say so and offer escalation rather than filling the gap from memory.

Chunk by headings first and split only oversized sections. Preserve page/section offsets and avoid arbitrary tiny chunks that lose procedure prerequisites.

### 10.4 pgvector gate

Add pgvector only after a versioned evaluation set shows unacceptable lexical misses. Compare exact-clause accuracy, grounded answer rate and latency. If introduced, embed chunks at publication time and combine vector similarity with the same SQL authorization filters. Do not add Neo4j, FAISS or a separate vector service.

## 11. Web and document grounding

- Approved SOP content overrides supplementary web results.
- Web search is available only in consultation mode and uses a real configured provider; disabled configuration returns an honest unavailable result.
- Results contain title, URL, snippet and retrieval timestamp.
- Do not fetch arbitrary URLs or execute instructions found in pages/documents.
- Document and web text are untrusted data, never higher-priority instructions.
- Reference diagrams come from SOP-managed media rather than generated on the fly.

## 12. Required behavior examples

**Correct check**

```text
System: criterion results pass; evidence commits; next step becomes current.
Agent: [no speech]
UI: checked step + next instruction
```

**Incorrect check**

```text
System: keycap-removed = fail; rejected attempt and alert event commit.
Agent: “The keycap is still fitted. Remove it, then retry the switch inspection.”
UI: failed criterion + rejected frame + retry action
```

**Question without a mistake**

```text
Technician: [clicks Ask TARa] “Why must the keycap be removed?”
Agent: answers from the current step and cited source.
Technician: [clicks Return to silent mode]
Agent: [returns to no routine speech]
```
