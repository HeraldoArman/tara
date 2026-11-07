import type {
  AssistantStateSelection,
  VerificationStatus,
} from "@tara/ui/lib/assistant";

import { previewSteps } from "./preview-data";
import type { PreviewProgress } from "./preview-progress";

export interface PreviewCorrection {
  description: string;
  guidanceDescription: string;
  title: string;
}

interface PreviewInstruction {
  announcement: string;
  correction?: PreviewCorrection;
  description: string;
  observation: string;
  title: string;
  verificationLabel?: string;
  verificationStatus: VerificationStatus;
}

/** A correction temporarily replaces the instruction, never its SOP position. */
export function getPreviewInstruction(
  progress: PreviewProgress,
  selection: AssistantStateSelection,
  paused: boolean
): PreviewInstruction {
  const step = previewSteps[progress.stepIndex] ?? previewSteps[0];
  const stepNumber = progress.stepIndex + 1;
  const totalSteps = previewSteps.length;

  if (progress.phase === "complete") {
    return {
      announcement: "All SOP steps complete.",
      description: `${totalSteps} of ${totalSteps} SOP steps completed in this preview.`,
      observation: "Procedure complete · preview",
      title: "Procedure complete",
      verificationLabel: "Complete · preview",
      verificationStatus: "verified",
    };
  }

  if (progress.phase === "success") {
    return {
      announcement: `Step ${stepNumber} of ${totalSteps}: ${step.title}. Complete.`,
      description: step.description,
      observation: `Step ${stepNumber} complete · preview`,
      title: step.title,
      verificationLabel: "Complete · preview",
      verificationStatus: "verified",
    };
  }

  if (selection === "warning") {
    return {
      announcement: `Temporary correction for step ${stepNumber}: ${step.correction.title} ${step.correction.description}`,
      correction: step.correction,
      description: step.correction.description,
      observation: `Temporary correction · step ${stepNumber} held`,
      title: step.correction.title,
      verificationLabel: "Temporary correction",
      verificationStatus: "blocked",
    };
  }

  return {
    announcement: `Step ${stepNumber} of ${totalSteps}: ${step.title}.`,
    description: step.description,
    observation:
      paused || selection === "sleep"
        ? "Live view · assistant resting"
        : "Preview feed · awaiting visual evidence",
    title: step.title,
    verificationStatus: "not_evidenced",
  };
}
