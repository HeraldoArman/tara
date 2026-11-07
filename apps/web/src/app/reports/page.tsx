import { unstable_rethrow } from "next/navigation";
import { ReportList } from "@/components/tara/reports";
import { RunRecordList } from "@/components/tara/run-records";
import { AppShell, PageHeading, PageUnavailable } from "@/components/tara/ui";
import { errorMessage } from "@/lib/api";
import type { List, Report, RunRecordPage, User } from "@/lib/contracts";
import { currentUser, serverApi } from "@/lib/server-api";
export default async function ReportsPage() {
  let data: { user: User; reports: List<Report>; records: RunRecordPage };
  try {
    const user = await currentUser();
    const [reports, records] = await Promise.all([
      serverApi<List<Report>>("/reports"),
      serverApi<RunRecordPage>("/run-records?limit=25&offset=0"),
    ]);
    data = { records, reports, user };
  } catch (e) {
    unstable_rethrow(e);
    return <PageUnavailable message={errorMessage(e)} />;
  }
  return (
    <AppShell active="/reports" user={data.user}>
      <PageHeading
        description="Ongoing sessions, saved camera images, and final reports from your authorized work."
        eyebrow="OPERATIONS / REPORTS"
        title="Every step leaves a record."
      />
      <RunRecordList initialPage={data.records} />
      <section aria-label="Finalized reports" className="run-records-section">
        <div className="run-records-heading">
          <div>
            <h2>Finalized reports</h2>
            <p>
              Immutable snapshots generated when a session is closed, with its
              recorded results and unresolved work.
            </p>
          </div>
        </div>
        <ReportList items={data.reports.items} />
      </section>
    </AppShell>
  );
}
