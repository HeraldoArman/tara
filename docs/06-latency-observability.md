# 06 — Latency, vision efficiency, observability and cost

## 1. Lessons applied from the previous Memora project

The previous project is useful only as a cautionary reference. Its source and debug notes describe delayed audio around synchronous video work, many tools, repeated model calls, continuous perception, memory extraction, retrieval and proactive planning.

This design avoids those mechanisms rather than copying and tuning them:

- No InsightFace, Torch, ONNX, FAISS, Neo4j or scene analyzer in the worker.
- No per-turn memory extraction, summarization or embeddings pipeline.
- No periodic planner or five-turn context refresh.
- No large dynamic tool registry or mandatory multi-tool sequences.
- No continuous video inference duplicated across two models.
- No unbounded observation queues or untracked task fanout.
- No heavyweight per-room initialization before the realtime session can start.

## 2. Why silent mode also improves latency

Silent mode is primarily a product requirement, but it removes unnecessary work:

- Normal microphone input is disabled until requested.
- No greeting or routine response generation occurs.
- Passing steps require no speech generation/audio playout.
- There are no spontaneous planner replies.
- Only alerts and consultations incur conversational response generation.

Visual checks still require bounded image assessment. Silence does not mean pretending visual inference is free.

## 3. Initial latency budgets

These are engineering targets to validate in the deployment region, not claims about current performance.

| Span | Initial target | Measurement |
| --- | ---: | --- |
| Run creation to LiveKit dispatch accepted | p95 < 1.5 s excluding client rendering | FastAPI trace |
| Dispatch to worker/session ready | p95 < 8 s | Dispatch/worker timestamps |
| End of user speech to first response audio, no tool | p95 < 3 s | LiveKit message/audio metrics |
| Internal DB read tool execution | p95 < 300 ms | Tool and repository spans |
| Internal transition commit | p95 < 500 ms | Tool/domain/database spans |
| Full-text SOP retrieval | p95 < 300 ms | SQL/retrieval span |
| External web search | 5 s timeout | HTTP/tool span |
| Visual check from fresh frame to committed verdict | p95 < 8 s | Attempt/frame/model/storage spans |
| Routine UI update after commit | p95 < 500 ms | Commit/data-channel/browser timestamps |

If the real model/network cannot meet a target, report the measured distribution and improve the largest span. Do not hide latency with fake “verified” states or unnecessary filler speech.

## 4. Worker hot-path rules

1. Create process-level database/engine and HTTP clients once, not repeatedly per tool.
2. Per room, load only the run/current-step bundle; do not preload the SOP corpus.
3. Use async SQLAlchemy/asyncpg and async HTTP calls.
4. Set deadlines on database, search, model and storage operations.
5. Keep image resize/encoding bounded; move significant CPU work off the event loop if profiling shows audio impact.
6. Do not call `gc.collect()` or reload large local models in the media loop.
7. Use one in-flight visual assessment and one in-flight transition per run.
8. Drop stale frames and superseded alerts rather than queueing them.
9. Commit required execution writes synchronously; keep optional telemetry bounded and non-blocking.
10. Close tasks, streams, sessions and clients explicitly at job shutdown.

## 5. Bounded video policy

Current LiveKit documentation says its default realtime video sampler sends one frame per second while the user speaks and one frame every three seconds otherwise. For OpenAI, each frame becomes an image message in conversation context. That default is not appropriate for an entire repair session.

Required policy:

- Camera preview can remain continuous in the browser.
- Model input defaults to no frames in silent mode except a pending visual check.
- Consultation sends a latest frame only when the question needs visual context.
- Use one fresh frame per visual attempt unless the published SOP explicitly requires a documented multi-frame check.
- Keep a latest-frame buffer, not a history queue.
- Bound JPEG dimensions/quality using LiveKit’s image utilities or an equivalent measured path.
- Cancel or discard results for stale attempts.
- Store accepted and rejected evidence objects, not every preview frame.

### Evidence correlation spike

Before full implementation, demonstrate:

1. A silent automatic check can send exactly one intended frame.
2. The frame object stored is the same frame represented in the model request.
3. A late result cannot complete a newer attempt.
4. A correct result completes silently.
5. A failed result triggers exactly one eligible alert.
6. A user-activated visual question does not start continuous silent-mode streaming.

