"use client";
import "./evaluation-dashboard.css";
import Link from "next/link";
import { useState } from "react";
import { api, duration, errorMessage, humanize } from "@/lib/api";
import type { Evaluation, Sop, TechnicianMetric } from "@/lib/contracts";
import { EvaluationEvidence, EvaluationInsights } from "./evaluation-insights";
import { EvaluationOverview } from "./evaluation-overview";
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
  const [appliedQuery, setAppliedQuery] = useState("");
  const load = async (query: string) => {
    setBusy(true);
    setError("");
    try {
      setData(await api<Evaluation>(`/evaluation/summary?${query}`));
      setAppliedQuery(query);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const filter = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    const form = new FormData(event.currentTarget);
    const query = new URLSearchParams();
    for (const [key, value] of form) {
      if (String(value).trim()) {
        query.set(key, String(value));
      }
    }
    await load(query.toString());
  };
  const refresh = async () => {
    if (!busy) {
      await load(appliedQuery);
    }
  };
  const stepRows = data.stepMetrics
    .filter((step) => step.attempts > 0 || step.held > 0)
    .sort((a, b) => b.held - a.held || b.attempts - a.attempts);
  const tables = [
    {
      columns: [
        { key: "stepTitle", label: "Step" },
        { key: "sopKey", label: "Procedure" },
        { key: "runs", label: "Runs" },
        { key: "attempts", label: "Attempts" },
        { key: "firstPass", label: "Passed first time" },
        { key: "held", label: "Held" },
      ],
      description:
        "Attempted and held steps. Open a step to review its session and images.",
      key: "stepMetrics",
      title: "Success by step",
    },
    {
      columns: [
        { key: "criterionDescription", label: "Criterion" },
        { key: "stepTitle", label: "Step" },
        { key: "count", label: "Failed" },
        { key: "unclearCount", label: "Unclear" },
      ],
      description:
        "Counts include saved attempts and retakes, with unclear checks counted separately.",
      key: "criterionFailures",
      title: "Recorded criterion results",
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
      description: "The most recent 100 measured model and tool actions.",
      key: "latency",
      title: "Service latency",
    },
  ];
  return (
    <div aria-busy={busy} className="evaluation-dashboard">
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
        <div className="evaluation-filter-actions">
          <button className="button primary" disabled={busy} type="submit">
            {busy ? "Loading…" : "Apply filters"}
          </button>
          <button
            className="button"
            disabled={busy}
            onClick={refresh}
            type="button"
          >
            Refresh data
          </button>
        </div>
      </form>
      {error ? (
        <div className="notice danger" role="alert">
          {error}
        </div>
      ) : null}
      <EvaluationOverview
        data={data}
        filtered={appliedQuery !== ""}
        ownOnly={ownOnly}
      />
      <EvaluationInsights data={data} />
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
                value={table.key === "stepMetrics" ? stepRows : data[table.key]}
              />
            )}
          </section>
        ))}
      </div>
      <EvaluationEvidence data={data} />
      <p className="subtle-note">
        {data.scope ||
          "These values use saved sessions in your authorized scope."}{" "}
        {data.firstPassRateScope}
      </p>
    </div>
  );
}
function TechnicianOutcomes({ metrics }: { metrics: TechnicianMetric[] }) {
  if (!metrics.length) {
    return <p className="inline-empty">No matching technician run history.</p>;
  }
  return (
    <section
      aria-label="Technician outcomes table"
      className="table-scroll"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the overflowed table.
      tabIndex={0}
    >
      <table aria-label="Technician outcomes">
        <thead>
          <tr>
            <th scope="col">Technician</th>
            <th scope="col">Runs</th>
            <th scope="col">Complete</th>
            <th scope="col">Partial</th>
            <th scope="col">Active</th>
            <th scope="col">Attempts</th>
            <th scope="col">Steps attempted</th>
            <th scope="col">First-pass success</th>
            <th scope="col">Retakes</th>
            <th scope="col">Active time</th>
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
    </section>
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
    <section
      aria-label={`${title} table`}
      className="table-scroll"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the overflowed table.
      tabIndex={0}
    >
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
                <td key={key}>
                  <MetricCell field={key} row={row} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
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

function MetricCell({
  field,
  row,
}: {
  field: string;
  row: Record<string, unknown>;
}) {
  const value = metricValue(field, row[field]);
  if (
    (field === "stepTitle" || field === "criterionDescription") &&
    typeof row.runId === "string"
  ) {
    return (
      <Link
        className="evaluation-record-link"
        href={`/reports/runs/${encodeURIComponent(row.runId)}`}
      >
        {value}
      </Link>
    );
  }
  if (field === "sopKey" && typeof row.version === "string") {
    return (
      <span>
        {value}
        <small className="table-subtext">v{row.version}</small>
      </span>
    );
  }
  return value;
}
