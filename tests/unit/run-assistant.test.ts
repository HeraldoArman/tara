import { expect, test } from "bun:test";
import type {
  Alert,
  Attempt,
  Run,
  RunStep,
} from "../../apps/web/src/lib/contracts";
import { getRunAssistantView } from "../../apps/web/src/lib/run-assistant";

const firstTime = "2026-11-07T04:00:00Z";
const laterTime = "2026-11-07T04:00:10Z";

function attempt(id: string, outcome: string, createdAt = firstTime): Attempt {
  return { createdAt, id, kind: "visual", number: 1, outcome, result: {} };
}

function step(id: string, overrides: Partial<RunStep> = {}): RunStep {
  return {
    attempts: [],
    id,
    instruction: `Follow the approved ${id} instruction.`,
    rationale: "Preserve the equipment.",
    sources: [{ heading: `Approved ${id} clause`, page: 3 }],
    status: "current",
    title: `Perform ${id}`,
    verification: { kind: "visual" },
    ...overrides,
  };
}

function alert(overrides: Partial<Alert> = {}): Alert {
  return {
    attemptId: "failed-attempt",
    createdAt: firstTime,
    eventId: "failure-event",
    id: "failure-alert",
    message: "Remove the keycap before inspection.",
    status: "spoken",
    stepId: "inspect",
    ...overrides,
  };
}

function run(overrides: Partial<Run> = {}): Run {
  return {
    alerts: [],
    currentAttemptId: null,
    currentStepId: "inspect",
    deviations: [],
    elapsedSeconds: 15,
    escalations: [],
    evidence: [],
    id: "live-run",
    interactionMode: "silent",
    sop: {
      id: "approved-sop",
      key: "SOP-KBD-01",
      prerequisites: ["Unplug the keyboard"],
      scope: "Approved keyboard service",
      title: "Keyboard inspection",
      version: "1.4.0",
    },
    startedAt: firstTime,
    status: "active",
    steps: [
      step("identify", {
        status: "attested",
        verification: { kind: "attestation" },
      }),
      step("inspect"),
      step("finalize", {
        status: "locked",
        verification: { kind: "finalization" },
      }),
    ],
    version: 4,
    workOrder: {
      asset: { model: "Keychron K2", serial: "DEMO-004" },
      assignedTo: "technician",
      estimatedMinutes: 20,
      id: "work-order",
      issue: "Inspect the intermittent E key.",
      priority: "standard",
      reference: "WO-1042",
      sopVersionId: "pinned-version",
      status: "in_progress",
      title: "Keyboard inspection",
    },
    workOrderId: "work-order",
    ...overrides,
  };
}

test("connected silent execution shows its pinned instruction without changing progress", () => {
  const snapshot = run();
  const before = structuredClone(snapshot);
  const view = getRunAssistantView(snapshot, "connected", false);

  expect(view.status).toBe("active");
  expect(view.title).toBe("Perform inspect");
  expect(view.description).toBe("Follow the approved inspect instruction.");
  expect(view.source).toBe(
    "SOP-KBD-01 · v1.4.0 · Approved inspect clause · p. 3"
  );
  expect(view.stepNumber).toBe(2);
  expect(view.totalSteps).toBe(3);
  expect(view.completedSteps).toBe(1);
  expect(view.allStepsComplete).toBe(false);
  expect(view.verificationStatus).toBe("needs_verification");
  expect(snapshot).toEqual(before);
});

test("verification labels distinguish visual proof, attestation, responses and skipped steps", () => {
  const cases = [
    ["ai_verified", "verified", "AI verified"],
    ["attested", "verified", "Technician attested"],
    ["complete", "verified", "Response recorded"],
    ["skipped", "not_evidenced", "Skipped · exception recorded"],
  ] as const;
  for (const [status, verificationStatus, label] of cases) {
    const snapshot = run({ steps: [step("inspect", { status })] });
    const view = getRunAssistantView(snapshot, "connected", false);
    expect(view.completedSteps).toBe(1);
    // A complete step does not close its run.
    expect(view.status).toBe("active");
    expect(view.allStepsComplete).toBe(true);
    const withNextStep = run({
      steps: [step("inspect", { status }), step("next", { status: "locked" })],
    });
    const stepView = getRunAssistantView(withNextStep, "connected", false);
    expect(stepView.verificationStatus).toBe(verificationStatus);
    expect(stepView.verificationLabel).toBe(label);
  }
});

test("rejected, unclear and provider failures preserve their different meanings", () => {
  const cases = [
    ["rejected", "contradicted", "Mismatch detected"],
    ["failed", "contradicted", "Mismatch detected"],
    ["unclear", "not_evidenced", "More evidence needed"],
    ["error", "not_evidenced", "Verification unavailable"],
  ] as const;
  for (const [outcome, verificationStatus, label] of cases) {
    const snapshot = run({
      alerts: [alert()],
      currentAttemptId: "failed-attempt",
      steps: [
        step("inspect", { attempts: [attempt("failed-attempt", outcome)] }),
      ],
    });
    const view = getRunAssistantView(snapshot, "connected", false);
    expect(view.status).toBe("warning");
    expect(view.title).toBe(snapshot.alerts[0]?.message);
    expect(view.verificationStatus).toBe(verificationStatus);
    expect(view.verificationLabel).toBe(label);
    expect(view.completedSteps).toBe(0);
  }
});

