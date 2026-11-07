"use client";

import { Button } from "@tara/ui/components/button";
import { ArrowUpRight, CircleAlert, Info, RefreshCw } from "lucide-react";
import Link from "next/link";
import { type ChangeEvent, type FormEvent, useCallback, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Evaluation, Sop } from "@/lib/contracts";
import { DashboardMetrics } from "./dashboard-metrics";
import {
  RunOutcomeChart,
  StepActivity,
  TechnicianActivity,
  VerificationSnapshot,
} from "./operational-charts";
import {
  type DashboardFilters,
  evaluationQuery,
  initialDashboardFilters,
} from "./owner-dashboard-data";

interface ManagementDashboardProps {
  initialError?: string;
  initialSummary: Evaluation | null;
  sops: Pick<Sop, "id" | "title">[];
}

export function ManagementDashboard({
  initialSummary,
  initialError = "",
  sops,
}: ManagementDashboardProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [draft, setDraft] = useState(initialDashboardFilters);
  const [applied, setApplied] = useState(initialDashboardFilters);
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const selectedSop = sops.find((sop) => sop.id === applied.sopId);

  const load = useCallback(async (filters: DashboardFilters) => {
    setBusy(true);
    setError("");
    try {
      const result = await api<Evaluation>(evaluationQuery(filters));
      setSummary(result);
      setApplied(filters);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (draft.from && draft.to && draft.from > draft.to) {
        setError("Choose an end date on or after the start date.");
        return;
      }
      await load(draft);
    },
    [draft, load]
  );

  const reset = useCallback(async () => {
    setDraft(initialDashboardFilters);
    await load(initialDashboardFilters);
  }, [load]);

  const changeSop = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const sopId = event.target.value;
    setDraft((value) => ({ ...value, sopId }));
  }, []);
  const changeFrom = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const from = event.target.value;
    setDraft((value) => ({ ...value, from }));
  }, []);
  const changeTo = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const to = event.target.value;
    setDraft((value) => ({ ...value, to }));
  }, []);

  return (
    <section aria-label="Operations analytics" className="ops-analytics">
      <form className="dash-filter-bar ops-filter-bar" onSubmit={submit}>
        <fieldset className="dash-filters" disabled={busy}>
          <legend className="sr-only">Filter recorded runs</legend>
          <label className="dash-select-field">
            <span>Procedure</span>
            <select onChange={changeSop} value={draft.sopId}>
              <option value="">All procedures</option>
              {sops.map((sop) => (
                <option key={sop.id} value={sop.id}>
                  {sop.title}
                </option>
              ))}
            </select>
          </label>
          <label className="dash-select-field">
            <span>Created from · UTC</span>
            <input
              max={draft.to || undefined}
              onChange={changeFrom}
              type="date"
              value={draft.from}
            />
          </label>
          <label className="dash-select-field">
            <span>Created through · UTC</span>
            <input
              min={draft.from || undefined}
              onChange={changeTo}
              type="date"
              value={draft.to}
            />
          </label>
          <Button
            className="ops-apply"
            disabled={busy}
            type="submit"
            variant="outline"
          >
            <RefreshCw
              aria-hidden="true"
              className={busy ? "spin" : undefined}
            />
            {busy ? "Updating…" : "Apply filters"}
          </Button>
          <button className="dash-text-action" onClick={reset} type="button">
            Reset
          </button>
        </fieldset>
      </form>
      <div aria-atomic="true" className="dash-scope-line" role="status">
        <p>
          <strong>{selectedSop?.title ?? "All procedures"}</strong>
          {" · "}
          {applied.from || "All history"}
          {applied.to ? ` through ${applied.to}` : " through now"}
          {" · UTC"}
        </p>
        <span className="ops-scope-note">
          {busy
            ? "Updating recorded activity…"
            : "Recorded activity · refresh with Apply filters"}
        </span>
      </div>
      {error ? (
        <div className="ops-error" role="alert">
          <CircleAlert aria-hidden="true" size={18} />
          <div>
            <strong>Unable to update analytics</strong>
            <p>{error}</p>
            {summary ? (
              <p>The last loaded results and their scope remain visible.</p>
            ) : null}
          </div>
        </div>
      ) : null}
      {summary ? (
        <div aria-busy={busy}>
          <DashboardMetrics summary={summary} />
          {summary.runs === 0 ? (
            <div className="ops-get-started">
              <div>
                <strong>A clear view starts with a recorded run.</strong>
                <p>
                  Start a session from a published SOP, or create a job for your
                  team.
                </p>
              </div>
              <Link className="dash-text-action" href="/sops">
                Explore your SOPs <ArrowUpRight aria-hidden="true" />
              </Link>
            </div>
          ) : null}
          <div className="dash-chart-grid">
            <RunOutcomeChart summary={summary} />
            <VerificationSnapshot summary={summary} />
          </div>
          <TechnicianActivity summary={summary} />
          <StepActivity sopTitle={selectedSop?.title} summary={summary} />
          <details className="dash-metric-help ops-metric-help">
            <summary>
              <Info aria-hidden="true" size={14} /> How to read these numbers
            </summary>
            <div>
              <p>
                <strong>Runs and alerts.</strong> In progress means active or
                paused execution runs. Assistant alerts count recorded alert
                outputs, including ones whose speech may have been muted. These
                are not counts of visual Active, Warning, or Success state
                changes.
              </p>
              <p>
                <strong>Verification.</strong> First-pass success counts first
                attempts that passed or were human-attested, including
                unfinished runs. Human attestation is shown separately from AI
                verification. A complete run is not itself a compliance
                judgment.
              </p>
              <p>
                <strong>Scope.</strong> Filters apply to runs created during the
                selected UTC dates, with the end date included. Results cover
                your organization. The work queue and recent reports below
                retain their own full scope. An em dash means a metric is
                unavailable.
              </p>
            </div>
          </details>
        </div>
      ) : null}
    </section>
  );
}
