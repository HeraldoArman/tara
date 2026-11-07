import type { Report, ToolCall } from "./contracts";

const NOT_CAPTURED = "Tool-call history was not captured in this snapshot.";
const CAPTURE_SCOPE =
  "Calls recorded before report closure; the in-flight close call is not included.";
export function reportToolHistory(
  report: Pick<Report, "snapshot" | "toolCalls" | "toolHistoryScope">
): { captured: boolean; calls: ToolCall[]; scope: string } {
  if (report.snapshot) {
    if (!Array.isArray(report.snapshot.toolCalls)) {
      return { calls: [], captured: false, scope: NOT_CAPTURED };
    }
    return {
      calls: report.snapshot.toolCalls,
      captured: true,
      scope:
        report.snapshot.toolHistoryScope ||
        report.toolHistoryScope ||
        CAPTURE_SCOPE,
    };
  }
  if (
    Array.isArray(report.toolCalls) &&
    (report.toolCalls.length || report.toolHistoryScope)
  ) {
    return {
      calls: report.toolCalls,
      captured: true,
      scope:
        report.toolHistoryScope || "Tool-call records included in this report.",
    };
  }
  return { calls: [], captured: false, scope: NOT_CAPTURED };
}