test("historical and mismatched-attempt alerts cannot replace the current instruction", () => {
  const snapshot = run({
    alerts: [
      alert({ stepId: "identify" }),
      alert({ attemptId: "older-attempt" }),
      alert({ attemptId: null }),
    ],
    currentAttemptId: "latest-attempt",
    steps: [
      step("inspect", {
        attempts: [attempt("latest-attempt", "passed", laterTime)],
      }),
    ],
  });
  const view = getRunAssistantView(snapshot, "connected", false);
  expect(view.correction).toBeUndefined();
  expect(view.title).toBe("Perform inspect");
  expect(view.status).toBe("active");
  // An attempt result alone cannot create a verified step.
  expect(view.verificationStatus).toBe("needs_verification");
});

test("spoken or muted alerts still show the correction for the actual failed attempt", () => {
  for (const status of ["pending", "spoken", "muted", "suppressed"]) {
    const correction = alert({
      nextAction: "Use the approved keycap puller.",
      status,
    });
    const snapshot = run({
      alerts: [correction],
      currentAttemptId: "failed-attempt",
      steps: [
        step("inspect", { attempts: [attempt("failed-attempt", "rejected")] }),
      ],
    });
    const view = getRunAssistantView(snapshot, "connected", false);
    expect(view.correction).toBe(correction);
    expect(view.description).toBe("Use the approved keycap puller.");
    expect(view.step?.instruction).toBe(
      "Follow the approved inspect instruction."
    );
  }
});

test("a reopened retest does not reuse the prior rejection as current feedback", () => {
  for (const currentAttemptId of [null, "new-attempt"]) {
    const snapshot = run({
      alerts: [alert()],
      currentAttemptId,
      steps: [
        step("inspect", {
          attempts: [attempt("failed-attempt", "rejected")],
        }),
      ],
    });
    const view = getRunAssistantView(snapshot, "connected", false);
    expect(view.correction).toBeUndefined();
    expect(view.status).toBe("active");
    expect(view.title).toBe("Perform inspect");
    expect(view.verificationStatus).toBe("needs_verification");
    expect(view.verificationLabel).toBe("Awaiting visual evidence");
  }
});

test("a current issue without an attempt is shown, and a later retest supersedes it", () => {
  const correction = alert({ attemptId: null });
  const snapshot = run({ alerts: [correction] });
  expect(getRunAssistantView(snapshot, "connected", false).correction).toBe(
    correction
  );
  const retest = run({
    alerts: [correction],
    currentAttemptId: "retest",
    steps: [
      step("inspect", { attempts: [attempt("retest", "unclear", laterTime)] }),
    ],
  });
  expect(
    getRunAssistantView(retest, "connected", false).correction
  ).toBeUndefined();
});

test("a fresh visual check replaces old correction feedback without completing the step", () => {
  const snapshot = run({
    alerts: [alert()],
    currentAttemptId: "failed-attempt",
    steps: [
      step("inspect", { attempts: [attempt("failed-attempt", "rejected")] }),
    ],
  });
  const view = getRunAssistantView(snapshot, "connected", true);
  expect(view.status).toBe("active");
  expect(view.correction).toBeUndefined();
  expect(view.verificationStatus).toBe("in_progress");
  expect(view.verificationLabel).toBe("Checking current frame");
  expect(view.completedSteps).toBe(0);
  expect(view.step?.id).toBe("inspect");
});

test("held work stays blocked, and pausing or disconnecting never resumes a check", () => {
  const held = run({ steps: [step("inspect", { status: "held" })] });
  expect(getRunAssistantView(held, "connected", true).verificationStatus).toBe(
    "blocked"
  );
  expect(getRunAssistantView(held, "connected", true).status).toBe("warning");
  const paused = getRunAssistantView(
    run({ status: "paused" }),
    "connected",
    true
  );
  expect(paused.status).toBe("sleep");
  expect(paused.active).toBe(true);
  expect(paused.verificationStatus).toBe("needs_verification");
  for (const connection of ["disconnected", "connecting", "reconnecting"]) {
    const view = getRunAssistantView(run(), connection, true);
    expect(view.status).toBe("sleep");
    expect(view.verificationStatus).toBe("needs_verification");
  }
});

test("recorded steps await session close and full completion never invents a next step", () => {
  const snapshot = run({
    currentStepId: null,
    steps: [
      step("identify", { status: "attested" }),
      step("inspect", { status: "ai_verified" }),
    ],
  });
  const pending = getRunAssistantView(snapshot, "connected", false);
  expect(pending.status).toBe("active");
  expect(pending.allStepsComplete).toBe(true);
  expect(pending.title).toBe("All required steps recorded");
  expect(pending.verificationLabel).toBe("Awaiting session close");
  expect(pending.step).toBeUndefined();
  expect(pending.stepNumber).toBe(2);
  const closed = getRunAssistantView(
    { ...snapshot, status: "complete" },
    "disconnected",
    false
  );
  expect(closed.status).toBe("success");
  expect(closed.active).toBe(false);
  expect(closed.completedSteps).toBe(2);
  expect(closed.stepNumber).toBe(2);
  expect(closed.verificationStatus).toBeUndefined();
});

test("partial records and empty snapshots never appear fully verified", () => {
  const partial = getRunAssistantView(
    run({ alerts: [alert()], status: "partial" }),
    "connected",
    false
  );
  expect(partial.status).toBe("sleep");
  expect(partial.active).toBe(false);
  expect(partial.title).toBe("Session recorded");
  expect(partial.description).toContain("unresolved");
  expect(partial.correction).toBeUndefined();
  expect(partial.verificationStatus).toBeUndefined();
  const empty = getRunAssistantView(
    run({ currentStepId: null, steps: [] }),
    "connected",
    false
  );
  expect(empty.allStepsComplete).toBe(false);
  expect(empty.stepNumber).toBe(0);
  expect(empty.verificationStatus).toBeUndefined();
});
