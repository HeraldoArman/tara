"use client";
import {
  Activity,
  CheckCheck,
  ClipboardCheck,
  ScanLine,
  ShieldAlert,
} from "lucide-react";
import { useState } from "react";
import { api, errorMessage, humanize } from "@/lib/api";
import type { Evaluation } from "@/lib/contracts";
export function EvaluationView({
  initialSummary,
  ownOnly = false,
}: {
  initialSummary: Evaluation;
  ownOnly?: boolean;
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
      description: "Attempts, completion and retakes by procedure step.",
      key: "stepMetrics",
      title: "Success by step",
    },
    {
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
      description: "Measured model and tool response times.",
      key: "latency",
      title: "Service latency",
    },
  ];
  return (
    <>
      <form className="evaluation-filters panel" onSubmit={filter}>
        <div>
          <label htmlFor="filter-sop">SOP / version</label>
          <input id="filter-sop" name="sopId" placeholder="All procedures" />
        </div>
        <div>
          <label htmlFor="filter-tech">Technician</label>
          <input
            disabled={ownOnly}
            id="filter-tech"
            name="technicianId"
            placeholder={
              ownOnly ? "Your own run history" : "All authorized technicians"
            }
          />
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
          Apply filters
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
            <MetricTable value={data[table.key]} />
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
function MetricTable({ value }: { value: unknown }) {
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
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))].slice(
    0,
    6
  );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {keys.map((key) => (
              <th key={key}>
                {humanize(key.replace(/([a-z])([A-Z])/g, "$1 $2"))}
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
              {keys.map((key) => (
                <td key={key}>
                  {typeof row[key] === "object"
                    ? JSON.stringify(row[key])
                    : String(row[key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
