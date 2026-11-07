import "@tara/ui/assistant.css";
import "@/components/dashboard/dashboard.css";
import "@/components/dashboard/owner-dashboard.css";

import { ArrowUpRight, BookOpen, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ManagementDashboard } from "@/components/dashboard/management-dashboard";
import { RecentReports, WorkQueue } from "@/components/tara/queue";
import { PageUnavailable } from "@/components/tara/ui";
import { errorMessage } from "@/lib/api";
import type { Evaluation, List, Report, Sop, WorkOrder } from "@/lib/contracts";
import { currentUser, serverApi } from "@/lib/server-api";

export const metadata: Metadata = {
  description:
    "A clearer view of recorded SOP execution, verification, and the work that needs attention.",
  title: "Operations overview",
};

async function dashboardResource<T>(path: string) {
  try {
    return { data: await serverApi<T>(path), error: "" };
  } catch (cause) {
    unstable_rethrow(cause);
    return { data: null, error: errorMessage(cause) };
  }
}

export default async function DashboardPage() {
  try {
    const user = await currentUser();
    if (user.role !== "owner") {
      redirect(user.role === "sop_manager" ? "/sops" : "/");
    }
    const [evaluation, orders, reports, sops] = await Promise.all([
      dashboardResource<Evaluation>("/evaluation/summary"),
      dashboardResource<List<WorkOrder>>("/work-orders"),
      dashboardResource<List<Report>>("/reports"),
      dashboardResource<List<Sop>>("/sops"),
    ]);
    const procedures = sops.data?.items ?? [];
    const published = procedures.filter((sop) =>
      sop.versions.some((version) => version.status === "published")
    ).length;
    return (
      <DashboardShell user={user}>
        <div className="dash-hero">
          <div>
            <p className="dash-eyebrow">THE BIG PICTURE</p>
            <h1>Your operations, in focus.</h1>
            <p className="dash-intro">
              See the work taking shape, the checkpoints being verified, and
              where your team needs a little support.
            </p>
          </div>
          <div className="ops-hero-actions">
            <Link className="button primary" href="/sops">
              <BookOpen aria-hidden="true" size={16} />
              Review SOPs
            </Link>
            <Link className="button" href="/work-orders/new">
              <Plus aria-hidden="true" size={16} />
              Create job
            </Link>
          </div>
        </div>
        {sops.error ? (
          <div className="ops-error" role="alert">
            <p>Procedure list unavailable. {sops.error}</p>
          </div>
        ) : null}
        <ManagementDashboard
          initialError={evaluation.error}
          initialSummary={evaluation.data}
          sops={procedures}
        />
        <section
          aria-labelledby="ops-work-heading"
          className="ops-work-section"
          id="work-queue"
        >
          <div className="ops-section-heading">
            <div>
              <p className="dash-eyebrow">FROM OVERVIEW TO ACTION</p>
              <h2 id="ops-work-heading">Keep work moving.</h2>
            </div>
            <span>
              All assignments and recent reports · independent of analytics
              filters
            </span>
          </div>
          <div className="ops-work-grid">
            <div>
              {orders.data ? (
                <WorkQueue
                  items={orders.data.items}
                  role={user.role}
                  userId={user.id}
                />
              ) : (
                <div className="ops-error" role="alert">
                  <p>Work queue unavailable. {orders.error}</p>
                </div>
              )}
            </div>
            <aside className="ops-work-rail">
              <div className="ops-library-card">
                <BookOpen aria-hidden="true" size={21} />
                <p className="dash-eyebrow">YOUR SOURCE OF TRUTH</p>
                <h3>
                  {sops.data
                    ? `${published} published procedures`
                    : "Procedure library"}
                </h3>
                <p>
                  Keep approved instructions close to the work. Review workflows
                  and their original sources in your library.
                </p>
                <Link className="dash-text-action" href="/sops">
                  Open SOP library <ArrowUpRight aria-hidden="true" />
                </Link>
              </div>
              {reports.data ? (
                <RecentReports items={reports.data.items} />
              ) : (
                <div className="ops-error" role="alert">
                  <p>Recent reports unavailable. {reports.error}</p>
                </div>
              )}
            </aside>
          </div>
        </section>
      </DashboardShell>
    );
  } catch (cause) {
    unstable_rethrow(cause);
    return <PageUnavailable message={errorMessage(cause)} />;
  }
}
