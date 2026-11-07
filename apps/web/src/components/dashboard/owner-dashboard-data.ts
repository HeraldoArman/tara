import type { Evaluation } from "@/lib/contracts";

export interface DashboardFilters {
  from: string;
  sopId: string;
  to: string;
}

export const initialDashboardFilters: DashboardFilters = {
  from: "",
  sopId: "",
  to: "",
};

export function evaluationQuery(filters: DashboardFilters): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      query.set(key, value);
    }
  }
  return `/evaluation/summary${query.size ? `?${query}` : ""}`;
}

/** Optional API metrics stay unavailable when absent; absence is not zero. */
export function recordedCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function formatRate(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export function runOutcomes(
  data: Pick<Evaluation, "runs" | "completed" | "partial" | "active">
) {
  return [
    { key: "completed", label: "Complete", value: data.completed },
    { key: "active", label: "Active or paused", value: data.active },
    { key: "partial", label: "Partial", value: data.partial },
    {
      key: "other",
      label: "Other statuses",
      value: Math.max(
        0,
        data.runs - data.completed - data.active - data.partial
      ),
    },
  ];
}

export interface RecordedStepMetric {
  attempts: number;
  firstPass: number;
  held: number;
  runs: number;
  stepId: string;
}

export function recordedSteps(data: Evaluation): RecordedStepMetric[] {
  const steps: RecordedStepMetric[] = [];
  for (const item of data.stepMetrics) {
    const attempts = recordedCount(item.attempts);
    const firstPass = recordedCount(item.firstPass);
    const held = recordedCount(item.held);
    const runs = recordedCount(item.runs);
    if (
      typeof item.stepId === "string" &&
      attempts !== null &&
      firstPass !== null &&
      held !== null &&
      runs !== null
    ) {
      steps.push({ attempts, firstPass, held, runs, stepId: item.stepId });
    }
  }
  return steps.sort(
    (left, right) =>
      right.held - left.held || left.stepId.localeCompare(right.stepId)
  );
}
