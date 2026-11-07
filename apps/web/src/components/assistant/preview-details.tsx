"use client";

import { Button } from "@tara/ui/components/button";
import { Check, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

import { previewSteps, previewTask } from "./preview-data";

export type PreviewDetail = "sop" | "record" | "help" | null;

const detailTitles = {
  help: "A workspace built around you.",
  record: "Your session record.",
  sop: "The procedure, in focus.",
} as const;

export function PreviewDetails({
  kind,
  onClose,
}: {
  kind: PreviewDetail;
  onClose: () => void;
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
        <span className="tara-workspace-eyebrow">TARA / COMPONENT PREVIEW</span>
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
        <>
          <p>
            {previewTask.source} · Sample procedure from the keyboard
            demonstration.
          </p>
          <ol className="tara-sop-list">
            {previewSteps.map((step, index) => (
              <li
                aria-current={
                  index + 1 === previewTask.step ? "step" : undefined
                }
                key={step.id}
              >
                <span className="tara-sop-number">{index + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="tara-detail-note">
            This preview shows sample content. A live task will use the
            published SOP and verification criteria returned by the server.
          </p>
        </>
      ) : null}
      {kind === "record" ? (
        <div className="tara-record-empty">
          <Check aria-hidden="true" />
          <h3>No execution events yet.</h3>
          <p>
            This is a component preview. Changing a color, sending a practice
            reply, or opening your camera does not verify a step or create an
            audit record.
          </p>
          <p>
            In a live session, this space will show server-confirmed checks,
            evidence, corrections, and step transitions.
          </p>
        </div>
      ) : null}
      {kind === "help" ? (
        <div className="tara-help-content">
          <p>
            Try Demo for a side-by-side workspace, or Product for focused
            guidance over the camera view.
          </p>
          <p>
            The state selector previews Sleep, Active, Warning, and Success.
            Auto returns to the default active preview. It never changes the
            step’s verification status.
          </p>
          <p>
            Choose Ask TARA to try the text composer. Replies are local sample
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
