import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { SopWorkspace } from "@/components/sop-intelligence/sop-workspace";
import type { SavedSopVersion } from "@/components/sop-intelligence/types";
import { AppShell, ErrorPanel, PageUnavailable } from "@/components/tara/ui";
import { errorMessage } from "@/lib/api";
import type { List, Sop, User } from "@/lib/contracts";
import { currentUser, serverApi } from "@/lib/server-api";

export const metadata: Metadata = {
  description:
    "Explore SOP documents and discover opportunities for AI assistance with tara.",
  title: "SOP Intelligence · tara",
};

export default async function SopIntelligencePage({
  searchParams,
}: {
  searchParams: Promise<{ sopVersionId?: string | string[] }>;
}) {
  let user: User;
  try {
    user = await currentUser();
  } catch (cause) {
    unstable_rethrow(cause);
    return <PageUnavailable message={errorMessage(cause)} />;
  }
  let versions: SavedSopVersion[];
  let initialVersionId = "";
  try {
    const [sops, query] = await Promise.all([
      serverApi<List<Sop>>("/sops"),
      searchParams,
    ]);
    versions = sops.items.flatMap((sop) =>
      sop.versions.map((version) => ({
        id: version.id,
        key: sop.key,
        sopId: sop.id,
        status: version.status,
        title: sop.title,
        version: version.version,
        versionNumber: version.versionNumber,
      }))
    );
    initialVersionId =
      typeof query.sopVersionId === "string" &&
      versions.some((version) => version.id === query.sopVersionId)
        ? query.sopVersionId
        : (versions.find((version) => version.status === "published")?.id ??
          versions[0]?.id ??
          "");
  } catch (cause) {
    unstable_rethrow(cause);
    return (
      <AppShell active="/sop-intelligence" user={user}>
        <ErrorPanel message={errorMessage(cause)} />
      </AppShell>
    );
  }
  return (
    <AppShell active="/sop-intelligence" user={user}>
      <SopWorkspace
        initialVersionId={initialVersionId}
        initialVersions={versions}
        role={user.role}
      />
    </AppShell>
  );
}
