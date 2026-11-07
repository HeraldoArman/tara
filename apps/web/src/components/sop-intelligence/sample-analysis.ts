import type { SopAnalysis } from "./types";

// Curated presentation data. These suggestions are not verification results.
export const sampleAnalysis: SopAnalysis = {
  document: {
    format: "TXT",
    id: "sample-kbd-01",
    name: "SOP-KBD-01.txt",
    origin: "sample",
    pageCount: null,
    sections: [
      {
        heading: "1.1 Identify the device",
        id: "identify",
        page: null,
        text: "Read the model on the underside of the keyboard. Match the model to the assigned work order and record the affected key as E before beginning service.",
      },
      {
        heading: "1.2 Prepare the work area",
        id: "prepare",
        page: null,
        text: "Disconnect the USB cable and switch off wireless power. Place the keyboard on an ESD-safe work surface. The technician must confirm that power is isolated before opening the device.",
      },
      {
        heading: "2.1 Check tools and parts",
        id: "tools",
        page: null,
        text: "Check that a keycap puller, switch puller, and compatible replacement switch are present. Confirm that the replacement matches the approved switch specification.",
      },
      {
        heading: "2.2 Remove the keycap",
        id: "remove",
        page: null,
        text: "Position the keycap puller around the faulty E key. Pull straight upward with controlled force. Stop and consult a supervisor if the keycap does not release easily.",
      },
      {
        heading: "2.3 Inspect the faulty switch",
        id: "inspect",
        page: null,
        text: "With the keycap removed, inspect the exposed switch housing. Bring the complete switch into clear view and check for visible damage, debris, or a displaced housing before continuing.",
      },
      {
        heading: "2.4 Install the replacement",
        id: "install",
        page: null,
        text: "Remove the faulty switch using the switch puller. Align the replacement pins with the hot-swap socket and seat the switch without force. Inspect that the housing sits flush with the plate.",
      },
      {
        heading: "3.1 Record the functional test",
        id: "test",
        page: null,
        text: "Reconnect the keyboard and open the key tester. Press the E key ten times. Record whether each press registers exactly once and attach the test result to the work order.",
      },
      {
        heading: "3.2 Review and release",
        id: "approve",
        page: null,
        text: "A supervisor must review the service record, confirm that the functional test passed, and approve the keyboard for return to the customer. Record the approver’s name and the completion date.",
      },
    ],
    size: 0,
    title: "Keyboard switch replacement",
  },
  opportunities: [
    {
      capabilities: ["OCR", "Record matching"],
      category: "ai-assisted",
      id: "identify",
      reason:
        "tara can read the device label and help compare its model with the work order. The technician confirms the match before starting.",
      sectionId: "identify",
      title: "Match the device to the work order",
    },
    {
      capabilities: ["Technician confirmation"],
      category: "human-performed",
      id: "prepare",
      reason:
        "Power isolation and ESD protection require a physical check. A camera view alone cannot establish that the equipment is safe to service.",
      sectionId: "prepare",
      title: "Confirm a safe work area",
    },
    {
      capabilities: ["Computer vision", "Guided checklist"],
      category: "ai-assisted",
      id: "tools",
      reason:
        "tara can help identify visible tools and guide the parts check. The technician still confirms switch compatibility against the specification.",
      sectionId: "tools",
      title: "Check the required tools and parts",
    },
    {
      capabilities: ["Physical handling"],
      category: "human-performed",
      id: "remove",
      reason:
        "Removing the keycap requires controlled force and tactile feedback. The technician must perform this step and judge any resistance.",
      sectionId: "remove",
      title: "Remove the keycap with care",
    },
    {
      capabilities: ["Computer vision", "Visual checkpoint"],
      category: "ai-verified",
      id: "inspect",
      reason:
        "The exposed housing provides an observable checkpoint. tara can help check for visible damage or debris when the camera view is clear.",
      sectionId: "inspect",
      title: "Inspect the exposed switch",
    },
    {
      capabilities: ["Computer vision", "Contextual guidance"],
      category: "ai-assisted",
      id: "install",
      reason:
        "The technician installs the switch. tara can guide alignment and help check that the housing appears flush, while seating force remains a human judgment.",
      sectionId: "install",
      title: "Guide installation and check alignment",
    },
    {
      capabilities: ["OCR", "Record assistance"],
      category: "ai-assisted",
      id: "test",
      reason:
        "tara can help capture the visible test result and prepare the service record. The technician performs the key presses and confirms the result.",
      sectionId: "test",
      title: "Capture the functional test result",
    },
    {
      capabilities: ["Supervisor sign-off"],
      category: "human-approval",
      id: "approve",
      reason:
        "The SOP explicitly assigns release approval to a supervisor. That decision and its accountability remain with the named approver.",
      sectionId: "approve",
      title: "Keep final release with the supervisor",
    },
  ],
};
