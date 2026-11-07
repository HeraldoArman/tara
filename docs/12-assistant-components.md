# Real-time assistant UI foundation

The `/assistant` route is a frontend component preview based on the supplied workspace
screenshots and project requirements. It uses TARA branding and English interface copy
to match the visual reference. The authenticated work queue at `/` and execution workspace
at `/runs/[id]` are separate application routes; this preview does not replace them.

## Ownership

| Location | Responsibility |
| --- | --- |
| `packages/ui/src/components/assistant-status.tsx` | Four visual states and the reusable TARA mark |
| `packages/ui/src/components/assistant-guidance.tsx` | Current guidance, source, step position, and text composer |
| `packages/ui/src/components/assistant-controls.tsx` | Controlled layout/state selectors and media controls |
| `packages/ui/src/components/task-step.tsx` | Compact current instruction with optional verification status and trailing content |
| `packages/ui/src/components/verification-badge.tsx` | Explicit execution-result labels, independent of visual state |
| `packages/ui/src/lib/assistant.ts` | Presentation types and default labels; not API DTOs |
| `packages/ui/src/hooks/use-assistant-audio.ts` | Optional transition sounds, mute control, and audio cleanup |
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
Demo mode uses a light workspace surface. Product mode uses translucent dark overlays
above the camera. Both appearances are scoped to the assistant preview.

## Component contracts

| Component | Main props |
| --- | --- |
| `AssistantStatus` | `status` |
| `AssistantGuidance` | `status`, `step`, `totalSteps`, `title`, `description`, `source`, optional `completedSteps`, `hint`, `eyebrow`, `onViewSop`, and `children` |
| `ReplyComposer` | `onSubmit`, optional `disabled`, `pending`, `placeholder`, `statusMessage` |
| `AssistantModeControl` | `value: "demo" \| "product"`, `onValueChange` |
| `AssistantStateControl` | `value: "auto" \| AssistantState`, `onValueChange`, optional `successDisabled` |
| `MediaControls` | `source`, `onSourceChange`, `paused`, `onPausedChange`, optional `sourceBusy`, `audioEnabled`, `onAudioEnabledChange` |
| `TaskStep` | `title`, `description`, optional `verificationStatus`, `verificationLabel`, `children` |
| `VerificationBadge` | `status`, optional `label` |

`ReplyComposer` trims whitespace, rejects empty submissions, supports pending/disabled
states, and clears a submitted draft. The owning application handles delivery, errors,
and retry policy. The audio control is absent unless its callback is supplied.

`AssistantGuidance` shows the current position in an SOP. Its optional `completedSteps`
prop supplies an explicit completed count for the progress bar, including full progress
after the last step. Without it, the bar defaults to the steps preceding the current one.
The owning application supplies the count; the component does not verify or advance steps.
`AssistantStateControl` accepts optional `successDisabled` to prevent repeat completion
while feedback is pending or after the workflow has finished. `TaskStep` accepts
`verificationLabel` to distinguish a simulated result from an authoritative live result.
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
  These choices do not complete steps. The shared control emits `"success"` through its
  existing `onValueChange` callback; the owning application controls timing and progress.
- **Corrective instruction:** Warning temporarily replaces the bottom SOP instruction
  and contextual guidance with a correction for the current step. For example, the
  inspection correction says “Put your hands away.” and asks for a keycap puller.
  Corrections are sample instructions, not claims that the preview detected an error.
  They do not add an SOP step, change its number, or complete it. Return to current step,
  Active, and Auto restore the original instruction. Success is disabled while a
  correction is showing, including when paused, so dismissing a correction cannot
  accidentally complete the SOP step. Pause retains the correction in the bottom
  instruction until Resume, Active, or Auto restores the original step. If Warning arrives
  during an already accepted Success pulse, that completion still advances exactly once;
  the correction then applies to the next active step. The terminal completion view is
  never replaced by a correction.
