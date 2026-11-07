import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { SopWorkspace } from "@/components/sop-intelligence/sop-workspace";
import type { SavedSopVersion } from "@/components/sop-intelligence/types";
import { PageUnavailable } from "@/components/tara/ui";
import { errorMessage } from "@/lib/api";
import type { List, Sop, User } from "@/lib/contracts";
import { currentUser, serverApi } from "@/lib/server-api";

export const metadata: Metadata = {
  description:
    "Explore SOP documents and discover opportunities for AI assistance with TARA.",
  title: "SOP Intelligence · TARA",
};

export default async function SopIntelligencePage({
  searchParams,
}: {
  searchParams: Promise<{ sopVersionId?: string | string[] }>;
}) {
  let user: User;
  let versions: SavedSopVersion[];
  let initialVersionId = "";
  try {
    user = await currentUser();
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
    return <PageUnavailable message={errorMessage(cause)} />;
  }
  return (
    <SopWorkspace
      initialVersionId={initialVersionId}
      initialVersions={versions}
      role={user.role}
    />
  );
}
