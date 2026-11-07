import { expect, test } from "bun:test";
import { getDashboardSummary } from "../../apps/web/src/components/dashboard/dashboard-analytics";
import {
  type DashboardDataset,
  dashboardDemoData,
  type StateCounts,
} from "../../apps/web/src/components/dashboard/dashboard-data";

const dataset: DashboardDataset = {
  records: [
    {
      active: 500,
      date: "2026-10-24",
      sopId: "a",
      stepId: "inspect",
      success: 500,
      warning: 500,
    },
    {
      active: 2,
      date: "2026-10-25",
      sopId: "a",
      stepId: "inspect",
      success: 1,
      warning: 1,
    },
    {
      active: 3,
      date: "2026-10-31",
      sopId: "a",
      stepId: "inspect",
      success: 4,
      warning: 2,
    },
    {
      active: 4,
      date: "2026-11-01",
      sopId: "a",
      stepId: "inspect",
      success: 2,
      warning: 3,
    },
    {
      active: 3,
      date: "2026-11-04",
      sopId: "a",
      stepId: "finish",
      success: 5,
      warning: 1,
    },
    {
      active: 6,
      date: "2026-11-07",
      sopId: "a",
      stepId: "inspect",
      success: 8,
      warning: 2,
    },
    {
      active: 500,
      date: "2026-11-08",
      sopId: "a",
      stepId: "inspect",
      success: 500,
      warning: 500,
    },
    {
      active: 5,
      date: "2026-10-30",
      sopId: "b",
      stepId: "inspect",
      success: 7,
      warning: 6,
    },
    {
      active: 9,
      date: "2026-11-03",
      sopId: "b",
      stepId: "inspect",
      success: 7,
      warning: 4,
    },
  ],
  sops: [
    {
      category: "Maintenance",
      code: "SOP-A",
      id: "a",
      steps: [
        { id: "inspect", title: "Inspect A" },
        { id: "finish", title: "Finish A" },
      ],
      title: "Procedure A",
      version: "1.0",
    },
    {
      category: "Maintenance",
      code: "SOP-B",
      id: "b",
      steps: [{ id: "inspect", title: "Inspect B" }],
      title: "Procedure B",
      version: "1.1",
    },
    {
      category: "Facilities",
      code: "SOP-C",
      id: "c",
      steps: [{ id: "inspect", title: "Inspect C" }],
      title: "Procedure C",
      version: "1.0",
    },
  ],
  throughDate: "2026-11-07",
  timeZone: "Asia/Jakarta",
};

function sumCounts(rows: readonly StateCounts[]): StateCounts {
  const result = { active: 0, success: 0, warning: 0 };
  for (const row of rows) {
    result.active += row.active;
    result.success += row.success;
    result.warning += row.warning;
  }
  return result;
}

test("current and previous periods include their boundaries without overlap", () => {
  const summary = getDashboardSummary(dataset, { days: 7, sopId: "all" });

  expect(summary.range).toEqual({ end: "2026-11-07", start: "2026-11-01" });
  expect(summary.previousRange).toEqual({
    end: "2026-10-31",
    start: "2026-10-25",
  });
  expect(summary.totals).toEqual({ active: 22, success: 22, warning: 10 });
  expect(summary.previousTotals).toEqual({
    active: 10,
    success: 12,
    warning: 9,
  });
  expect(summary.totalEvents).toBe(54);
  expect(summary.previousTotalEvents).toBe(31);
});

test("daily, SOP, and step breakdowns reconcile exactly with headline counts", () => {
  const summary = getDashboardSummary(dataset, { days: 7, sopId: "all" });

  expect(sumCounts(summary.daily)).toEqual(summary.totals);
  expect(sumCounts(summary.sops)).toEqual(summary.totals);
  expect(sumCounts(summary.steps)).toEqual(summary.totals);
  expect(summary.sops.reduce((total, sop) => total + sop.total, 0)).toBe(
    summary.totalEvents
  );
  expect(summary.steps.reduce((total, step) => total + step.total, 0)).toBe(
    summary.totalEvents
  );
  expect(
    summary.steps.map((step) => [step.sopId, step.stepId, step.warning])
  ).toEqual([
    ["a", "inspect", 5],
    ["b", "inspect", 4],
    ["a", "finish", 1],
    ["c", "inspect", 0],
  ]);
});

