import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { SopWorkspace } from "@/components/sop-intelligence/sop-workspace";
import { PageUnavailable } from "@/components/tara/ui";
import { errorMessage } from "@/lib/api";
import type { User } from "@/lib/contracts";
import { currentUser } from "@/lib/server-api";

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
  let initialVersionId = "";
  try {
    user = await currentUser();
    const query = await searchParams;
    initialVersionId =
      typeof query.sopVersionId === "string" ? query.sopVersionId.trim() : "";
  } catch (cause) {
    unstable_rethrow(cause);
    return <PageUnavailable message={errorMessage(cause)} />;
  }
  return (
    <SopWorkspace
      initialVersionId={initialVersionId}
      key={initialVersionId}
      role={user.role}
    />
  );
}
