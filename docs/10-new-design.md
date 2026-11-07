# 10 — New design reference

## 1. Purpose of this document

[`new-design/`](../new-design/) is the extracted **new visual design of the live workspace**, sourced from [`new-design.zip`](../new-design.zip). It is a design change to the existing prototype, not a product or functional redesign.

The archive is useful for:

- layout and responsive composition;
- visual language, typography, color and glass treatment;
- hierarchy between live video, assistant state and current guidance;
- presentation of warnings, success and inactive states;
- control placement and overall workspace polish.

It does **not** add, remove or redefine:

- SOP behavior or steps;
- execution state or legal transitions;
- agent tools, model calls or conversation policy;
- evidence, audit, reporting or review semantics;
- roles or authorization;
- API, database or infrastructure requirements.

## 2. Archive provenance

| Property | Value |
| --- | --- |
| Archive | `new-design.zip` |
| Extracted reference | `new-design/` |
| Size | Approximately 274 KB |
| SHA-256 | `621b1f3c7d2229c9e5574aa701754832de517d40d9fbf2eaf658066172a74bfb` |
| Original root folder | `codex-hackathon/` |
| Content | Redesigned prototype plus repository metadata |

The archive has been extracted into `new-design/` with the original `codex-hackathon/` wrapper removed. Its nested `.git` directory was intentionally excluded because it is repository metadata, not design content. The extracted branding was then renamed from Memora to TARa; the source ZIP remains the historical pre-rename archive. Do not extract it wholesale over the working root or merge its old project copy/unrelated files.

### What actually differs

Verified by comparing file hashes/contents:

| File | Difference |
| --- | --- |
| `workspace.html` | Rewritten live-workspace layout and markup |
| `assets/css/session.css` | Replaced with the new white/glass state-driven visual system |
| `assets/js/session.js` | Updated to render the focused workspace and prototype presentation states |
| `README.md` | Added design notes and updated prototype descriptions |
| `index.html` | Unchanged |
| `report.html` | Unchanged |
| `assets/css/base.css` | Unchanged |
| `assets/css/app.css` | Unchanged |
| `assets/js/data.js` | Unchanged |
| `assets/js/core.js` | Unchanged |
| `assets/js/dashboard.js` | Unchanged |
| `assets/js/report.js` | Unchanged |
| `assets/js/scene.js` | Unchanged |
| `assets/js/live-data.js` | Unchanged |

The queue, report, data model, scene, and core behavior were not redesigned. The SOP scenario and underlying prototype logic remain the earlier simulation.

## 3. Design direction to carry forward

### Workspace hierarchy

- Reworked `TARa.` wordmark and field-assistant header treatment.
- Clear session heading with work-order/device context.
- Camera as the dominant work surface.
- Assistant state visually separated from current guidance.
- Current instruction, source/cue and progress visible without competing with the video.
- Session record/audit access remains available from the footer.

### Two responsive compositions

- **Demo mode:** large video plus a conventional side-by-side instruction/assistant column; suitable for presenting the product.
- **Product mode:** video fills the viewport with translucent guidance floating over it; intended to keep the physical work area dominant.

These are two presentations of the same product state. Switching layouts must not create different workflow behavior.

### Visual state treatment

The design defines:

- Active: blue accent;
- Sleep/inactive: dark blue;
- Warning: red accent;
- Success: green accent.

Use these as reusable visual tokens for available/alert/completed/inactive states. They are not new SOP statuses, and warning/success appearance must never change execution state by itself.

### Focused guidance

The redesigned workspace shows the current step or latest answer instead of rendering the entire conversation history in the primary pane. This is a useful hierarchy: current action first, complete session record available separately.

Production may retain concise consultation turns where needed, but the complete audit/report history remains server-side and inspectable.

### Controls and polish

- Video-first layout with controls integrated over/below the feed.
- Camera, pause, sound and help controls.
- Send button for typed fallback.
- Progress track, View SOP and session-record links.
- Accessible focus styling and reduced-motion handling in the new stylesheet.

## 4. Presentation versus product behavior

The prototype includes visual controls that simulate states or suspend prototype activity. They are **design exploration, not functional scope changes**.

| Prototype presentation | Production interpretation |
| --- | --- |
| Demo/Product layout switch | Visual layout choice with identical execution state and permission rules |
| Manual Auto/Sleep/Active/Warning/Success selector | Styling/demo control only; never manually set a run’s verified, held, warning or success state |
| Sleep/Pause behavior in prototype | Design reference for an inactive/resting appearance; production connectivity, microphone, pause/resume and checks follow the approved functional contract |
| Focused current guidance | Preferred visual hierarchy; audit history remains complete server-side |
| New warning/success colors | Presentation states derived from authoritative server state |
| Header state switch persisting across refresh | Prototype-only presentation persistence; production derives assistant/run state from server and realtime session |

The manual state picker must not become an operator override for SOP status. A technician cannot make a step successful by selecting green, and an owner evaluation must not treat a visual state selection as evidence.

## 5. Authority order

When sources differ:

1. **`docs/03-sop-rag-agent.md` and `docs/04-data-audit-rbac.md`** define execution, evidence, audit and authorization.
2. **`docs/01-product-scope.md`** defines user journeys and silent/alert/consultation behavior.
3. **`new-design/`** defines visual/layout direction for the live workspace.
4. **Existing prototype files** define remaining visual/interaction references where not superseded by the new design or functional docs.

If a design affordance implies a new functional capability, it requires a separate accepted requirement. It is not approved merely because the redesigned prototype demonstrates it.

The extracted design can be viewed from the repository root with:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/new-design/workspace.html`.

## 6. Implementation guidance

- Port the new workspace layout and tokens into the production Next.js components.
- Implement one underlying realtime state model and render both layout presentations from it.
- Map server-authoritative `silent`, `alert` and `consultation` modes to clear visual states; do not use the prototype’s manual picker as the source of truth.
- Keep the **Ask TARa** explicit-activation requirement from this plan. A visually polished always-listening prototype is still not the approved functional interaction.
- Preserve visible correction alerts even when the design emphasizes a focused single instruction.
- Do not copy prototype `localStorage`, scripted state persistence or manual demonstration controls into production.
- Retain accessibility: semantic buttons, visible focus, reduced motion, text labels in addition to color and usable touch targets.
- Validate both layouts on the actual bench device; the floating product layout must not cover required evidence or controls.

## 7. Design acceptance criteria

- **DESIGN-01:** Both layouts render the same authoritative run/step/attempt state.
- **DESIGN-02:** No visual control can directly mark a step verified, passed, held or complete.
- **DESIGN-03:** Warning/success treatment is supplementary to text/icon state, not the sole indicator.
- **DESIGN-04:** Silent, alert and consultation modes remain distinguishable under the new visual language.
- **DESIGN-05:** Current guidance is prominent while full audit history remains accessible.
- **DESIGN-06:** Demo and Product layouts preserve camera/evidence usability and accessible controls.
- **DESIGN-07:** The redesign does not alter queue/report behavior unless separately specified.
- **DESIGN-08:** Disconnected/resting presentation does not imply that pending work is verified or complete.
