# Real-time assistant UI foundation

The `/assistant` route is a frontend component preview based on `tara.txt`, the supplied
workspace screenshots, and `new-design/`. The existing home route remains available for
the team's queue work. The preview uses TARA branding and English interface copy to match
the visual reference.

## Ownership

| Location | Responsibility |
| --- | --- |
| `packages/ui/src/components/assistant-status.tsx` | Four visual states and the reusable TARA mark |
| `packages/ui/src/components/assistant-guidance.tsx` | Current guidance, source, step position, and text composer |
| `packages/ui/src/components/assistant-controls.tsx` | Controlled layout/state selectors and media controls |
| `packages/ui/src/components/task-step.tsx` | Compact current instruction with optional verification status and trailing content |
| `packages/ui/src/components/verification-badge.tsx` | Explicit execution-result labels, independent of visual state |
| `packages/ui/src/lib/assistant.ts` | Presentation types and default labels; not API DTOs |
| `packages/ui/src/styles/assistant.css` | Scoped design tokens and component appearance |
| `apps/web/src/components/assistant/` | Preview composition, fixtures, details dialog, keyboard scene, and local camera lifecycle |

Import components directly, without a barrel. Existing Base UI/shadcn Button, Card, and
InputGroup primitives are reused; their global appearance has not been changed.

## Minimal usage

```tsx
import "@tara/ui/assistant.css";
import { AssistantStatus } from "@tara/ui/components/assistant-status";
import { TaskStep } from "@tara/ui/components/task-step";

export function CurrentTask() {
  return (
    <section className="tara-assistant" data-state="active">
      <AssistantStatus status="active" />
      <TaskStep
        description="Bring the exposed switch into clear view."
        title="Inspect the faulty key"
        verificationStatus="not_evidenced"
      />
    </section>
  );
}
```

The `.tara-assistant` wrapper supplies component tokens. `data-state` changes the accent;
it does not mutate execution data. Components also accept `className` for composition.
The preview deliberately uses a light workspace surface, including inside the application's
dark theme, to preserve the reference design without replacing the team's global theme.

## Component contracts

| Component | Main props |
| --- | --- |
| `AssistantStatus` | `status` |
| `AssistantGuidance` | `status`, `step`, `totalSteps`, `title`, `description`, `source`, optional `hint`, `eyebrow`, `onViewSop`, and `children` |
| `ReplyComposer` | `onSubmit`, optional `disabled`, `pending`, `placeholder`, `statusMessage` |
| `AssistantModeControl` | `value: "demo" \| "product"`, `onValueChange` |
| `AssistantStateControl` | `value: "auto" \| AssistantState`, `onValueChange` |
| `MediaControls` | `source`, `onSourceChange`, `paused`, `onPausedChange`, optional `sourceBusy`, `audioEnabled`, `onAudioEnabledChange` |
| `TaskStep` | `title`, `description`, optional `verificationStatus`, `children` |
| `VerificationBadge` | `status`, optional `label` |

`ReplyComposer` trims whitespace, rejects empty submissions, supports pending/disabled
states, and clears a submitted draft. The owning application handles delivery, errors,
and retry policy. The audio control is absent unless its callback is supplied.

`AssistantGuidance` shows the current position in an SOP, not a count of verified steps.
`VerificationBadge` accepts `pending`, `in_progress`, `verified`, `not_evidenced`,
`contradicted`, `needs_verification`, `blocked`, or `requires_approval`.
Missing evidence is visually distinct from a contradicted requirement.

## Preview behavior

- **Demo:** camera and contextual guidance sit side by side, stacking on smaller screens.
- **Product:** translucent liquid-glass overlays keep the camera visible beneath guidance
  and controls on desktop. On narrow screens, guidance appears before the camera so it
  remains readable. State-colored light strengthens the workspace edges without covering
  the center of the camera.
- **Appearance selector:** selects Sleep, Active, or Warning. Auto restores Active.
  Success is a momentary button: it shows green for three seconds, then returns to Active.
  Pressing it again restarts the interval. Selecting another state or pausing cancels the
  return timer; switching layouts preserves it. No appearance control changes the
  verification result or generates audit events. The shared control emits `"success"`
  through its existing `onValueChange` callback; the owning application controls timing.
- **Sleep/Pause:** hides the consultation panel but retains the current instruction,
  verification label, and source access. The local video and elapsed-view timer continue.
- **Ask TARA:** explicitly enables the text composer. The local response is labeled sample
  guidance and never advances a step. Return to silent mode disables further text turns.
- **SOP:** opens a clearly labeled sample procedure. **Session record:** explains the empty
  record; UI interactions are not misrepresented as execution events.
- **Webcam:** requests video only after a click, keeps frames in the browser, and stops
  tracks when returning to simulation, leaving the page, or receiving a disconnect.
  Denied permissions and missing devices leave the simulated feed usable.

Keyboard controls, visible focus, native modal focus containment/Escape, descriptive
labels, polite status announcements, and reduced-motion styling are included.

## Connecting the live assistant

Keep the three concerns separate:

1. **Appearance:** Sleep / Active / Warning / Success.
2. **Interaction:** silent / alert / consultation, owned by the application and worker.
3. **Execution:** authoritative step, attempt, evidence, and verification state.

The preview types are view models. Generate server DTOs from OpenAPI and map them into
these props in `apps/web`; do not make `packages/ui` depend on FastAPI or LiveKit.

Follow [the API/frontend plan](05-api-frontend.md) for `assistant.activate`,
`assistant.deactivate`, `assistant.text`, `run.retry`, `run.respond`, and server events.
The UI must not implement a second local verification engine or turn a typed confirmation
into a verified visual result. A verified checkpoint and a completed workflow remain
separate outcomes. Voice, live AI, evidence persistence, and production run routes are
future integration work, not features of this preview.

## Local checks

Use the repository's declared Bun version (`1.4.4`) to read its lockfile, then:

```sh
bun install --frozen-lockfile
bun run check-types
bunx ultracite check apps/web/src/components/assistant apps/web/src/app/assistant packages/ui/src/components/assistant-controls.tsx packages/ui/src/components/assistant-guidance.tsx packages/ui/src/components/assistant-status.tsx packages/ui/src/components/task-step.tsx packages/ui/src/components/verification-badge.tsx packages/ui/src/lib/assistant.ts packages/ui/src/styles/assistant.css
bun run dev:web
```

At `/assistant`, check all four states, both layouts, Pause/Resume, Ask TARA and text
submission, SOP/record dialogs, camera denial, and a narrow viewport. Confirm that the
verification badge remains unchanged after every appearance or consultation action.
