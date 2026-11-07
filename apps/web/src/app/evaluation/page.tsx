import { unstable_rethrow } from "next/navigation";
import { EvaluationView } from "@/components/tara/evaluation";
import { AppShell, PageHeading, PageUnavailable } from "@/components/tara/ui";
import { errorMessage } from "@/lib/api";
import type { Evaluation, List, Sop, User } from "@/lib/contracts";
import { currentUser, serverApi } from "@/lib/server-api";
export default async function EvaluationPage() {
  let data: { user: User; summary: Evaluation; procedures: Sop[] };
  try {
    const user = await currentUser();
    const [summary, procedures] = await Promise.all([
      serverApi<Evaluation>("/evaluation/summary"),
      serverApi<List<Sop>>("/sops"),
    ]);
    data = { procedures: procedures.items, summary, user };
  } catch (e) {
    unstable_rethrow(e);
    return <PageUnavailable message={errorMessage(e)} />;
  }
  return (
    <AppShell active="/evaluation" user={data.user}>
      <PageHeading
        description="Understand first-pass success, evidence coverage and exceptions across your authorized operations."
        eyebrow="OPERATIONS / EVALUATION"
        title="See the work clearly."
      />
      <EvaluationView
        initialSummary={data.summary}
        ownOnly={data.user.role === "technician"}
        procedures={data.procedures}
      />
    </AppShell>
  );
}