- **Success and progress:** this local preview starts on step 2, with step 1 supplied as
  completed demo context. With no correction active, Success completes the current
  preview step and shows green feedback for 0.7 seconds, then advances the bottom
  instruction, guidance, source, camera step label, and SOP highlight together.
  Repeated clicks during feedback cannot
  skip steps. The appearance returns to Active unless another state or Pause was chosen
  during the feedback; accepted completion still advances exactly once. Switching
  layouts or muting audio preserves progress. After the last step, the preview shows
  completion and full progress rather than a nonexistent next step. Success is disabled
  until the preview is restarted. Clearing a correction does not create a step completion
  in the session record. These transitions are simulated, not server verification.
- **Sleep/Pause:** hides the consultation panel but retains the current instruction,
  verification label, and source access. The local video and elapsed-view timer continue.
- **State audio:** Sleep → Active says “TARA is online” with a wake chime. Success uses
  a short positive chime; Warning uses urgent pulses; Warning → Active plays a calming
  descending sound. Sleep and the return from Success have their own soft cues. Sounds
  start with state-control interactions, never on initial page load or a layout change.
  The speaker button mutes them and stops current playback. The reusable audio hook is
  optional; it does not send commands or change verification. Voice availability depends
  on the browser, with a chime fallback. Live assistant speech is still separate.
- **Ask TARA:** explicitly enables the text composer. The local response is labeled sample
  guidance and never advances a step. Return to silent mode disables further text turns.
- **SOP:** opens a clearly labeled sample procedure with the current step and completed
  checkmarks. **Session record:** lists local preview completions, distinguishing seeded
  demo context from steps completed with Success. It does not claim to be a server audit.
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

The preview types are view models. Use the existing [frontend contracts](../apps/web/src/lib/contracts.ts),
backed by [generated OpenAPI types](../apps/web/src/lib/generated/api.d.ts), and map server
data into these props in `apps/web`; do not make `packages/ui` depend on FastAPI or LiveKit.
Run `bun run api:generate` when regenerating types from the server schema.

The application already has a separate [execution workspace](../apps/web/src/components/tara/workspace.tsx)
at `/runs/[id]`. Its [session hook](../apps/web/src/lib/use-run-session.ts) handles connection,
`assistant.activate`, `assistant.deactivate`, and server events; the workspace sends
`assistant.text`, `run.retry`, and `run.respond` through that session. The server-side
[agent bridge](../apps/server/src/tara_server/agent/bridge.py) and
[execution domain](../apps/server/src/tara_server/domain/execution.py) own command handling
and authoritative run transitions.

Integrating these shared components into that workspace remains separate work. Keep its
existing session, evidence and audit behavior when replacing presentation elements.
The local Success flow is a demonstration fixture, not a verification engine for live
runs. In the connected workspace, server events must drive completed counts and step
transitions; a typed confirmation must not become a verified visual result. A verified
checkpoint and a completed workflow remain separate outcomes. Voice, live AI and
evidence persistence are not features of `/assistant`.

## Local checks

Use the repository's declared Bun version (`1.4.4`) to read its lockfile, then:

```sh
bun install --frozen-lockfile
bun run check-types
bunx ultracite check apps/web/src/components/assistant apps/web/src/app/assistant packages/ui/src/components/assistant-controls.tsx packages/ui/src/components/assistant-guidance.tsx packages/ui/src/components/assistant-status.tsx packages/ui/src/components/task-step.tsx packages/ui/src/components/verification-badge.tsx packages/ui/src/lib/assistant.ts packages/ui/src/styles/assistant.css
bun run dev:web
```

At `/assistant`, check all four states, both layouts, Pause/Resume, Ask TARA and text
submission, SOP/record dialogs, camera denial, and a narrow viewport. Confirm that
Success advances exactly once after 0.7 seconds, including when clicked repeatedly or
followed by Pause or another appearance choice. Check that every step consumer stays
in sync, the final step reaches full completion without a step 6, and a restart clears
pending feedback and local progress. Appearance and consultation actions alone must
not complete steps. Trigger Warning on each step and confirm the correction temporarily
replaces the instruction without changing the SOP position or completed count. Active,
Auto, and Return to current step must restore that same step. Success must remain
disabled during a correction, including while paused. Also check Warning during
accepted Success feedback: the completed step advances once, and the next step shows
its own correction. Warning after terminal completion must retain the completed view.