If same-session image input cannot prove these properties, use an explicit on-demand still-image verification request. A bounded second model path for evidence is preferable to uncontrolled realtime streaming, but it must not run continuously.

## 6. Retrieval and tool latency

- Current-step instruction/rationale is loaded directly and needs no retrieval call.
- Use one indexed PostgreSQL full-text query for SOP help.
- Return at most three excerpts and associated media in the same result.
- Avoid a separate query-embedding model in v1.
- Return next-step context from mutation tools to prevent a follow-up `get_run_context` call.
- Keep `max_tool_steps=1`.
- Web search is optional, cited, bounded and available only during consultation.
- Parts lookup is an indexed database query, not an external agent workflow.

A short predetermined visual “working” state belongs in the UI. Do not generate conversational filler merely to mask ordinary database latency.

## 7. Metrics and tracing

### Run and execution metrics

- Active runs, session-ready rate and reconnect count.
- Attempt count by step/outcome/criterion.
- Visual false-accept/false-reject/unclear results from reviewed evaluation samples.
- Transition rejection, stale request and duplicate idempotency count.
- Evidence upload size/duration/failure.
- Alert created/spoken/muted/suppressed/failed count.
- Consultation activation count and duration.

### Realtime/model metrics

Use current LiveKit session usage events and per-message metrics:

- `session_usage_updated` for aggregate model usage.
- `ChatMessage.metrics` or the current equivalent for per-turn latency.
- Avoid building new code around the deprecated session-level `metrics_collected` event; plugin-specific events are a separate matter.

Record:

- Dispatch-to-ready duration.
- End-of-turn to first response/audio duration.
- Tool/model/database/storage durations.
- Input/output/audio/image token usage exposed by the provider.
- Frame count and frame age per attempt.
- Interruptions and false interruptions.
- Model/session/provider error and timeout rate.
- Event-loop lag and worker memory/CPU.

### Correlation

Use the same run/step/attempt/correlation IDs across:

- FastAPI request logs.
- Worker/session logs.
- Tool calls and model usage.
- Evidence metadata.
- Audit events and report timeline.
- Browser connection diagnostics where available.

Logs must exclude passwords, JWTs, LiveKit secrets, OpenAI keys, signed URL query strings and unnecessary sensitive transcript content.

## 8. Cost controls

Track cost per run from actual provider usage rather than guessing a flat price:

```text
Realtime audio/text/image usage
+ on-demand visual verification usage
+ configured external web-search usage
+ offline SOP decomposition usage
+ LiveKit/media/storage usage
```

Controls:

- Silent microphone default.
- No routine response generation.
- No continuous video frames.
- Full-text retrieval before embeddings.
- Compact current-step context rather than full-document prompts.
- No old-chat replay after reconnect.
- One consecutive tool step.
- Full model first for quality evaluation; benchmark the documented mini realtime variant only against the same accuracy/latency dataset before considering a switch.

Do not trade away visual false-accept performance merely to obtain a cheaper/faster model.

## 9. Degraded behavior

| Condition | Behavior |
| --- | --- |
| Database slow/down | Block mutations safely; retain visible last-known state with stale indicator |
| Search provider slow/down | Return honest unavailable result; SOP/current-step help remains available |
| OpenAI speech failure | Keep run state and display alert/instruction text; allow retry/reconnect |
| Visual assessment timeout | Mark attempt error/unclear, never pass; offer retry/escalation |
| Evidence storage slow/down | Do not commit visual pass; preserve pending/error history |
| Worker CPU/event-loop lag rises | Stop new visual work, shed stale frames and surface capacity alert |
| Browser bandwidth constrained | Reduce media quality before adding model work; preserve text/data control channel |

No failure path should simulate an agent answer or verification just to keep the demo moving.

## 10. Performance test matrix

Run the same WO-1042 script under:

- Silent correct path with no consultations.
- Repeated rejected frames and alert deduplication.
- Consultation with current-step explanation and SOP retrieval.
- Consultation with web search disabled and enabled.
- Camera denial, reconnect and stale-frame retry.
- Multiple concurrent active runs at the expected pilot load.
- Extended worker soak test to detect event-loop lag/memory growth.

Capture p50/p95/p99 and accuracy together. A low-latency result with unacceptable false accepts is not a successful optimization.
