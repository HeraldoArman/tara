import { Card, CardContent } from "@tara/ui/components/card";
import { Activity, CircleCheck, Layers, TriangleAlert } from "lucide-react";
import type { StateCounts } from "./dashboard-data";
import { formatChange, formatCount } from "./dashboard-format";

interface DashboardMetricsProps {
  days: number;
  previous: StateCounts;
  totals: StateCounts;
}

export function DashboardMetrics({
  days,
  previous,
  totals,
}: DashboardMetricsProps) {
  const metrics = [
    {
      description: "Entries into the three states",
      icon: Layers,
      label: "All state triggers",
      previous: previous.active + previous.warning + previous.success,
      state: "total",
      value: totals.active + totals.warning + totals.success,
    },
    {
      description: "Observation started or resumed",
      icon: Activity,
      label: "Active",
      previous: previous.active,
      state: "active",
      value: totals.active,
    },
    {
      description: "Moments needing attention",
      icon: TriangleAlert,
      label: "Warning",
      previous: previous.warning,
      state: "warning",
      value: totals.warning,
    },
    {
      description: "Positive feedback events",
      icon: CircleCheck,
      label: "Success",
      previous: previous.success,
      state: "success",
      value: totals.success,
    },
  ];
  return (
    <section aria-label="State trigger totals" className="dash-metrics">
      {metrics.map(
        ({
          state,
          label,
          icon: Icon,
          value,
          previous: previousValue,
          description,
        }) => (
          <Card className="dash-metric" data-metric={state} key={state}>
            <CardContent>
              <div className="dash-metric-heading">
                <span>{label}</span>
                <Icon aria-hidden="true" />
              </div>
              <strong className="dash-metric-value">
                {formatCount(value)}
              </strong>
              <p className="dash-metric-description">{description}</p>
              <p className="dash-metric-change">
                <span>{formatChange(value, previousValue)}</span>vs previous{" "}
                {days} days
              </p>
            </CardContent>
          </Card>
        )
      )}
    </section>
  );
}
