import { ClipboardCheck, Clock3, FileCheck2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";
import { Readiness, RecentReports, WorkQueue } from "@/components/tara/queue";
import { AppShell, PageHeading, PageUnavailable } from "@/components/tara/ui";
import { errorMessage } from "@/lib/api";
import type { List, Report, Sop, User, WorkOrder } from "@/lib/contracts";
import { currentUser, serverApi } from "@/lib/server-api";
export default async function QueuePage() {
  let data: {
    user: User;
    orders: List<WorkOrder>;
    reports: List<Report>;
    sops: List<Sop>;
  };
  try {
    const user = await currentUser();
    if (user.role === "sop_manager") {
      redirect("/sops");
    }
    const [orders, reports, sops] = await Promise.all([
      serverApi<List<WorkOrder>>("/work-orders"),
      serverApi<List<Report>>("/reports"),
      serverApi<List<Sop>>("/sops"),
    ]);
    data = { orders, reports, sops, user };
  } catch (e) {
    unstable_rethrow(e);
    return <PageUnavailable message={errorMessage(e)} />;
  }
  const { user, orders, reports, sops } = data;
  const [firstName] = user.name.split(" ");
  const totalMinutes = orders.items.reduce(
    (total, item) => total + item.estimatedMinutes,
    0
  );
  return (
    <AppShell active="/" user={user}>
      <PageHeading
        description={`${orders.items.length} assigned jobs. Follow the procedure, keep the evidence, and move forward with confidence.`}
        eyebrow="WORKSPACE / TODAY"
        title={`Good to see you, ${firstName}.`}
      >
        {user.role === "owner" ? (
          <Link className="button primary" href="/work-orders/new">
            Create job
          </Link>
        ) : null}
      </PageHeading>
      <div className="metrics-row">
        {[
          {
            icon: ClipboardCheck,
            label: "Assigned jobs",
            value: orders.items.length,
          },
          {
            icon: FileCheck2,
            label: "Complete reports",
            value: reports.items.filter(
              (report) => report.outcome === "complete"
            ).length,
          },
          {
            icon: Clock3,
            label: "Estimated queue time",
            value: `${totalMinutes} min`,
          },
          {
            icon: ShieldAlert,
            label: "Partial reports",
            value: reports.items.filter(
              (report) => report.outcome === "partial"
            ).length,
          },
        ].map(({ icon: Icon, value, label }) => (
          <div className="metric" key={label}>
            <Icon size={19} />
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <div>
          <WorkQueue items={orders.items} role={user.role} userId={user.id} />
        </div>
        <aside className="dashboard-rail">
          <Readiness
            publishedCount={sops.items.reduce(
              (count, sop) =>
                count +
                sop.versions.filter((version) => version.status === "published")
                  .length,
              0
            )}
          />
          <RecentReports items={reports.items} />
          <div className="quiet-card">
            <span className="eyebrow">A QUIETER WAY TO WORK</span>
            <h3>Good work needs no interruption.</h3>
            <p>
              TARa stays silent during correct execution. Ask for help whenever
              you need it.
            </p>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
