import { unstable_rethrow } from "next/navigation";
import { RunAssistantWorkspace } from "@/components/assistant/run-assistant-workspace";
import { PageUnavailable } from "@/components/tara/ui";
import { errorMessage } from "@/lib/api";
import type { Run, User } from "@/lib/contracts";
import { currentUser, serverApi } from "@/lib/server-api";
export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let run: Run;
  let user: User;
  try {
    user = await currentUser();
    run = await serverApi<Run>(`/runs/${encodeURIComponent(id)}`);
  } catch (e) {
    unstable_rethrow(e);
    return <PageUnavailable message={errorMessage(e)} />;
  }
  return (
    <RunAssistantWorkspace
      canOperate={
        ["technician", "owner"].includes(user.role) &&
        run.workOrder.assignedTo === user.id
      }
      canResolve={["supervisor", "owner"].includes(user.role)}
      initialRun={run}
      key={run.id}
    />
  );
}
