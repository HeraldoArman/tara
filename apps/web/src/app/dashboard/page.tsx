import type { Metadata } from "next";
import { dashboardDemoData } from "@/components/dashboard/dashboard-data";
import { ManagementDashboard } from "@/components/dashboard/management-dashboard";

export const metadata: Metadata = {
  description:
    "A clearer view of SOP activity, assistant state triggers, and the steps that need attention.",
  title: "Operations overview",
};

export default function DashboardPage() {
  return <ManagementDashboard data={dashboardDemoData} />;
}
