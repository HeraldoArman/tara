import { expect, test } from "bun:test";
import { previewSteps } from "../../apps/web/src/components/assistant/preview-data";
import { getPreviewInstruction } from "../../apps/web/src/components/assistant/preview-instruction";
import {
  completedPreviewSteps,
  initialPreviewProgress,
  previewProgressReducer,
} from "../../apps/web/src/components/assistant/preview-progress";

test("a warning replaces the inspection instruction without changing SOP progress", () => {
  const progress = Object.freeze({ ...initialPreviewProgress });
  const warning = getPreviewInstruction(progress, "warning", false);

  expect(warning.title).toBe("Put your hands away.");
  expect(warning.description).toContain("keycap puller");
  expect(warning.verificationStatus).toBe("blocked");
  expect(warning.verificationLabel).toBe("Temporary correction");
  expect(warning.announcement).toContain("Temporary correction for step 2");
  expect(warning.announcement).toContain(warning.title);
  expect(progress).toEqual(initialPreviewProgress);
  expect(completedPreviewSteps(progress)).toBe(1);
});

test("Active and Auto restore the same SOP instruction after a warning", () => {
  const progress = Object.freeze({ ...initialPreviewProgress });
  const original = getPreviewInstruction(progress, "active", false);

  for (const selection of ["active", "auto"] as const) {
    const warning = getPreviewInstruction(progress, "warning", false);
    const resumed = getPreviewInstruction(progress, selection, false);

    expect(warning.title).not.toBe(original.title);
    expect(resumed).toEqual(original);
    expect(resumed.correction).toBeUndefined();
    expect(resumed.verificationStatus).toBe("not_evidenced");
    expect(completedPreviewSteps(progress)).toBe(1);
  }
});

test("pausing keeps the correction until the assistant resumes", () => {
  const warning = getPreviewInstruction(
    initialPreviewProgress,
    "warning",
    false
  );
  const paused = getPreviewInstruction(initialPreviewProgress, "warning", true);
  const resumed = getPreviewInstruction(initialPreviewProgress, "auto", false);

  expect(paused).toEqual(warning);
  expect(paused.observation).toContain("step 2 held");
  expect(resumed.title).toBe("Inspect the faulty key");
  expect(resumed.observation).toBe("Preview feed · awaiting visual evidence");
  expect(
    getPreviewInstruction(initialPreviewProgress, "active", true).observation
  ).toBe("Live view · assistant resting");
  expect(
    getPreviewInstruction(initialPreviewProgress, "sleep", false).observation
  ).toBe("Live view · assistant resting");
});

test("an accepted Success finishes before Warning applies to the following step", () => {
  const success = previewProgressReducer(initialPreviewProgress, {
    type: "complete-step",
  });
  const feedback = getPreviewInstruction(success, "warning", false);

  expect(feedback.correction).toBeUndefined();
  expect(feedback.title).toBe("Inspect the faulty key");
  expect(feedback.verificationStatus).toBe("verified");
  expect(feedback.announcement).toContain("Complete.");

  const advanced = previewProgressReducer(success, { type: "advance" });
  const nextCorrection = getPreviewInstruction(advanced, "warning", false);

  expect(nextCorrection.title).toBe("Stop pressing the switch.");
  expect(nextCorrection.announcement).toContain("step 3");
  expect(completedPreviewSteps(advanced)).toBe(2);
});

test("Warning cannot reopen a completed procedure", () => {
  const lastStep = {
    ...initialPreviewProgress,
    stepIndex: previewSteps.length - 1,
  };
  const success = previewProgressReducer(lastStep, { type: "complete-step" });
  const completed = previewProgressReducer(success, { type: "advance" });

  for (const paused of [false, true]) {
    const instruction = getPreviewInstruction(completed, "warning", paused);

    expect(instruction.title).toBe("Procedure complete");
    expect(instruction.correction).toBeUndefined();
    expect(instruction.verificationStatus).toBe("verified");
    expect(instruction.announcement).toBe("All SOP steps complete.");
    expect(completedPreviewSteps(completed)).toBe(previewSteps.length);
  }
});

test("each SOP step has its own temporary corrective instruction", () => {
  const correctionTitles = new Set<string>();

  for (const [stepIndex, step] of previewSteps.entries()) {
    const progress = Object.freeze({ ...initialPreviewProgress, stepIndex });
    const instruction = getPreviewInstruction(progress, "warning", false);

    expect(instruction.correction).toBeDefined();
    expect(instruction.title).not.toBe(step.title);
    expect(instruction.description.length).toBeGreaterThan(0);
    expect(completedPreviewSteps(progress)).toBe(stepIndex);
    correctionTitles.add(instruction.title);
  }

  expect(correctionTitles.size).toBe(previewSteps.length);
});
