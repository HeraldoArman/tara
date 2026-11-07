import type {
  AssistantState,
  VerificationStatus,
} from "@tara/ui/lib/assistant";
import type { Alert, Run, RunStep } from "./contracts";

const completedStatuses = new Set([
  "ai_verified",
  "attested",
  "complete",
  "completed",
  "passed",
  "skipped",
  "verified",
]);
const failedOutcomes = new Set(["error", "failed", "rejected", "unclear"]);

export interface RunAssistantView {
  active: boolean;
  allStepsComplete: boolean;
  completedSteps: number;
  correction: Alert | undefined;
  description: string;
  source: string;
  status: AssistantState;
  step: RunStep | undefined;
  stepNumber: number;
  title: string;
  totalSteps: number;
  verificationLabel: string | undefined;
  verificationStatus: VerificationStatus | undefined;
}

function currentCorrection(run: Run, step: RunStep): Alert | undefined {
  if (completedStatuses.has(step.status)) {
    return undefined;
  }
  const latest = step.attempts.at(-1);
  return run.alerts
    .filter((alert) => {
      if (alert.stepId !== step.id) {
        return false;
      }
      if (alert.attemptId) {
        return (
          latest?.id === alert.attemptId &&
          latest.id === run.currentAttemptId &&
          failedOutcomes.has(latest.outcome)
        );
      }
      // User-reported issues have no attempt ID. A newer attempt supersedes
      // their guidance; the issue and alert remain in the server audit record.
      return (
        !latest || Date.parse(alert.createdAt) >= Date.parse(latest.createdAt)
      );
    })
    .at(-1);
}

function stepVerification(
  step: RunStep,
  scanning: boolean,
  currentAttemptId: Run["currentAttemptId"]
): { status: VerificationStatus; label: string } {
  switch (step.status) {
    case "ai_verified":
      return { label: "AI verified", status: "verified" };
    case "attested":
      return { label: "Technician attested", status: "verified" };
    case "complete":
    case "completed":
    case "passed":
      return { label: "Response recorded", status: "verified" };
    case "verified":
      return { label: "Verified", status: "verified" };
    case "skipped":
      return { label: "Skipped · exception recorded", status: "not_evidenced" };
    case "held":
      return { label: "Step held", status: "blocked" };
    case "locked":
      return { label: "Not started", status: "pending" };
    default:
      break;
  }
  if (scanning) {
    return { label: "Checking current frame", status: "in_progress" };
  }
  const latest = step.attempts.at(-1);
  switch (latest?.id === currentAttemptId ? latest?.outcome : undefined) {
    case "failed":
    case "rejected":
      return { label: "Mismatch detected", status: "contradicted" };
    case "unclear":
      return { label: "More evidence needed", status: "not_evidenced" };
    case "error":
      return { label: "Verification unavailable", status: "not_evidenced" };
    default:
      break;
  }
  if (step.verification.kind === "visual") {
    return { label: "Awaiting visual evidence", status: "needs_verification" };
  }
  return {
    label:
      step.verification.kind === "choice"
        ? "Awaiting observed result"
        : "Awaiting technician confirmation",
    status: "in_progress",
  };
}

function assistantState(
  run: Run,
  connection: string,
  allStepsComplete: boolean,
  needsAttention: boolean
): AssistantState {
  if (run.status === "complete" && allStepsComplete) {
    return "success";
  }
  if (run.status !== "active" || connection !== "connected") {
    return "sleep";
  }
  return needsAttention ? "warning" : "active";
}

/** Map a server snapshot to presentation props without changing execution state. */
export function getRunAssistantView(
  run: Run,
  connection: string,
  checking: boolean
): RunAssistantView {
  const totalSteps = run.steps.length;
  const index = run.steps.findIndex((item) => item.id === run.currentStepId);
  const step = run.steps[index];
  const completedSteps = run.steps.filter((item) =>
    completedStatuses.has(item.status)
  ).length;
  const allStepsComplete = totalSteps > 0 && completedSteps === totalSteps;
  const active = run.status === "active" || run.status === "paused";
  const scanning =
    checking &&
    connection === "connected" &&
    run.status === "active" &&
    step?.verification.kind === "visual" &&
    step.status !== "held";
  const correction =
    active && step && !scanning ? currentCorrection(run, step) : undefined;
  const latest = step?.attempts.at(-1);
  const needsAttention =
    Boolean(correction) ||
    step?.status === "held" ||
    Boolean(
      !scanning &&
        step &&
        !completedStatuses.has(step.status) &&
        latest?.id === run.currentAttemptId &&
        latest &&
        failedOutcomes.has(latest.outcome)
    );
  const status = assistantState(
    run,
    connection,
    allStepsComplete,
    needsAttention
  );
  const clause = step?.sources
    .map((citation) =>
      [
        citation.heading || citation.section,
        citation.page === null || citation.page === undefined
          ? undefined
          : `p. ${citation.page}`,
      ]
        .filter(Boolean)
        .join(" · ")
    )
    .filter(Boolean)
    .join(" / ");
  const source = [run.sop.key, `v${run.sop.version}`, clause]
    .filter(Boolean)
    .join(" · ");
  const view: RunAssistantView = {
    active,
    allStepsComplete,
    completedSteps,
    correction,
    description: correction
      ? (correction.nextAction ?? step?.instruction ?? "")
      : (step?.instruction ?? "Review the session record for the next action."),
    source,
    status,
    step,
    stepNumber: index >= 0 ? index + 1 : totalSteps,
    title: correction?.message ?? step?.title ?? "Session recorded",
    totalSteps,
    verificationLabel: undefined,
    verificationStatus: undefined,
  };
  if (step) {
    const verification = stepVerification(step, scanning, run.currentAttemptId);
    view.verificationStatus = verification.status;
    view.verificationLabel = verification.label;
  }
  if (run.status === "complete") {
    view.title = "Session complete";
    view.description =
      "Open the service report to review the recorded work, evidence and exceptions.";
    view.verificationStatus = undefined;
    view.verificationLabel = undefined;
  } else if (!active) {
    view.title = "Session recorded";
    view.description =
      "Open the report to review the work, evidence and unresolved issues.";
    view.verificationStatus = undefined;
    view.verificationLabel = undefined;
  } else if (
    !step &&
    run.steps.some((item) => item.status === "demo_assumed")
  ) {
    view.title = "Demo steps finished";
    view.description =
      "Assumed steps are not verified. Use Problem / close to review closure options.";
    view.verificationStatus = "not_evidenced";
    view.verificationLabel = "Demo assumptions recorded";
  } else if (allStepsComplete) {
    view.title = "All required steps recorded";
    view.description =
      "Complete the session to generate your service report. Keep unresolved issues visible.";
    view.verificationStatus = "pending";
    view.verificationLabel = "Awaiting session close";
  }
  return view;
}
