"use client";

import "@tara/ui/assistant.css";
import "./dashboard.css";

import { Button } from "@tara/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@tara/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@tara/ui/components/empty";
import {
  CalendarDays,
  ChartNoAxesCombined,
  Download,
  Info,
  RotateCcw,
} from "lucide-react";
import { type ChangeEvent, useCallback, useMemo, useState } from "react";

import {
  type DashboardPeriod,
  type DashboardSopSummary,
  getDashboardSummary,
} from "./dashboard-analytics";
import { DashboardAttention } from "./dashboard-attention";
import { SopComparisonChart, StateTrendChart } from "./dashboard-charts";
import type { DashboardDataset } from "./dashboard-data";
import {
  createSummaryCsv,
  downloadSummary,
  formatCount,
  formatDate,
} from "./dashboard-format";
import { DashboardMetrics } from "./dashboard-metrics";
import { DashboardShell } from "./dashboard-shell";

type SopSort = "warning" | "total" | "title";

function sortSops(
  sops: readonly DashboardSopSummary[],
  sort: SopSort
): DashboardSopSummary[] {
  return sops.toSorted((a, b) => {
    if (sort === "title") {
      return a.sop.title.localeCompare(b.sop.title);
    }
    return b[sort] - a[sort] || a.sop.title.localeCompare(b.sop.title);
  });
}

function MetricDefinitions() {
  return (
    <details className="dash-metric-help">
      <summary>
        <Info aria-hidden="true" />
        How to read these numbers
      </summary>
      <div>
        <p>
          <strong>One trigger is one entry into a state.</strong> Returning to
          Active after Warning counts as another Active event. A procedure can
          trigger the same state more than once.
        </p>
        <p>
          <strong>Warning is a request for attention.</strong> It is not
          automatically a violation. Success is positive feedback, not a count
          of completed workflows.
        </p>
        <p>
          The charts share the selected SOP and date range. Changes compare
          equal-length consecutive periods. A higher event count is not
          inherently better or worse.
        </p>
      </div>
    </details>
  );
}

function NoDashboardEvents({ onReset }: { onReset: () => void }) {
  return (
    <Card className="dash-panel dash-no-data">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ChartNoAxesCombined />
          </EmptyMedia>
          <EmptyTitle>No state activity in this view.</EmptyTitle>
          <EmptyDescription>
            This sample procedure has no recorded triggers in the selected
            period. Choose another SOP to explore its activity.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={onReset} variant="outline">
            View all SOPs
            <RotateCcw data-icon="inline-end" />
          </Button>
        </EmptyContent>
      </Empty>
    </Card>
  );
}

