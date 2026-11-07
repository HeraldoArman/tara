import { Card, CardContent } from "@tara/ui/components/card";
import { Activity, CheckCheck, Layers, TriangleAlert } from "lucide-react";
import type { Evaluation } from "@/lib/contracts";
import { formatCount } from "./dashboard-format";
import { formatRate, recordedCount } from "./owner-dashboard-data";

export function DashboardMetrics({ summary }: { summary: Evaluation }) {
  const alerts = recordedCount(summary.alerts);
  const metrics = [
    {
      description: "Execution sessions in the selected scope",
      icon: Layers,
      label: "Recorded runs",
      state: "total",
      value: formatCount(summary.runs),
    },
    {
      description: "Runs currently active or paused",
      icon: Activity,
      label: "In progress",
      state: "active",
      value: formatCount(summary.active),
    },
    {
      description: "Recorded assistant alert outputs",
      icon: TriangleAlert,
      label: "Assistant alerts",
      state: "warning",
      value: alerts === null ? "—" : formatCount(alerts),
    },
    {
      description: "First attempts passed or human-attested",
      icon: CheckCheck,
      label: "First-pass success",
      state: "success",
      value: formatRate(summary.firstPassRate),
    },
  ];
  return (
    <section aria-label="Recorded operations" className="dash-metrics">
      {metrics.map(({ state, label, icon: Icon, value, description }) => (
        <Card className="dash-metric" data-metric={state} key={state}>
          <CardContent>
            <div className="dash-metric-heading">
              <span>{label}</span>
              <Icon aria-hidden="true" />
            </div>
            <strong className="dash-metric-value">{value}</strong>
            <p className="dash-metric-description">{description}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
