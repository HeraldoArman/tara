// Local presentation fixtures, not API DTOs or authoritative verification results.
export const INITIAL_PREVIEW_STEP_INDEX = 1;

export const previewTask = {
  asset: "Keychron K2",
  sop: "SOP-KBD-01",
  task: "E key switch replacement",
  version: "v1.4",
  workOrder: "WO-1042",
} as const;

export const previewSteps = [
  {
    clause: "§2.2",
    correction: {
      description: "Turn the device label toward the camera before continuing.",
      guidanceDescription:
        "Pause identification and bring the keyboard’s model label into view. Once the label is ready to check, return to the original identification step.",
      title: "Show the device label.",
    },
    description: "Confirm the keyboard model and the key that needs attention.",
    detail: "Confirm the device model and label before starting.",
    guidanceDescription:
      "Bring the keyboard label into view and confirm the model. Match the reported fault to the E key before moving on.",
    guidanceTitle: "Start with the right device.",
    id: "identify",
    title: "Identify the keyboard",
  },
  {
    clause: "§2.3",
    correction: {
      description:
        "Release the keycap. Use a keycap puller instead of your fingers.",
      guidanceDescription:
        "Pause the keycap removal and take your hands off the keycap. Use a keycap puller for the removal, then return to inspecting the exposed switch. This correction does not complete the inspection step.",
      title: "Put your hands away.",
    },
    description: "Keycap off. About 10 cm away, angled toward the light.",
    detail:
      "Remove the E keycap. Bring the exposed switch into clear view before requesting verification.",
    guidanceDescription:
      "Bring the E switch into view. Remove the keycap, move a little closer, and hold the board flat so the next check has a clear view.",
    guidanceTitle: "A little guidance.",
    id: "inspect",
    title: "Inspect the faulty key",
  },
  {
    clause: "§2.4",
    correction: {
      description: "Release pressure and check the switch alignment first.",
      guidanceDescription:
        "Pause installation and stop pressing the switch. Check its orientation and alignment using the approved procedure, then return to the replacement step without forcing it into place.",
      title: "Stop pressing the switch.",
    },
    description: "Align the replacement switch and check that it sits evenly.",
    detail:
      "Follow the approved procedure for the identified device. Stop if the switch will not seat.",
    guidanceDescription:
      "Follow the replacement procedure for this keyboard. Align the switch before seating it, then bring the fitted switch into view. Stop if it resists.",
    guidanceTitle: "Give the new switch a good fit.",
    id: "replace",
    title: "Replace the switch",
  },
  {
    clause: "§2.5",
    correction: {
      description: "Lift your finger, then test with separate presses.",
      guidanceDescription:
        "Pause the test and release the E key fully. Resume with separate presses so each input can be checked individually, then continue the original key test.",
      title: "Release the E key.",
    },
    description: "Press the E key and confirm that each press registers once.",
    detail: "Check that each press registers once and record the result.",
    guidanceDescription:
      "Test the E key with a few separate presses. Check for missed or repeated input and note the result before continuing.",
    guidanceTitle: "Let’s check the response.",
    id: "test",
    title: "Test the E key",
  },
  {
    clause: "§2.6",
    correction: {
      description: "Keep the task open while you check the recorded outcome.",
      guidanceDescription:
        "Pause the final review and check the recorded test outcome against the procedure. Once that check is complete, return to the original review before finishing the task.",
      title: "Review the test result first.",
    },
    description: "Review the final condition and finish the sample procedure.",
    detail:
      "Review the final condition and the required evidence before closing the task.",
    guidanceDescription:
      "Review the keyboard’s final condition and the recorded test result. Confirm the required checks are covered before finishing the procedure.",
    guidanceTitle: "One final look.",
    id: "review",
    title: "Review and finish",
  },
] as const;
