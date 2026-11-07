import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import {
  CreateWorkOrder,
  type PublishedProcedureOption,
} from "@/components/tara/create-work-order";
import { AppShell, PageHeading, PageUnavailable } from "@/components/tara/ui";
import { errorMessage } from "@/lib/api";
import type { List, Sop, User } from "@/lib/contracts";
import { currentUser, serverApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "Create job" };

export default async function NewWorkOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ sopVersionId?: string | string[] }>;
}) {
  let user: User;
  let assignees: User[];
  let procedures: PublishedProcedureOption[];
  let initialSopVersionId = "";
  try {
    user = await currentUser();
    if (user.role !== "owner") {
      return (
        <PageUnavailable message="Only an owner can create and assign jobs." />
      );
    }
    const [people, sops, query] = await Promise.all([
      serverApi<List<User>>("/work-orders/assignees"),
      serverApi<List<Sop>>("/sops"),
      searchParams,
    ]);
    assignees = people.items;
    procedures = sops.items.flatMap((sop) =>
      sop.versions
        .filter((version) => version.status === "published")
        .map((version) => ({
          id: version.id,
          label: `${sop.key} · ${sop.title} · v${version.version} · revision ${version.versionNumber}`,
        }))
    );
    if (
      typeof query.sopVersionId === "string" &&
      procedures.some((procedure) => procedure.id === query.sopVersionId)
    ) {
      initialSopVersionId = query.sopVersionId;
    }
  } catch (cause) {
    unstable_rethrow(cause);
    return <PageUnavailable message={errorMessage(cause)} />;
  }
  return (
    <AppShell active="/" user={user}>
      <PageHeading
        description="Choose a published procedure, describe the work, and assign it to the person who will perform it."
        eyebrow="WORKSPACE / CREATE JOB"
        title="Put the next job in their queue."
      />
      <CreateWorkOrder
        assignees={assignees}
        currentUserId={user.id}
        initialSopVersionId={initialSopVersionId}
        procedures={procedures}
      />
    </AppShell>
  );
}
