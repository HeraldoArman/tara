import { unstable_rethrow } from "next/navigation";
import { ReportDetail } from "@/components/tara/reports";
import { AppShell, PageHeading, PageUnavailable } from "@/components/tara/ui";
import { errorMessage } from "@/lib/api";
import type { Report, User } from "@/lib/contracts";
import { currentUser, serverApi } from "@/lib/server-api";
export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let data: { user: User; report: Report };
  try {
    const user = await currentUser();
    const report = await serverApi<Report>(
      `/reports/${encodeURIComponent(id)}`
    );
    data = { report, user };
  } catch (e) {
    unstable_rethrow(e);
    return <PageUnavailable message={errorMessage(e)} />;
  }
  return (
    <AppShell active="/reports" user={data.user}>
      <PageHeading
        description={`${data.report.workOrder?.asset.model ?? "Execution report"} · ${data.report.sop?.title ?? "Approved procedure"} v${data.report.sop?.version ?? ""}`}
        eyebrow={`SERVICE REPORT / ${data.report.workOrder?.reference ?? id.slice(0, 8)}`}
        title={data.report.workOrder?.title ?? "Execution report"}
      />
      <ReportDetail report={data.report} user={data.user} />
    </AppShell>
  );
}
