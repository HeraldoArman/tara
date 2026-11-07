"use client";

import { ArrowUpRight, Camera, Clock3, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api, dateTime, duration, errorMessage, humanize } from "@/lib/api";
import type {
  Attempt,
  Run,
  RunRecord,
  RunRecordPage,
  RunStep,
  User,
} from "@/lib/contracts";
import { ActivityRecord } from "./activity-record";
import { EvidenceRecords } from "./evidence";
import { EmptyState, Status } from "./ui";
import "./reports-records.css";

const recordedStatuses = new Set([
  "ai_verified",
  "attested",
  "complete",
  "skipped",
]);
const ongoingStatuses = new Set(["active", "paused"]);

function SessionRecordCard({ record }: { record: RunRecord }) {
  return (
    <article className="panel run-record-card">
      <div className="run-record-top">
        <span className="mono">{record.workOrder.reference}</span>
        <Status value={record.status} />
      </div>
      <h3>{record.workOrder.title}</h3>
      <p>
        {record.sop.title} · v{record.sop.version}
      </p>
      <p>
        {record.workOrder.asset.model} · {record.workOrder.asset.serial}
      </p>
      <div className="run-record-meta">
        <span>
          <Clock3 size={14} />
          Started {dateTime(record.startedAt)}
        </span>
        <span>{record.attemptCount} attempts</span>
        <span>
          <Camera size={14} />
          {record.evidenceCount} saved images · {record.acceptedEvidenceCount}{" "}
          accepted
        </span>
        {record.progress.held > 0 ? (
          <span>{record.progress.held} held steps</span>
        ) : null}
      </div>
      <div className="run-record-bottom">
        <div className="run-record-progress">
          <progress
            aria-label="Steps recorded"
            max={record.progress.total || 1}
            value={record.progress.completed}
          />
          <span>
            {record.progress.completed}/{record.progress.total} steps recorded ·{" "}
            {duration(record.elapsedSeconds)} active time
          </span>
        </div>
        <div className="run-record-links">
          <Link className="button small" href={`/reports/runs/${record.id}`}>
            View session record <ArrowUpRight size={14} />
          </Link>
          {record.reportId ? (
            <Link className="button small" href={`/reports/${record.reportId}`}>
              Final report <ArrowUpRight size={14} />
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function RunRecordList({ initialPage }: { initialPage: RunRecordPage }) {
  const [page, setPage] = useState(initialPage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async (offset: number) => {
    setBusy(true);
    setError("");
    try {
      const next = await api<RunRecordPage>(
        `/run-records?limit=${page.limit}&offset=${offset}`
      );
      setPage((previous) => {
        const records = offset === 0 ? [] : previous.items;
        const merged = new Map(records.map((record) => [record.id, record]));
        for (const record of next.items) {
          merged.set(record.id, record);
        }
        return { ...next, items: [...merged.values()] };
      });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const ongoing = page.items.filter((record) =>
    ongoingStatuses.has(record.status)
  ).length;
  const closed = page.items.length - ongoing;
  const images = page.items.reduce(
    (total, record) => total + record.evidenceCount,
    0
  );

  return (
    <section aria-label="Session records" className="run-records-section">
      <div className="run-records-heading">
        <div>
          <h2>Session records</h2>
          <p>
            Review ongoing and closed sessions, including recorded attempts and
            saved camera images. A final report is created when a session is
            closed.
          </p>
        </div>
        <button
          className="button small"
          disabled={busy}
          onClick={() => load(0)}
          type="button"
        >
          <RefreshCw size={14} />
          {busy ? "Loading…" : "Refresh records"}
        </button>
      </div>
      <div className="run-records-summary">
        <span>
          <strong>{ongoing}</strong>ongoing
        </span>
        <span>
          <strong>{closed}</strong>closed
        </span>
        <span>
          <strong>{images}</strong>saved images
        </span>
        {page.hasMore ? <span>Counts reflect loaded sessions.</span> : null}
      </div>
      {error ? (
        <div className="notice danger" role="alert">
          {error}
        </div>
      ) : null}
      <div className="run-record-list">
        {page.items.map((record) => (
          <SessionRecordCard key={record.id} record={record} />
        ))}
      </div>
      {page.items.length === 0 ? (
        <EmptyState
          description="Start a session from a published SOP. Its attempts and saved images will appear here as work is recorded."
          href="/sop-intelligence"
          label="Select a saved SOP"
          title="No session records yet."
        />
      ) : null}
      {page.hasMore ? (
        <button
          className="button run-record-pagination"
          disabled={busy}
          onClick={() => load(page.offset + page.limit)}
          type="button"
        >
          {busy ? "Loading…" : "Load more session records"}
        </button>
      ) : null}
    </section>
  );
}

function RecordActions({ run, user }: { run: Run; user: User }) {
  const router = useRouter();
  const [refreshing, refresh] = useTransition();
  const canResume =
    ongoingStatuses.has(run.status) &&
    ["technician", "owner"].includes(user.role) &&
    run.workOrder.assignedTo === user.id;
  return (
    <div className="run-record-links">
      <Link className="button" href="/reports">
        All session records
      </Link>
      <button
        className="button"
        disabled={refreshing}
        onClick={() => refresh(() => router.refresh())}
        type="button"
      >
        <RefreshCw size={14} />
        {refreshing ? "Refreshing…" : "Refresh record"}
      </button>
      {canResume ? (
        <Link className="button primary" href={`/runs/${run.id}`}>
          Resume session <ArrowUpRight size={15} />
        </Link>
      ) : null}
      {run.reportId ? (
        <Link className="button" href={`/reports/${run.reportId}`}>
          Open final report <ArrowUpRight size={15} />
        </Link>
      ) : null}
    </div>
  );
}

function AttemptRecord({ attempt, step }: { attempt: Attempt; step: RunStep }) {
  const response = attempt.response ?? attempt.result.response;
  return (
    <article className="attempt">
      <div>
        <span className="eyebrow">ATTEMPT {attempt.number}</span>
        <Status value={attempt.outcome} />
      </div>
      <p>
        {humanize(attempt.kind)} · {dateTime(attempt.createdAt)}
      </p>
      {attempt.explanation ? <p>{attempt.explanation}</p> : null}
      {response ? <p>Technician response: {humanize(response)}</p> : null}
      {attempt.result.criteria?.map((criterion) => (
        <div className="attempt-criterion" key={criterion.id}>
          <Status value={criterion.verdict} />
          <p>
            <strong>
              {step.verification.criteria?.find(
                (item) => item.id === criterion.id
              )?.description ?? humanize(criterion.id)}
            </strong>{" "}
            · {criterion.reason}
          </p>
        </div>
      ))}
    </article>
  );
}

function RecordedStep({ step, index }: { step: RunStep; index: number }) {
  return (
    <details className="run-record-step" open={step.attempts.length > 0}>
      <summary>
        <span className="step-index">{index + 1}</span>
        <div>
          <strong>{step.title}</strong>
          <small>
            {humanize(step.verification.kind)} · {step.attempts.length} attempts
          </small>
        </div>
        <Status value={step.status} />
      </summary>
      <div className="run-record-step-body">
        <p>{step.instruction}</p>
        <div className="attempt-list">
          {step.attempts.map((attempt) => (
            <AttemptRecord attempt={attempt} key={attempt.id} step={step} />
          ))}
        </div>
        {step.attempts.length ? null : (
          <p>No attempt has been recorded for this step.</p>
        )}
      </div>
    </details>
  );
}

export function RunRecordDetail({ run, user }: { run: Run; user: User }) {
  const recorded = run.steps.filter((step) =>
    recordedStatuses.has(step.status)
  ).length;
  const held = run.steps.filter((step) => step.status === "held").length;
  const attempts = run.steps.reduce(
    (count, step) => count + step.attempts.length,
    0
  );
  const ongoing = ongoingStatuses.has(run.status);
  const metrics = [
    { label: "Steps recorded", value: `${recorded}/${run.steps.length}` },
    { label: "Attempts", value: attempts },
    { label: "Saved images", value: run.evidence.length },
    { label: "Active time", value: duration(run.elapsedSeconds) },
  ];
  return (
    <>
      <div className="run-records-heading">
        <Status value={run.status} />
        <RecordActions run={run} user={user} />
      </div>
      <div className="notice run-record-notice">
        <div>
          <strong>
            {ongoing
              ? "This session is still open."
              : "This session is closed."}
          </strong>
          <p>
            This is the saved session record.{" "}
            {ongoing
              ? "Refresh to load newly recorded work. Closing the session creates a final report."
              : "Final reports preserve a separate snapshot of the closed work."}
            {held > 0 ? ` ${held} steps are held.` : ""}
          </p>
        </div>
      </div>
      <div className="run-record-stats">
        {metrics.map((metric) => (
          <div className="panel run-record-stat" key={metric.label}>
            <strong>{metric.value}</strong>
            <span>{metric.label}</span>
          </div>
        ))}
      </div>
      <div className="run-record-detail">
        <section className="panel">
          <header className="panel-head">
            <h2>Session details</h2>
          </header>
          <div className="panel-body">
            <dl className="run-record-identity">
              <div>
                <dt>Work order</dt>
                <dd>
                  {run.workOrder.reference} · {run.workOrder.title}
                </dd>
              </div>
              <div>
                <dt>Procedure</dt>
                <dd>
                  {run.sop.key} · {run.sop.title} · v{run.sop.version}
                </dd>
              </div>
              <div>
                <dt>Equipment or work area</dt>
                <dd>{run.workOrder.asset.model}</dd>
              </div>
              <div>
                <dt>Asset or location ID</dt>
                <dd>{run.workOrder.asset.serial}</dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{dateTime(run.startedAt)}</dd>
              </div>
              <div>
                <dt>Work requested</dt>
                <dd>{run.workOrder.issue}</dd>
              </div>
            </dl>
          </div>
        </section>
        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>Saved camera images</h2>
              <p>
                Each frame is the image stored for its visual check. A saved
                image does not imply that the check passed.
              </p>
            </div>
            <span className="count">{run.evidence.length}</span>
          </header>
          <div className="panel-body">
            <EvidenceRecords evidence={run.evidence} steps={run.steps} />
          </div>
        </section>
        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>Steps and attempts</h2>
              <p>
                Visual results and technician confirmations remain distinct.
              </p>
            </div>
            <span className="count">{run.steps.length} steps</span>
          </header>
          {run.steps.map((step, index) => (
            <RecordedStep index={index} key={step.id} step={step} />
          ))}
        </section>
        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>Session activity</h2>
              <p>Recorded audit events and tool calls.</p>
            </div>
          </header>
          <div className="panel-body">
            <ActivityRecord runId={run.id} />
          </div>
        </section>
      </div>
    </>
  );
}
