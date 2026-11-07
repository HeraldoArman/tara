/** Presentation view models; backend execution DTOs remain application-owned. */
export type AssistantState = "sleep" | "active" | "warning" | "success";

export type AssistantMode = "demo" | "product";

export type AssistantStateSelection = "auto" | AssistantState;

export type CameraSource = "simulated" | "webcam";

/** Execution results come from the verification engine, never visual previews. */
export type VerificationStatus =
  | "pending"
  | "in_progress"
  | "verified"
  | "not_evidenced"
  | "contradicted"
  | "needs_verification"
  | "blocked"
  | "requires_approval";

export const assistantStates = {
  active: { description: "Right here with you.", label: "Active" },
  sleep: { description: "Here when you need me.", label: "Sleep" },
  success: { description: "Looking good. One step closer.", label: "Success" },
  warning: { description: "Let’s resolve this together.", label: "Warning" },
} satisfies Record<AssistantState, { label: string; description: string }>;

export const verificationLabels = {
  blocked: "Step blocked",
  contradicted: "Mismatch detected",
  in_progress: "In progress",
  needs_verification: "Awaiting verification",
  not_evidenced: "More evidence needed",
  pending: "Not started",
  requires_approval: "Approval required",
  verified: "Verified",
} satisfies Record<VerificationStatus, string>;
