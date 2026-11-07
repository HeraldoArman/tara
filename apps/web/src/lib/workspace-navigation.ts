import type { User } from "./contracts";

export function workspaceSection(
  role: User["role"],
  pathname: string,
  hash = ""
) {
  if (pathname === "/sops" || pathname.startsWith("/sops/")) {
    return "sops";
  }
  if (pathname === "/sop-intelligence") {
    return "intelligence";
  }
  if (pathname === "/reports" || pathname.startsWith("/reports/")) {
    return "reports";
  }
  if (pathname === "/evaluation") {
    return "evaluation";
  }
  if (pathname.startsWith("/work-orders/") || pathname === "/") {
    return role === "sop_manager" ? "sops" : "queue";
  }
  if (pathname === "/dashboard") {
    if (hash === "#work-queue") {
      return "queue";
    }
    if (hash === "#sop-breakdown") {
      return "activity";
    }
    return "overview";
  }
  return "";
}
