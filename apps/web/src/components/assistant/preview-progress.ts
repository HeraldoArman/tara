import { INITIAL_PREVIEW_STEP_INDEX, previewSteps } from "./preview-data";

export interface PreviewProgress {
  phase: "working" | "success" | "complete";
  seededStepCount: number;
  stepIndex: number;
}

type PreviewProgressAction =
  | { type: "complete-step" }
  | { type: "advance" }
  | { type: "restart" };

export const initialPreviewProgress: PreviewProgress = {
  phase: "working",
  seededStepCount: INITIAL_PREVIEW_STEP_INDEX,
  stepIndex: INITIAL_PREVIEW_STEP_INDEX,
};

export function completedPreviewSteps(progress: PreviewProgress): number {
  return progress.stepIndex + (progress.phase === "working" ? 0 : 1);
}

export function previewProgressReducer(
  progress: PreviewProgress,
  action: PreviewProgressAction
): PreviewProgress {
  if (action.type === "restart") {
    return { phase: "working", seededStepCount: 0, stepIndex: 0 };
  }
  if (action.type === "complete-step" && progress.phase === "working") {
    return { ...progress, phase: "success" };
  }
  if (action.type !== "advance" || progress.phase !== "success") {
    return progress;
  }
  if (progress.stepIndex === previewSteps.length - 1) {
    return { ...progress, phase: "complete" };
  }
  return { ...progress, phase: "working", stepIndex: progress.stepIndex + 1 };
}
