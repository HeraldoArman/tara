export type DashboardState = "active" | "warning" | "success";

export interface StateCounts {
  active: number;
  success: number;
  warning: number;
}

export interface DashboardSop {
  category: string;
  code: string;
  id: string;
  steps: readonly { id: string; title: string }[];
  title: string;
  version: string;
}

export interface DashboardDailyRecord extends StateCounts {
  date: string;
  sopId: string;
  stepId: string;
}

export interface DashboardDataset {
  records: readonly DashboardDailyRecord[];
  sops: readonly DashboardSop[];
  throughDate: string;
  timeZone: string;
}

const demoSops: readonly DashboardSop[] = [
  {
    category: "Equipment care",
    code: "SOP-KBD-01",
    id: "keyboard-switch",
    steps: [
      { id: "identify", title: "Identify the keyboard" },
      { id: "remove-keycap", title: "Remove the keycap" },
      { id: "replace-switch", title: "Replace the switch" },
      { id: "test-key", title: "Test the E key" },
      { id: "review", title: "Review and finish" },
    ],
    title: "Keyboard switch replacement",
    version: "1.4",
  },
  {
    category: "Maintenance",
    code: "SOP-PMP-02",
    id: "pump-inspection",
    steps: [
      { id: "prepare", title: "Prepare the inspection" },
      { id: "inspect-housing", title: "Inspect the pump housing" },
      { id: "check-seals", title: "Check the seals" },
      { id: "read-pressure", title: "Read the pressure gauge" },
      { id: "record", title: "Record the inspection" },
    ],
    title: "Pump inspection",
    version: "2.1",
  },
  {
    category: "Storage operations",
    code: "SOP-CLD-03",
    id: "cold-storage",
    steps: [
      { id: "verify-sensor", title: "Verify the temperature sensor" },
      { id: "read-temperature", title: "Record the temperature" },
      { id: "inspect-door", title: "Inspect the door seal" },
      { id: "check-stock", title: "Check stock placement" },
      { id: "record", title: "Complete the storage check" },
    ],
    title: "Cold-storage check",
    version: "1.2",
  },
  {
    category: "Fulfillment",
    code: "SOP-DSP-04",
    id: "dispatch-quality",
    steps: [
      { id: "identify-order", title: "Identify the order" },
      { id: "check-items", title: "Check the items" },
      { id: "inspect-packaging", title: "Inspect the packaging" },
      { id: "verify-label", title: "Verify the shipping label" },
      { id: "release", title: "Release the dispatch" },
    ],
    title: "Dispatch quality check",
    version: "3.0",
  },
  {
    category: "Facilities",
    code: "SOP-FIR-05",
    id: "fire-panel",
    steps: [
      { id: "identify-panel", title: "Identify the panel" },
      { id: "inspect-supply", title: "Inspect the power supply" },
      { id: "check-indicators", title: "Check panel indicators" },
      { id: "record-test", title: "Record the panel check" },
    ],
    title: "Fire-panel check",
    version: "1.0",
  },
];

const DEMO_THROUGH_DATE = "2026-11-07";
const DEMO_DAY_COUNT = 60;
const MILLISECONDS_PER_DAY = 86_400_000;
const WEEKDAY_VOLUME = [3, 7, 8, 9, 8, 10, 4] as const;

function demoCounts(
  dayIndex: number,
  sopIndex: number,
  stepIndex: number
): StateCounts {
  const weekday = new Date(
    Date.parse(`${DEMO_THROUGH_DATE}T00:00:00Z`) -
      (DEMO_DAY_COUNT - 1 - dayIndex) * MILLISECONDS_PER_DAY
  ).getUTCDay();
  const volume =
    (WEEKDAY_VOLUME[weekday] ?? 0) + sopIndex + Math.floor(dayIndex / 20);
  const success = Math.max(0, volume - (stepIndex % 3));
  const variation = (dayIndex + sopIndex * 2 + stepIndex) % 4;
  const hotspot =
    (sopIndex === 0 && stepIndex === 1) || (sopIndex === 1 && stepIndex === 2);
  const warning =
    (variation === 0 ? 1 : 0) +
    (hotspot ? 2 : 0) +
    (dayIndex < DEMO_DAY_COUNT - 14 && variation === 1 ? 1 : 0);
  return {
    active: success + warning + ((dayIndex + stepIndex) % 3),
    success,
    warning,
  };
}

function createDemoRecords(): DashboardDailyRecord[] {
  const records: DashboardDailyRecord[] = [];
  const end = Date.parse(`${DEMO_THROUGH_DATE}T00:00:00Z`);
  for (const dayIndex of Array.from(
    { length: DEMO_DAY_COUNT },
    (_, index) => index
  )) {
    const date = new Date(
      end - (DEMO_DAY_COUNT - 1 - dayIndex) * MILLISECONDS_PER_DAY
    )
      .toISOString()
      .slice(0, 10);
    // The final SOP deliberately has no sample events, to exercise the empty view.
    for (const [sopIndex, sop] of demoSops.slice(0, 4).entries()) {
      for (const [stepIndex, step] of sop.steps.entries()) {
        records.push({
          ...demoCounts(dayIndex, sopIndex, stepIndex),
          date,
          sopId: sop.id,
          stepId: step.id,
        });
      }
    }
  }
  return records;
}

/** Synthetic state-entry counts for design review; never organization telemetry. */
export const dashboardDemoData: DashboardDataset = {
  records: createDemoRecords(),
  sops: demoSops,
  throughDate: DEMO_THROUGH_DATE,
  timeZone: "Asia/Jakarta",
};
