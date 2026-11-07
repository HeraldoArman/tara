import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { SopEditor } from "@/components/tara/sops";
import { AppShell, PageHeading, PageUnavailable } from "@/components/tara/ui";
import { errorMessage } from "@/lib/api";
import type { SopVersion, User } from "@/lib/contracts";
import { currentUser, serverApi } from "@/lib/server-api";
export default async function VersionPage({
  params,
}: {
  params: Promise<{ id: string; version: string }>;
}) {
  const { id, version } = await params;
  let data: { user: User; sop: SopVersion };
  try {
    const user = await currentUser();
    const sop = await serverApi<SopVersion>(
      `/sops/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`
    );
    data = { sop, user };
  } catch (e) {
    unstable_rethrow(e);
    return <PageUnavailable message={errorMessage(e)} />;
  }
  return (
    <AppShell active="/sops" user={data.user}>
      <PageHeading
        description={`Controlled version ${data.sop.version}. Every execution remains pinned to its published definition.`}
        eyebrow={`PROCEDURES / ${data.sop.key ?? "VERSION"}`}
        title={data.sop.title}
      >
        {data.user.role === "owner" && data.sop.status === "published" ? (
          <Link
            className="button primary"
            href={`/work-orders/new?sopVersionId=${encodeURIComponent(data.sop.id)}`}
          >
            Create job from this SOP
          </Link>
        ) : null}
      </PageHeading>
      <SopEditor
        canEdit={["owner", "sop_manager"].includes(data.user.role)}
        initialVersion={data.sop}
      />
    </AppShell>
  );
}
