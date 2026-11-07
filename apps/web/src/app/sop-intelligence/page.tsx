import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { SopWorkspace } from "@/components/sop-intelligence/sop-workspace";
import { AppShell, ErrorPanel, PageUnavailable } from "@/components/tara/ui";
import { errorMessage } from "@/lib/api";
import type { User } from "@/lib/contracts";
import { currentUser } from "@/lib/server-api";

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
  let initialVersionId = "";
  try {
    const query = await searchParams;
    initialVersionId =
      typeof query.sopVersionId === "string" ? query.sopVersionId.trim() : "";
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
        key={initialVersionId}
        role={user.role}
      />
    </AppShell>
  );
}
