# TARa

**A live-video work assistant that keeps a technician inside the SOP — and leaves an audit trail a supervisor can actually check.**

Frontend-only prototype for a short hackathon demo. One claim: the assistant is useful only if the work it guides is the approved work, and every claim on the close-out report maps to a live frame, a technician attestation, or a logged exception.

No framework, no build step, no backend, no model calls. Everything runs locally in the browser.

---

## Run it

```bash
cd codex-hackathon
python3 -m http.server 8000
```

Open **http://localhost:8000**.

Use a local server rather than `file://`: the prototype persists sessions and reports in `localStorage`, and webcam access needs a secure context (`localhost` counts).

---

## The demo (about 2 minutes, hands-free)

Scenario: **WO-1042 — Keychron K2, E key double-types**, SOP-KBD-01 v1.4, switch replacement.

The chat is buttonless on purpose: a technician at the bench cannot click a laptop while holding a keycap. The camera checks run automatically, and every branch is answered by speech. Typing + Enter still works as a fallback (and for headless tests).

1. **Queue.** Start WO-1042. Left: continuous bench video. Right: the agent, listening.
2. **Intake.** The agent checks the label frame itself. It confirms the model and serial and keeps the frame. No photo button.
3. **Inspect.** The first switch check is automatic and is **rejected** because the keycap is still fitted — the agent refuses to guess. Say **“the keycap is off”** (or “check again”); the close-up passes and the reference images load.
4. **Swap.** Say **“seated”** when the new switch sits flush. This closes as *attested*, not frame-verified. Say “it won't seat” to get the stop instruction instead.
5. **Test.** Press E five times. Say **“registers every press”** (or “double types” / “no response”). Attested.
6. **Close.** The final condition frame checks itself; say **“generate the report”**. The report shows 3 verified steps, 2 attestations, the rejected frame, the tool calls, deviations and the audit timeline.

Things to try:

- **Confusion questions.** Say **“what does a keycap look like?”**, “what is a switch?”, or **“what tool should I use to take off this keycap?”**. The agent explains the step in plain language and pulls three reference diagrams plus a how-to list. Everything is local and simulated.
- **Key failure path.** On the key test say **“double types”** or **“no response”**. The agent logs a deviation, opens an escalation, and offers a voice-only partial close; the report keeps the held step visible. Say **“re-test the key”** to reopen it.
- **Ask why.** “Why does this step matter?” returns the clause rationale. “Can I skip this?” is refused.
- **Look things up.** “Show me the SOP”, “show me the audit trail”, “show me the parts”, “search the web”. Drawers and tool cards open without touching the chat.
- **Voice replies.** On by default; say “mute” / “unmute”. The mic resumes after each spoken reply. Allow microphone access once; Chrome needs it.
- **Webcam.** Say “use the webcam” or use the small camera control on the video. Evidence frames then come from the webcam; they still stay local.
- **Sample report** in the queue footer opens a finished report without walking the flow.

---

## What is in the prototype

| Screen | File | What it does |
| --- | --- | --- |
| Work queue | `index.html` | Queue, resume strip, readiness, shift stats, recent and sample reports |
| Live session | `workspace.html` | Buttonless voice chat + continuous video, 5-step state machine, auto camera checks, tool cards, SOP and audit drawers |
| Service report | `report.html?id=…` | Step record, frame gallery, deviations, event timeline, supervisor sign-off, JSON export, print/PDF |

### Agent behaviour

- **Vision** is scripted. It returns a verdict, confidence and per-criterion checks. Step 2 rejects its first frame on purpose (`retake`) and passes the second. Evidence steps check the live frame automatically on entry.
- **Chat intents** are matched from a small scripted set. Step choices, retries, report generation and tool lookups are voice-first; freeform questions fall back to a grounded answer.
- **Tools** are simulated: web results, reference images and parts never leave the page, and the UI says so. Reference images are inline SVG diagrams; every tool call is logged in the report timeline.
- **Voice** uses the browser Web Speech API when available. Listening is always on (it pauses while the agent speaks and resumes after), replies are spoken, and “mute” / “unmute” control them. No chat buttons; the text input is the fallback.
- **Camera** is a canvas-drawn keyboard bench by default. Real webcam mode captures actual frames for evidence.
- **Persistence** is `localStorage` with an in-memory fallback. A saved active session resumes from the queue.

### What the report proves

- **Verified** = a live frame supported the step.
- **Attested** = the technician confirmed the step (e.g. a key test).
- **Exception / held** = recorded, not laundered.
- Rejected frames are retained and never counted as evidence.
- Supervisor approve/return, JSON export and print/PDF are included.

---

## File map

```
index.html                  work queue
workspace.html              live video + chat session
report.html                 audit report shell
assets/css/base.css         tokens, buttons, panels, overlays, print
assets/css/app.css          queue, camera, report layouts
assets/css/session.css      two-pane live/chat layout and message cards
assets/js/data.js           work orders, SOP-KBD-01, scripts, icons
assets/js/core.js           formatting, storage, session model, report builder, overlays
assets/js/scene.js          canvas keyboard bench and evidence frames
assets/js/live-data.js      live-session copy + simulated research results
assets/js/dashboard.js      queue, resume, sample report seeding
assets/js/session.js        chat flow, live verification, voice (always-on), tools, drawers, close-out
assets/js/report.js         report rendering, frame viewer, sign-off, export
```

---

## Constraints and honest limits

- **Simulated intelligence.** Verdicts, search results and agent replies are scripted. This demonstrates the interaction contract, not model quality.
- **Local records.** Sessions and reports live in one browser profile. No sync, multi-user review or server-side signing.
- **Demo digest.** The report hash is FNV-1a over the record — labelled as a prototype tamper-evidence cue, not cryptography.
- **One SOP in depth.** Only the keyboard switch-replacement flow is implemented. The other queue items are shown as queued work.
- **Webcam** depends on browser permission and a secure context; the simulated feed always works.
