// Local presentation fixtures, not API DTOs or authoritative verification results.
export const previewTask = {
  asset: "Keychron K2",
  clause: "§2.3",
  description: "Keycap off. About 10 cm away, angled toward the light.",
  sop: "SOP-KBD-01",
  source: "SOP-KBD-01 §2.3 · v1.4",
  step: 2,
  task: "E key switch replacement",
  title: "Inspect the faulty key",
  totalSteps: 5,
  version: "v1.4",
  workOrder: "WO-1042",
} as const;

export const previewSteps = [
  {
    detail: "Confirm the device model and label before starting.",
    id: "identify",
    title: "Identify the keyboard",
  },
  {
    detail:
      "Remove the E keycap. Bring the exposed switch into clear view before requesting verification.",
    id: "inspect",
    title: "Inspect the faulty key",
  },
  {
    detail:
      "Follow the approved procedure for the identified device. Stop if the switch will not seat.",
    id: "replace",
    title: "Replace the switch",
  },
  {
    detail: "Check that each press registers once and record the result.",
    id: "test",
    title: "Test the E key",
  },
  {
    detail:
      "Review the final condition and the required evidence before closing the task.",
    id: "review",
    title: "Review and finish",
  },
] as const;

export const previewGuidance = {
  description:
    "Bring the E switch into view. Remove the keycap, move a little closer, and hold the board flat so the next check has a clear view.",
  hint: "The keyboard is a simulated feed. No visual check has been performed, and this step is still waiting for evidence.",
  title: "A little guidance.",
} as const;