export function ManagementDashboard({ data }: { data: DashboardDataset }) {
  const [sopId, setSopId] = useState("all");
  const [days, setDays] = useState<DashboardPeriod>(7);
  const [sort, setSort] = useState<SopSort>("warning");
  const [exported, setExported] = useState(false);
  const summary = useMemo(
    () => getDashboardSummary(data, { days, sopId }),
    [data, days, sopId]
  );
  const sortedSops = useMemo(
    () => sortSops(summary.sops, sort),
    [sort, summary.sops]
  );
  const selectedSop = data.sops.find((sop) => sop.id === sopId);
  const chartSops = sortedSops.map((row) => ({
    active: row.active,
    code: row.sop.code,
    id: row.sop.id,
    label: row.sop.title,
    success: row.success,
    warning: row.warning,
  }));

  const selectSop = useCallback((id: string) => {
    setSopId(id);
    setExported(false);
  }, []);
  const resetSop = useCallback(() => selectSop("all"), [selectSop]);
  const changeSop = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) =>
      selectSop(event.currentTarget.value),
    [selectSop]
  );
  const changePeriod = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const next = Number(event.currentTarget.value);
    if (next === 7 || next === 14 || next === 30) {
      setDays(next);
      setExported(false);
    }
  }, []);
  const changeSort = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.currentTarget;
    if (value === "warning" || value === "total" || value === "title") {
      setSort(value);
    }
  }, []);
  const exportSummary = useCallback(() => {
    downloadSummary(
      createSummaryCsv(sortedSops, summary.range, data.timeZone),
      `tara-demo-sop-activity-${summary.range.end}.csv`
    );
    setExported(true);
  }, [data.timeZone, sortedSops, summary.range]);

  return (
    <DashboardShell>
      <section aria-labelledby="overview-heading" className="dash-hero">
        <div>
          <p className="dash-eyebrow">THE BIG PICTURE</p>
          <h1 id="overview-heading">Your operations, in focus.</h1>
          <p className="dash-intro">
            See how your SOPs unfold, and where your team needs a little
            guidance.
          </p>
        </div>
        <Button
          className="dash-export"
          onClick={exportSummary}
          variant="outline"
        >
          <Download data-icon="inline-start" />
          Export summary
        </Button>
      </section>

      <div className="dash-filter-bar">
        <div className="dash-filters">
          <label className="dash-select-field" htmlFor="dashboard-sop">
            <span>Procedure</span>
            <select id="dashboard-sop" onChange={changeSop} value={sopId}>
              <option value="all">All SOPs</option>
              {data.sops.map((sop) => (
                <option key={sop.id} value={sop.id}>
                  {sop.title}
                </option>
              ))}
            </select>
          </label>
          <label className="dash-select-field" htmlFor="dashboard-period">
            <span>Period</span>
            <select id="dashboard-period" onChange={changePeriod} value={days}>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </label>
        </div>
        <p className="dash-period-caption">
          <CalendarDays aria-hidden="true" />
          <span>
            {formatDate(summary.range.start)} – {formatDate(summary.range.end)}
            <small>{data.timeZone} · sample snapshot</small>
          </span>
        </p>
      </div>

      <div className="dash-scope-line">
        <p aria-atomic="true" aria-live="polite">
          {selectedSop
            ? `${selectedSop.code} · v${selectedSop.version}`
            : `${data.sops.length} procedures in view`}
          <span> / </span>
          {formatCount(summary.totalEvents)} state triggers
        </p>
        {selectedSop ? (
          <Button
            className="dash-text-action"
            onClick={resetSop}
            size="sm"
            variant="ghost"
          >
            <RotateCcw data-icon="inline-start" />
            All SOPs
          </Button>
        ) : null}
      </div>

      <DashboardMetrics
        days={days}
        previous={summary.previousTotals}
        totals={summary.totals}
      />

      {summary.totalEvents > 0 ? (
        <div className="dash-chart-grid">
          <Card className="dash-panel dash-trend">
            <CardHeader className="dash-panel-header">
              <CardTitle>
                <h2>Every state tells a story.</h2>
              </CardTitle>
              <CardDescription>
                Daily trigger counts across{" "}
                {selectedSop?.title ?? "all procedures"}.
              </CardDescription>
            </CardHeader>
            <CardContent className="dash-chart-content">
              <StateTrendChart data={summary.daily} />
            </CardContent>
          </Card>
          <DashboardAttention
            onSelect={selectSop}
            sops={summary.sops}
            steps={summary.steps}
          />
        </div>
      ) : (
        <NoDashboardEvents onReset={resetSop} />
      )}

      <Card className="dash-panel dash-comparison" id="sop-breakdown">
        <CardHeader className="dash-panel-header">
          <div>
            <CardTitle>
              <h2>Activity by procedure.</h2>
            </CardTitle>
            <CardDescription>
              Compare state triggers on the same scale. Select a procedure for a
              closer look.
            </CardDescription>
          </div>
          <label className="dash-sort" htmlFor="dashboard-sort">
            <span>Sort by</span>
            <select id="dashboard-sort" onChange={changeSort} value={sort}>
              <option value="warning">Most warnings</option>
              <option value="total">Most activity</option>
              <option value="title">Procedure name</option>
            </select>
          </label>
        </CardHeader>
        <CardContent>
          <SopComparisonChart data={chartSops} onSelect={selectSop} />
        </CardContent>
        <CardFooter className="dash-comparison-footer">
          <p>
            Counts of state entries, including repeat visits. Not unique tasks
            or employees.
          </p>
          <span>
            {summary.sops.length}{" "}
            {summary.sops.length === 1 ? "procedure" : "procedures"}
          </span>
        </CardFooter>
      </Card>

      <MetricDefinitions />
      <p aria-live="polite" className="sr-only">
        {exported ? "Demo summary exported for the current filters." : ""}
      </p>
    </DashboardShell>
  );
}
