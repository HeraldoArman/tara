"use client";

import {
  AssistantGuidance,
  type AssistantGuidanceProps,
  ReplyComposer,
} from "@tara/ui/components/assistant-guidance";
import { Button } from "@tara/ui/components/button";
import type { AssistantState, CameraSource } from "@tara/ui/lib/assistant";
import { ArrowLeft, MessageCircle, RotateCcw } from "lucide-react";
import { useCallback, useState } from "react";

import { previewSteps } from "./preview-data";
import type { PreviewCorrection } from "./preview-instruction";
import {
  completedPreviewSteps,
  type PreviewProgress,
} from "./preview-progress";

interface PreviewGuidanceProps {
  cameraSource: CameraSource;
  correction?: PreviewCorrection;
  onRestart: () => void;
  onResumeStep: () => void;
  onViewSop: () => void;
  progress: PreviewProgress;
  source: string;
  status: AssistantState;
}

function getGuidanceContent(
  progress: PreviewProgress,
  correction: PreviewCorrection | undefined,
  cameraSource: CameraSource,
  replied: boolean
): Pick<AssistantGuidanceProps, "title" | "description" | "hint" | "eyebrow"> {
  const currentStep = previewSteps[progress.stepIndex] ?? previewSteps[0];
  if (progress.phase === "complete") {
    return {
      description:
        "You’ve reached the end of the procedure. Review your completed steps, or start a fresh preview.",
      eyebrow: "Nicely done",
      title: "All steps complete.",
    };
  }
  if (progress.phase === "success") {
    const nextAction =
      progress.stepIndex === previewSteps.length - 1
        ? "Finishing the procedure…"
        : "Preparing the next step…";
    return {
      description: `${currentStep.title} is complete in this preview. ${nextAction}`,
      eyebrow: "Nicely done",
      title: "Step complete.",
    };
  }
  if (correction) {
    return {
      description: correction.guidanceDescription,
      eyebrow: "Temporary correction",
      hint: `Then resume step ${progress.stepIndex + 1}: ${currentStep.title}.`,
      title: correction.title,
    };
  }
  return {
    description: replied
      ? `Stay on this step: ${currentStep.description} In a connected session, TARA will use the current SOP and evidence to answer your question.`
      : currentStep.guidanceDescription,
    hint:
      cameraSource === "webcam"
        ? "Your camera stays local to this browser. Success completes this preview step; no AI visual check is performed."
        : currentStep.detail,
    title: replied ? "Let’s take a closer look." : currentStep.guidanceTitle,
  };
}

export function PreviewGuidance({
  cameraSource,
  correction,
  onRestart,
  onResumeStep,
  onViewSop,
  progress,
  source,
  status,
}: PreviewGuidanceProps) {
  const [consultation, setConsultation] = useState(false);
  const [replied, setReplied] = useState(false);
  const onReply = useCallback(() => setReplied(true), []);
  const toggleConsultation = useCallback(
    () => setConsultation((value) => !value),
    []
  );
  const complete = progress.phase === "complete";
  const stepSucceeded = progress.phase !== "working";
  const content = getGuidanceContent(
    progress,
    correction,
    cameraSource,
    replied
  );

  return (
    <AssistantGuidance
      completedSteps={completedPreviewSteps(progress)}
      description={content.description}
      eyebrow={content.eyebrow}
      hint={content.hint}
      onViewSop={onViewSop}
      source={source}
      status={status}
      step={progress.stepIndex + 1}
      title={content.title}
      totalSteps={previewSteps.length}
    >
      {correction ? (
        <Button
          className="tara-return-to-step"
          onClick={onResumeStep}
          variant="outline"
        >
          <ArrowLeft data-icon="inline-start" />
          Return to current step
        </Button>
      ) : null}
      {complete ? (
        <Button
          className="tara-restart-preview"
          onClick={onRestart}
          variant="outline"
        >
          <RotateCcw data-icon="inline-start" />
          Restart preview
        </Button>
      ) : (
        <>
          <div className="tara-consultation-control">
            <Button
              disabled={stepSucceeded}
              onClick={toggleConsultation}
              variant="ghost"
            >
              <MessageCircle data-icon="inline-start" />
              {consultation ? "Return to silent mode" : "Ask TARA"}
            </Button>
            <span>{consultation ? "Text preview active" : "Silent mode"}</span>
          </div>
          <ReplyComposer
            disabled={!consultation || stepSucceeded}
            onSubmit={onReply}
            placeholder="Type a reply…"
            statusMessage={
              consultation
                ? "Sample replies · voice is not connected"
                : "Activate Ask TARA to type"
            }
          />
          {replied && !stepSucceeded && !correction ? (
            <p className="tara-reply-notice" role="status">
              Practice reply received. Verification remains unchanged.
            </p>
          ) : null}
        </>
      )}
    </AssistantGuidance>
  );
}
