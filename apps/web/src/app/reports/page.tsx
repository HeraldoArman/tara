import { unstable_rethrow } from "next/navigation";
import { ReportList } from "@/components/tara/reports";
import { AppShell, PageHeading, PageUnavailable } from "@/components/tara/ui";
import { errorMessage } from "@/lib/api";
import type { List, Report, User } from "@/lib/contracts";
import { currentUser, serverApi } from "@/lib/server-api";
export default async function ReportsPage() {
  let data: { user: User; reports: List<Report> };
  try {
    const user = await currentUser();
    const reports = await serverApi<List<Report>>("/reports");
    data = { reports, user };
  } catch (e) {
    unstable_rethrow(e);
    return <PageUnavailable message={errorMessage(e)} />;
  }
  return (
    <AppShell active="/reports" user={data.user}>
      <PageHeading
        description="A truthful record of the work: what passed, what was attested, and what remains open."
        eyebrow="OPERATIONS / REPORTS"
        title="Every step leaves a record."
      />
      <ReportList items={data.reports.items} />
    </AppShell>
  );
}
