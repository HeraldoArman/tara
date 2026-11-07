import type {
  DashboardDataset,
  DashboardSop,
  StateCounts,
} from "./dashboard-data";

export type DashboardPeriod = 7 | 14 | 30;

export interface DashboardSopSummary extends StateCounts {
  sop: DashboardSop;
  total: number;
}

export interface DashboardStepSummary extends StateCounts {
  sopId: string;
  stepId: string;
  stepNumber: number;
  title: string;
  total: number;
}

export interface DashboardDailyPoint extends StateCounts {
  date: string;
}

export interface DashboardSummary {
  daily: DashboardDailyPoint[];
  previousRange: { end: string; start: string };
  previousTotalEvents: number;
  previousTotals: StateCounts;
  range: { end: string; start: string };
  sops: DashboardSopSummary[];
  steps: DashboardStepSummary[];
  totalEvents: number;
  totals: StateCounts;
}

const MILLISECONDS_PER_DAY = 86_400_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const numberFormatter = new Intl.NumberFormat("en-US");

function dateTimestamp(value: string): number {
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (
    !(DATE_ONLY.test(value) && Number.isFinite(timestamp)) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Dashboard dates must be valid YYYY-MM-DD calendar dates.");
  }
  return timestamp;
}

function dateOffset(value: string, offset: number): string {
  return new Date(dateTimestamp(value) + offset * MILLISECONDS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

function emptyCounts(): StateCounts {
  return { active: 0, success: 0, warning: 0 };
}

function addCounts(target: StateCounts, source: StateCounts): void {
  target.active += source.active;
  target.success += source.success;
  target.warning += source.warning;
}

function countEvents(counts: StateCounts): number {
  return counts.active + counts.warning + counts.success;
}

export function formatDashboardDate(value: string): string {
  return dateFormatter.format(dateTimestamp(value));
}

export function formatDashboardNumber(value: number): string {
  return numberFormatter.format(value);
}

/** Date keys are already bucketed in dataset.timeZone; UTC arithmetic preserves those civil dates. */
export function getDashboardSummary(
  dataset: DashboardDataset,
  { days, sopId }: { days: DashboardPeriod; sopId: string }
): DashboardSummary {
  const range = {
    end: dataset.throughDate,
    start: dateOffset(dataset.throughDate, 1 - days),
  };
  const previousRange = {
    end: dateOffset(range.start, -1),
    start: dateOffset(range.start, -days),
  };
  const daily: DashboardDailyPoint[] = Array.from(
    { length: days },
    (_, index) => ({
      ...emptyCounts(),
      date: dateOffset(range.start, index),
    })
  );
  const byDate = new Map(daily.map((point) => [point.date, point]));
  const sops = dataset.sops
    .filter((sop) => sopId === "all" || sop.id === sopId)
    .map((sop) => ({ ...emptyCounts(), sop, total: 0 }));
  const bySop = new Map(sops.map((summary) => [summary.sop.id, summary]));
  const steps = sops.flatMap(({ sop }) =>
    sop.steps.map((step, index) => ({
      ...emptyCounts(),
      sopId: sop.id,
      stepId: step.id,
      stepNumber: index + 1,
      title: step.title,
      total: 0,
    }))
  );
  const byStep = new Map(
    steps.map((step) => [`${step.sopId}/${step.stepId}`, step])
  );
  const totals = emptyCounts();
  const previousTotals = emptyCounts();

  for (const record of dataset.records) {
    const sop = bySop.get(record.sopId);
    const step = byStep.get(`${record.sopId}/${record.stepId}`);
    if (!(sop && step)) {
      continue;
    }
    const point = byDate.get(record.date);
    if (point) {
      addCounts(totals, record);
      addCounts(point, record);
      addCounts(sop, record);
      addCounts(step, record);
      const total = countEvents(record);
      sop.total += total;
      step.total += total;
    } else if (
      record.date >= previousRange.start &&
      record.date <= previousRange.end
    ) {
      addCounts(previousTotals, record);
    }
  }

  return {
    daily,
    previousRange,
    previousTotalEvents: countEvents(previousTotals),
    previousTotals,
    range,
    sops,
    steps: steps.sort(
      (left, right) =>
        right.warning - left.warning ||
        right.total - left.total ||
        left.sopId.localeCompare(right.sopId) ||
        left.stepNumber - right.stepNumber
    ),
    totalEvents: countEvents(totals),
    totals,
  };
}
