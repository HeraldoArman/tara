import { expect, test } from "bun:test";
import { getDashboardSummary } from "../../apps/web/src/components/dashboard/dashboard-analytics";
import type { DashboardDataset } from "../../apps/web/src/components/dashboard/dashboard-data";
import {
  createSummaryCsv,
  formatChange,
} from "../../apps/web/src/components/dashboard/dashboard-format";

test("CSV exports only the selected SOP and period with truthful metadata and safe spreadsheet cells", () => {
  const dataset: DashboardDataset = {
    records: [
      {
        active: 50,
        date: "2026-10-31",
        sopId: "selected",
        stepId: "inspect",
        success: 50,
        warning: 50,
      },
      {
        active: 2,
        date: "2026-11-01",
        sopId: "selected",
        stepId: "inspect",
        success: 3,
        warning: 1,
      },
      {
        active: 4,
        date: "2026-11-07",
        sopId: "selected",
        stepId: "inspect",
        success: 1,
        warning: 2,
      },
      {
        active: 90,
        date: "2026-11-07",
        sopId: "other",
        stepId: "inspect",
        success: 90,
        warning: 90,
      },
    ],
    sops: [
      {
        category: "Maintenance",
        code: "+SOP-01",
        id: "selected",
        steps: [{ id: "inspect", title: "Inspect" }],
        title: '=HYPERLINK("https://example.test","Pump, A")',
        version: "@1.4",
      },
      {
        category: "Facilities",
        code: "SOP-02",
        id: "other",
        steps: [{ id: "inspect", title: "Inspect" }],
        title: "Other procedure",
        version: "1.0",
      },
    ],
    throughDate: "2026-11-07",
    timeZone: "Asia/Jakarta",
  };
  const summary = getDashboardSummary(dataset, { days: 7, sopId: "selected" });
  const csv = createSummaryCsv(summary.sops, summary.range, dataset.timeZone);

  expect(summary.totals).toEqual({ active: 6, success: 4, warning: 3 });
  expect(summary.totalEvents).toBe(13);
  expect(csv).toBe(
    [
      '"Data source","Period start","Period end","Time zone","SOP","Procedure","Version","Active","Warning","Success","Total"',
      '"Demo data","2026-11-01","2026-11-07","Asia/Jakarta","\'+SOP-01","\'=HYPERLINK(""https://example.test"",""Pump, A"")","\'@1.4","6","3","4","13"',
    ].join("\r\n")
  );
  expect(csv).not.toContain("Other procedure");
  expect(csv).not.toContain("2026-10-31");
});

test("period change handles a zero baseline and compares equal-period counts without infinity", () => {
  expect(formatChange(0, 0)).toBe("No change");
  expect(formatChange(12, 0)).toBe("New activity");
  expect(formatChange(12, 12)).toBe("No change");
  expect(formatChange(15, 12)).toBe("+25.0%");
  expect(formatChange(9, 12)).toBe("-25.0%");
  expect(formatChange(0, 12)).toBe("-100.0%");
});