test("SOP filtering isolates current, previous, and same-named step counts", () => {
  const summary = getDashboardSummary(dataset, { days: 7, sopId: "a" });

  expect(summary.totals).toEqual({ active: 13, success: 15, warning: 6 });
  expect(summary.previousTotals).toEqual({ active: 5, success: 5, warning: 3 });
  expect(summary.sops.map((row) => row.sop.id)).toEqual(["a"]);
  expect(summary.steps.map((row) => row.title)).toEqual([
    "Inspect A",
    "Finish A",
  ]);
  expect(sumCounts(summary.daily)).toEqual(summary.totals);
  expect(dataset.records[3]?.active).toBe(4);
});

test("missing days and an SOP with no events retain zero buckets and metadata", () => {
  const all = getDashboardSummary(dataset, { days: 7, sopId: "all" });
  expect(all.daily).toHaveLength(7);
  expect(all.daily.find((point) => point.date === "2026-11-02")).toEqual({
    active: 0,
    date: "2026-11-02",
    success: 0,
    warning: 0,
  });

  const empty = getDashboardSummary(dataset, { days: 7, sopId: "c" });
  expect(empty.totalEvents).toBe(0);
  expect(empty.previousTotalEvents).toBe(0);
  expect(empty.daily).toHaveLength(7);
  expect(
    empty.daily.every(
      (point) => point.active + point.success + point.warning === 0
    )
  ).toBe(true);
  expect(empty.sops[0]?.sop.title).toBe("Procedure C");
  expect(empty.steps[0]?.title).toBe("Inspect C");
  expect(empty.steps[0]?.total).toBe(0);
});

test("empty datasets and unknown SOP selections do not fall back to all events", () => {
  const empty = getDashboardSummary(
    { ...dataset, records: [], sops: [] },
    { days: 7, sopId: "all" }
  );
  const unknown = getDashboardSummary(dataset, { days: 7, sopId: "missing" });

  for (const summary of [empty, unknown]) {
    expect(summary.totalEvents).toBe(0);
    expect(summary.previousTotalEvents).toBe(0);
    expect(summary.sops).toEqual([]);
    expect(summary.steps).toEqual([]);
    expect(summary.daily).toHaveLength(7);
  }
});

test("calendar ranges cross month and leap-day boundaries without locale drift", () => {
  const month = getDashboardSummary(dataset, { days: 30, sopId: "all" });
  expect(month.range).toEqual({ end: "2026-11-07", start: "2026-10-09" });
  expect(month.previousRange).toEqual({
    end: "2026-10-08",
    start: "2026-09-09",
  });
  expect(month.daily).toHaveLength(30);

  const leap = getDashboardSummary(
    { ...dataset, throughDate: "2024-03-01" },
    { days: 7, sopId: "all" }
  );
  expect(leap.daily.map((point) => point.date)).toEqual([
    "2024-02-24",
    "2024-02-25",
    "2024-02-26",
    "2024-02-27",
    "2024-02-28",
    "2024-02-29",
    "2024-03-01",
  ]);
});

test("the fixed demo covers both 30-day periods and keeps its fifth SOP empty", () => {
  const dates = [
    ...new Set(dashboardDemoData.records.map((record) => record.date)),
  ].sort();
  expect(dates).toHaveLength(60);
  expect(dates[0]).toBe("2026-09-09");
  expect(dates.at(-1)).toBe("2026-11-07");
  expect(dashboardDemoData.timeZone).toBe("Asia/Jakarta");
  expect(dashboardDemoData.sops).toHaveLength(5);
  expect(
    dashboardDemoData.records.some((row) => row.sopId === "fire-panel")
  ).toBe(false);

  for (const days of [7, 14, 30] as const) {
    const summary = getDashboardSummary(dashboardDemoData, {
      days,
      sopId: "all",
    });
    expect(summary.daily).toHaveLength(days);
    expect(summary.totalEvents).toBeGreaterThan(0);
    expect(summary.previousTotalEvents).toBeGreaterThan(0);
    expect(sumCounts(summary.sops)).toEqual(summary.totals);
    expect(sumCounts(summary.daily)).toEqual(summary.totals);
    expect(sumCounts(summary.steps)).toEqual(summary.totals);
  }
});
