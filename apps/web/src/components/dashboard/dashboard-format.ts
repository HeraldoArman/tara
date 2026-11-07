import type { DashboardSopSummary } from "./dashboard-analytics";

const numberFormatter = new Intl.NumberFormat("en-US");
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});
const SPREADSHEET_FORMULA = /^[=+\-@\t\r\n]/;

export function formatCount(value: number): string {
  return numberFormatter.format(value);
}

export function formatDate(value: string): string {
  return dateFormatter.format(new Date(`${value}T12:00:00Z`));
}

export function formatChange(current: number, previous: number): string {
  if (previous === 0) {
    return current === 0 ? "No change" : "New activity";
  }
  const percent = ((current - previous) / previous) * 100;
  if (percent === 0) {
    return "No change";
  }
  return `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

function csvCell(value: string): string {
  const safeValue = SPREADSHEET_FORMULA.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

export function createSummaryCsv(
  sops: readonly DashboardSopSummary[],
  range: { start: string; end: string },
  timeZone: string
): string {
  const rows = [
    [
      "Data source",
      "Period start",
      "Period end",
      "Time zone",
      "SOP",
      "Procedure",
      "Version",
      "Active",
      "Warning",
      "Success",
      "Total",
    ],
    ...sops.map((item) => [
      "Demo data",
      range.start,
      range.end,
      timeZone,
      item.sop.code,
      item.sop.title,
      item.sop.version,
      String(item.active),
      String(item.warning),
      String(item.success),
      String(item.total),
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function downloadSummary(csv: string, filename: string): void {
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
