"use client";

import { Button } from "@tara/ui/components/button";
import { Check, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

import {
  INITIAL_PREVIEW_STEP_INDEX,
  previewSteps,
  previewTask,
} from "./preview-data";

export type PreviewDetail = "sop" | "record" | "help" | null;

const detailTitles = {
  help: "A workspace built around you.",
  record: "Your session record.",
  sop: "The procedure, in focus.",
} as const;

interface PreviewProgressProps {
  readonly complete: boolean;
  readonly completedStepCount: number;
  readonly currentStepIndex: number;
}

function PreviewSop({
  complete,
  completedStepCount,
  currentStepIndex,
}: PreviewProgressProps) {
  const currentStep =
    previewSteps[currentStepIndex] ?? previewSteps[INITIAL_PREVIEW_STEP_INDEX];
  const source = `${previewTask.sop} ${currentStep.clause} · ${previewTask.version}`;

  return (
    <>
      <p>{source} · Sample procedure from the keyboard demonstration.</p>
      <ol className="tara-sop-list">
        {previewSteps.map((step, index) => (
          <li
            aria-current={
              !complete && index === currentStepIndex ? "step" : undefined
            }
            data-completed={index < completedStepCount || undefined}
            key={step.id}
          >
            <span className="tara-sop-number">
              {index < completedStepCount ? (
                <>
                  <Check aria-hidden="true" />
                  <span className="sr-only">Completed in preview:</span>
                </>
              ) : (
                index + 1
              )}
            </span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="tara-detail-note">
        This preview shows sample content and local progress. A live task will
        use the published SOP and verification results returned by the server.
      </p>
    </>
  );
}

function PreviewRecord({
  complete,
  completedStepCount,
  seededStepCount,
}: Pick<PreviewProgressProps, "complete" | "completedStepCount"> & {
  readonly seededStepCount: number;
}) {
  return (
    <>
      <p>
        {completedStepCount} of {previewSteps.length} steps complete in this
        preview. {complete ? "The sample procedure is finished." : null}
      </p>
      <ol className="tara-sop-list">
        {previewSteps.slice(0, completedStepCount).map((step, index) => (
          <li data-completed="true" key={step.id}>
            <span className="tara-sop-number">
              <Check aria-hidden="true" />
            </span>
            <div>
              <h3>
                Step {index + 1} · {step.title}
              </h3>
              <p>
                {index < seededStepCount
                  ? "Demo starting context · already complete when this preview opens."
                  : "Completed locally with Success · simulated result."}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <p className="tara-detail-note">
        These are local preview completions. No evidence has been verified and
        no server audit record has been created. Live sessions will show
        server-confirmed checks, evidence, and step transitions here.
      </p>
    </>
  );
}

export function PreviewDetails({
  complete,
  completedStepCount,
  currentStepIndex,
  kind,
  onClose,
  seededStepCount,
}: PreviewProgressProps & {
  readonly kind: PreviewDetail;
  readonly onClose: () => void;
  readonly seededStepCount: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (kind) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [kind]);

  return (
    <dialog
      aria-labelledby={titleId}
      className="tara-preview-dialog"
      onClose={onClose}
      ref={dialogRef}
    >
      <div className="tara-preview-dialog-heading">
        <span className="tara-workspace-eyebrow">tara / COMPONENT PREVIEW</span>
        <Button
          aria-label="Close details"
          onClick={onClose}
          size="icon"
          variant="ghost"
        >
          <X />
        </Button>
      </div>
      <h2 id={titleId}>{kind ? detailTitles[kind] : "Workspace details"}</h2>
      {kind === "sop" ? (
        <PreviewSop
          complete={complete}
          completedStepCount={completedStepCount}
          currentStepIndex={currentStepIndex}
        />
      ) : null}
      {kind === "record" ? (
        <PreviewRecord
          complete={complete}
          completedStepCount={completedStepCount}
          seededStepCount={seededStepCount}
        />
      ) : null}
      {kind === "help" ? (
        <div className="tara-help-content">
          <p>
            Try Demo for a side-by-side workspace, or Product for focused
            guidance over the camera view.
          </p>
          <p>
            Success completes the current preview step when no correction is
            active. It flashes green for 0.7 seconds, then advances to the next
            instruction. The final step finishes the sample procedure. Repeated
            clicks during feedback cannot skip steps.
          </p>
          <p>
            Warning temporarily replaces the bottom instruction with a
            correction, such as “Put your hands away.” It does not add or
            complete an SOP step. Choose Return to current step, Active, or Auto
            to restore the original instruction. Success stays disabled while a
            correction is showing.
          </p>
          <p>
            A Warning during an already accepted Success does not undo that
            completion. The step advances after its feedback, and the correction
            applies to the next step. A finished procedure keeps its completion
            view. Pause keeps the correction in the bottom instruction until you
            resume or choose Active or Auto. Switching layouts preserves
            progress.
          </p>
          <p>
            State changes have short sound cues. Waking from Sleep says “tara is
            online.” Use the speaker control to mute or enable assistant audio.
          </p>
          <p>
            Choose Ask tara to try the text composer. Replies are local sample
            guidance; voice and AI verification are not connected.
          </p>
          <p>
            Use webcam requests camera access only. The preview stays in your
            browser; no frames are uploaded or saved. Return to the simulated
            feed to stop the camera.
          </p>
        </div>
      ) : null}
    </dialog>
  );
}
