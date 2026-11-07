# Provider evaluation protocol

Provider-free regression tests protect deterministic transitions and interaction
policy. They do not establish visual accuracy, intelligibility or realtime
latency. Use a versioned, consented and reviewed dataset before pilot release.

For every visual sample, record SOP/version/step/criterion, expected
`pass|fail|unclear`, exact image SHA-256, reviewer label and camera conditions.
Include correct work, wrong component, occlusion, blur, glare, darkness, blank and
stale frames. Record model/provider version, verdict, criterion agreement, elapsed
time, token usage and object key. Report false accepts separately from false
rejects; model confidence is not reviewer ground truth. Verify that a late result
cannot finish a newer attempt and that assessed bytes match the stored object.

For retrieval, version exact clause, paraphrase, why, parts/media, out-of-SOP,
contradictory web snippet and prompt-injection cases. Record expected citation,
retrieved chunk IDs, groundedness and retrieval/total latency. Improve lexical
chunks/synonyms before adding vector infrastructure.

For realtime, run join/pass with actual audio-output assertions, consultation
activation/deactivation and microphone-state checks, eligible alert dedup/mute,
provider failure, interruption/reconnect and concurrent-session soak. Record
p50/p95/p99 and accuracy together. Agree release thresholds with the pilot owner;
this repository does not invent a universal safety percentage.

Run the reviewed-image harness from the repository root:

```sh
uv run --project apps/server python scripts/evaluate_vision.py reviewed/manifest.json --validate-only
uv run --project apps/server python scripts/evaluate_vision.py reviewed/manifest.json --max-false-accepts 0
```

The manifest is a nonempty JSON array. Every sample supplies `image` (a bounded
JPEG path relative to the manifest), `sha256`, `reviewer`, `conditions`, the
published `step` including observable criteria, and `expected` mapping each
criterion ID to `pass`, `fail`, or `unclear`. The script refuses missing labels,
changed images and oversized fixtures. Set `OPENAI_API_KEY` and `VISION_MODEL`
through the execution environment. Results under ignored `.data/evaluations/`
include exact image hashes, model assessment IDs, criterion agreement, false
accepts, false rejects and measured latency. The default gate rejects any false
accept. Pilot thresholds and representative reviewed images must be supplied by
the procedure owner; no accuracy result is claimed without that dataset.
