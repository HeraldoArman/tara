import { unstable_rethrow } from "next/navigation";
import { RunRecordDetail } from "@/components/tara/run-records";
import { AppShell, PageHeading, PageUnavailable } from "@/components/tara/ui";
import { errorMessage } from "@/lib/api";
import type { Run, User } from "@/lib/contracts";
import { currentUser, serverApi } from "@/lib/server-api";

export default async function RunRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let data: { user: User; run: Run };
  try {
    const user = await currentUser();
    const run = await serverApi<Run>(`/runs/${encodeURIComponent(id)}`);
    data = { run, user };
  } catch (cause) {
    unstable_rethrow(cause);
    return <PageUnavailable message={errorMessage(cause)} />;
  }
  return (
    <AppShell active="/reports" user={data.user}>
      <PageHeading
        description={`${data.run.sop.title} · v${data.run.sop.version}`}
        eyebrow={`SESSION RECORD / ${data.run.workOrder.reference}`}
        title={data.run.workOrder.title}
      />
      <RunRecordDetail run={data.run} user={data.user} />
    </AppShell>
  );
}
