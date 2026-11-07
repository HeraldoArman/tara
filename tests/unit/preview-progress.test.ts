import { expect, test } from "bun:test";
import { previewSteps } from "../../apps/web/src/components/assistant/preview-data";
import {
  completedPreviewSteps,
  initialPreviewProgress,
  previewProgressReducer,
} from "../../apps/web/src/components/assistant/preview-progress";

test("the initial inspection step distinguishes seeded demo completion", () => {
  expect(initialPreviewProgress.phase).toBe("working");
  expect(previewSteps[initialPreviewProgress.stepIndex]?.id).toBe("inspect");
  expect(completedPreviewSteps(initialPreviewProgress)).toBe(1);
  expect(initialPreviewProgress.seededStepCount).toBe(1);
});

test("a timer cannot advance a step that has not succeeded", () => {
  const progress = previewProgressReducer(initialPreviewProgress, {
    type: "advance",
  });

  expect(progress).toBe(initialPreviewProgress);
  expect(completedPreviewSteps(progress)).toBe(1);
});

test("repeated Success and advance events complete exactly one step", () => {
  const success = previewProgressReducer(initialPreviewProgress, {
    type: "complete-step",
  });
  const repeatedSuccess = previewProgressReducer(success, {
    type: "complete-step",
  });

  expect(repeatedSuccess).toBe(success);
  expect(repeatedSuccess.phase).toBe("success");
  expect(repeatedSuccess.stepIndex).toBe(initialPreviewProgress.stepIndex);
  expect(completedPreviewSteps(repeatedSuccess)).toBe(2);

  const advanced = previewProgressReducer(repeatedSuccess, { type: "advance" });
  const repeatedAdvance = previewProgressReducer(advanced, { type: "advance" });

  expect(repeatedAdvance).toBe(advanced);
  expect(repeatedAdvance.phase).toBe("working");
  expect(previewSteps[repeatedAdvance.stepIndex]?.id).toBe("replace");
  expect(completedPreviewSteps(repeatedAdvance)).toBe(2);
  expect(repeatedAdvance.seededStepCount).toBe(1);
});

test("all five steps finish at the last step without an extra instruction", () => {
  let progress = previewProgressReducer(initialPreviewProgress, {
    type: "restart",
  });

  for (const [stepIndex, step] of previewSteps.entries()) {
    expect(progress.phase).toBe("working");
    expect(previewSteps[progress.stepIndex]?.id).toBe(step.id);
    expect(completedPreviewSteps(progress)).toBe(stepIndex);

    progress = previewProgressReducer(progress, { type: "complete-step" });
    expect(progress.phase).toBe("success");
    expect(progress.stepIndex).toBe(stepIndex);
    expect(completedPreviewSteps(progress)).toBe(stepIndex + 1);

    progress = previewProgressReducer(progress, { type: "advance" });
  }

  expect(progress.phase).toBe("complete");
  expect(progress.stepIndex).toBe(previewSteps.length - 1);
  expect(completedPreviewSteps(progress)).toBe(previewSteps.length);
  expect(progress.seededStepCount).toBe(0);
  expect(previewProgressReducer(progress, { type: "complete-step" })).toBe(
    progress
  );
  expect(previewProgressReducer(progress, { type: "advance" })).toBe(progress);
});

test("restart clears pending completion and seeded context for a fresh run", () => {
  const success = previewProgressReducer(initialPreviewProgress, {
    type: "complete-step",
  });
  const restarted = previewProgressReducer(success, { type: "restart" });

  expect(restarted).toEqual({
    phase: "working",
    seededStepCount: 0,
    stepIndex: 0,
  });
  expect(completedPreviewSteps(restarted)).toBe(0);
  expect(previewProgressReducer(restarted, { type: "advance" })).toBe(
    restarted
  );

  const freshCompletion = previewProgressReducer(restarted, {
    type: "complete-step",
  });
  expect(completedPreviewSteps(freshCompletion)).toBe(1);
  expect(freshCompletion.seededStepCount).toBe(0);
  expect(initialPreviewProgress.seededStepCount).toBe(1);
});
