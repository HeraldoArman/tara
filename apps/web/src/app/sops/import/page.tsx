import { unstable_rethrow } from "next/navigation";
import { SopImport } from "@/components/tara/sops";
import { AppShell, PageHeading, PageUnavailable } from "@/components/tara/ui";
import { errorMessage } from "@/lib/api";
import type { User } from "@/lib/contracts";
import { currentUser } from "@/lib/server-api";
export default async function ImportPage() {
  let user: User;
  try {
    user = await currentUser();
  } catch (e) {
    unstable_rethrow(e);
    return <PageUnavailable message={errorMessage(e)} />;
  }
  if (!["owner", "sop_manager"].includes(user.role)) {
    return (
      <PageUnavailable message="Only an SOP manager or owner can import a procedure." />
    );
  }
  return (
    <AppShell active="/sops" user={user}>
      <PageHeading
        description="Turn an approved source into a reviewable, cited procedure."
        eyebrow="PROCEDURES / IMPORT"
        title="A source for every step."
      />
      <SopImport />
    </AppShell>
  );
}
