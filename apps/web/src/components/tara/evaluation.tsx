"use client";
import {
  Activity,
  CheckCheck,
  ClipboardCheck,
  ScanLine,
  ShieldAlert,
} from "lucide-react";
import { useState } from "react";
import { api, duration, errorMessage, humanize } from "@/lib/api";
import type { Evaluation, Sop, TechnicianMetric } from "@/lib/contracts";
export function EvaluationView({
  initialSummary,
  ownOnly = false,
  procedures,
}: {
  initialSummary: Evaluation;
  ownOnly?: boolean;
  procedures: Sop[];
}) {
  const [data, setData] = useState(initialSummary);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const filter = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const query = new URLSearchParams();
    for (const [key, value] of form) {
      if (String(value).trim()) {
        query.set(key, String(value));
      }
    }
    try {
      setData(await api<Evaluation>(`/evaluation/summary?${query}`));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const percent = (value: unknown) =>
    typeof value === "number"
      ? `${(value <= 1 ? value * 100 : value).toFixed(1)}%`
      : "—";
  const metrics = [
    {
      icon: ClipboardCheck,
      label: "Recorded runs",
      value: data.totalRuns ?? data.runs ?? 0,
    },
    {
      icon: CheckCheck,
      label: "Complete runs",
      value: data.completedRuns ?? data.completed ?? 0,
    },
    {
      icon: ShieldAlert,
      label: "Partial runs",
      value: data.partialRuns ?? data.partial ?? 0,
    },
    {
      icon: Activity,
      label: "First-pass success",
      value: percent(data.firstPassRate),
    },
    {
      icon: ScanLine,
      label: "Evidence coverage",
      value: percent(data.evidenceCoverage),
    },
  ];
  const tables = [
    {
      columns: [
        { key: "stepId", label: "Step" },
        { key: "runs", label: "Runs" },
        { key: "attempts", label: "Attempts" },
        { key: "firstPass", label: "Passed first time" },
        { key: "held", label: "Held" },
      ],
      description: "Attempts, completion and retakes by procedure step.",
      key: "stepMetrics",
      title: "Success by step",
    },
    {
      columns: [
        { key: "criterionId", label: "Criterion" },
        { key: "count", label: "Failed checks" },
      ],
      description: "Where visual checks need attention.",
      key: "criterionFailures",
      title: "Criterion failures",
    },
    {
      description: "Performance within your authorized scope.",
      key: "technicianMetrics",
      title: "Technician outcomes",
    },
    {
      columns: [
        { key: "tool", label: "Tool" },
        { key: "durationMs", label: "Response time" },
        { key: "status", label: "Status" },
      ],
      description: "Measured model and tool response times.",
      key: "latency",
      title: "Service latency",
    },
  ];
  return (
    <>
      <form className="evaluation-filters panel" onSubmit={filter}>
        <div>
          <label htmlFor="filter-sop">Procedure</label>
          <select id="filter-sop" name="sopId">
            <option value="">All procedures</option>
            {procedures.map((procedure) => (
              <option key={procedure.id} value={procedure.id}>
                {procedure.key} · {procedure.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-tech">Technician</label>
          <select disabled={ownOnly} id="filter-tech" name="technicianId">
            <option value="">
              {ownOnly ? "Your own run history" : "All authorized technicians"}
            </option>
            {initialSummary.technicianMetrics.map(
              (technician: TechnicianMetric) => (
                <option
                  key={technician.technicianId}
                  value={technician.technicianId}
                >
                  {technician.technicianName}
                </option>
              )
            )}
          </select>
        </div>
        <div>
          <label htmlFor="filter-from">From</label>
          <input id="filter-from" name="from" type="date" />
        </div>
        <div>
          <label htmlFor="filter-to">To</label>
          <input id="filter-to" name="to" type="date" />
        </div>
        <button className="button primary" disabled={busy} type="submit">
          {busy ? "Applying…" : "Apply filters"}
        </button>
      </form>
      {error ? (
        <div className="notice danger" role="alert">
          {error}
        </div>
      ) : null}
      <div className="metrics-row evaluation-metrics">
        {metrics.map(({ icon: Icon, label, value }) => (
          <div className="metric" key={label}>
            <Icon size={19} />
            <strong>{String(value)}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="evaluation-grid">
        {tables.map((table) => (
          <section className="panel" key={table.key}>
            <header className="panel-head">
              <div>
                <h2>{table.title}</h2>
                <p>{table.description}</p>
              </div>
            </header>
            {table.key === "technicianMetrics" ? (
              <TechnicianOutcomes metrics={data.technicianMetrics ?? []} />
            ) : (
              <MetricTable
                columns={table.columns ?? []}
                title={table.title}
                value={data[table.key]}
              />
            )}
          </section>
        ))}
      </div>
      <p className="subtle-note">
        Evidence coverage, exceptions and first-pass success are separate
        measures. These values come from recorded execution data.
      </p>
    </>
  );
}
function TechnicianOutcomes({ metrics }: { metrics: TechnicianMetric[] }) {
  if (!metrics.length) {
    return <p className="inline-empty">No matching technician run history.</p>;
  }
  return (
    <div className="table-scroll">
      <table aria-label="Technician outcomes">
        <thead>
          <tr>
            <th>Technician</th>
            <th>Runs</th>
            <th>Complete</th>
            <th>Partial</th>
            <th>Active</th>
            <th>Attempts</th>
            <th>Steps attempted</th>
            <th>First-pass success</th>
            <th>Retakes</th>
            <th>Active time</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => (
            <tr key={metric.technicianId}>
              <td>{metric.technicianName}</td>
              <td>{metric.runs}</td>
              <td>{metric.completed}</td>
              <td>{metric.partial}</td>
              <td>{metric.active}</td>
              <td>{metric.attempts}</td>
              <td>{metric.attemptedSteps}</td>
              <td>
                {metric.firstPassRate === null
                  ? "—"
                  : `${(metric.firstPassRate * 100).toFixed(1)}%`}
              </td>
              <td>{metric.retakes}</td>
              <td>{duration(metric.activeSeconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function MetricTable({
  columns,
  title,
  value,
}: {
  columns: { key: string; label: string }[];
  title: string;
  value: unknown;
}) {
  let rows: Record<string, unknown>[] = [];
  if (Array.isArray(value)) {
    rows = value.filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object"
    );
  } else if (value && typeof value === "object") {
    rows = Object.entries(value).map(([name, item]) => ({
      name,
      value: typeof item === "object" ? JSON.stringify(item) : item,
    }));
  }
  if (!rows.length) {
    return <p className="inline-empty">No recorded data for this view.</p>;
  }
  return (
    <div className="table-scroll">
      <table aria-label={title}>
        <thead>
          <tr>
            {columns.map(({ key, label }) => (
              <th key={key} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={String(
                row.id ??
                  row.stepId ??
                  row.criterionId ??
                  row.name ??
                  JSON.stringify(row)
              )}
            >
              {columns.map(({ key }) => (
                <td key={key}>{metricValue(key, row[key])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function metricValue(key: string, value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (key === "durationMs" && typeof value === "number") {
    return value < 1000
      ? `${Math.round(value)} ms`
      : `${(value / 1000).toFixed(1)} s`;
  }
  return typeof value === "string" ? humanize(value) : String(value);
}
