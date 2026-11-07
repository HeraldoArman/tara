import { unstable_rethrow } from "next/navigation";
import { PageUnavailable } from "@/components/tara/ui";
import { Workspace } from "@/components/tara/workspace";
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
    <Workspace
      canOperate={["technician", "owner"].includes(user.role)}
      canResolve={["supervisor", "owner"].includes(user.role)}
      initialRun={run}
    />
  );
}
