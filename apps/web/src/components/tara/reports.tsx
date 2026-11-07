"use client";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  Printer,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, dateTime, errorMessage, humanize } from "@/lib/api";
import type { Report, Review, User } from "@/lib/contracts";
import { reportToolHistory } from "@/lib/report-tool-history";
import { AuditTimeline, ToolCallHistory } from "./activity-record";
import { EvidenceRecords } from "./evidence";
import { ProcedureRequirements } from "./procedure-requirements";
import { EmptyState, Status } from "./ui";

export function ReportList({ items }: { items: Report[] }) {
  const [filter, setFilter] = useState("all");
  const reports = items.filter(
    (item) => filter === "all" || item.outcome === filter
  );
  return (
    <>
      <div className="list-toolbar">
        <span>{items.length} reports in your scope</span>
        <fieldset aria-label="Filter reports" className="segmented">
          {["all", "complete", "partial"].map((value) => (
            <button
              aria-pressed={value === filter}
              key={value}
              onClick={() => setFilter(value)}
              type="button"
            >
              {value === "all" ? "All reports" : humanize(value)}
            </button>
          ))}
        </fieldset>
      </div>
      {reports.length ? (
        <div className="panel table-panel">
          <table>
            <thead>
              <tr>
                <th>Work order</th>
                <th>Procedure</th>
                <th>Outcome</th>
                <th>Created</th>
                <th>
                  <span className="sr-only">View report</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {reports.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link className="table-title" href={`/reports/${item.id}`}>
                      <FileText size={19} />
                      <div>
                        <strong>
                          {item.workOrder?.reference ?? item.id.slice(0, 8)}
                        </strong>
                        <span>
                          {item.workOrder?.asset.model ??
                            item.workOrder?.title ??
                            "Recorded execution"}
                        </span>
                      </div>
                    </Link>
                  </td>
                  <td>
                    {item.sop?.title ?? "Pinned SOP"}
                    <span className="table-subtext">
                      {item.sop?.key} · v{item.sop?.version}
                    </span>
                  </td>
                  <td>
                    <Status value={item.outcome ?? item.status ?? "recorded"} />
                  </td>
                  <td>{dateTime(item.createdAt)}</td>
                  <td>
                    <Link
                      aria-label={`Open report ${item.workOrder?.reference ?? item.id}`}
                      className="icon-button"
                      href={`/reports/${item.id}`}
                    >
                      <ArrowUpRight size={18} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          description="Closed runs appear here with every attempt, evidence frame and unresolved issue preserved."
          title="No reports in this view."
        />
      )}
    </>
  );
}

export function ReportDetail({ report, user }: { report: Report; user: User }) {
  const { steps, evidence, deviations, escalations } = report;
  const events = report.auditEvents;
  const toolHistory = reportToolHistory(report);
  const toolCalls = toolHistory.calls;
  const [reviews, setReviews] = useState<Review[]>(report.reviews);
  useEffect(() => {
    let original: { element: HTMLDetailsElement; open: boolean }[] = [];
    const prepare = () => {
      original = Array.from(
        document.querySelectorAll<HTMLDetailsElement>(
          "details.report-step, details.tool-call-details"
        )
      ).map((element) => ({ element, open: element.open }));
      for (const { element } of original) {
        element.open = true;
      }
    };
    const restore = () => {
      for (const { element, open } of original) {
        element.open = open;
      }
    };
    window.addEventListener("beforeprint", prepare);
    window.addEventListener("afterprint", restore);
    return () => {
      window.removeEventListener("beforeprint", prepare);
      window.removeEventListener("afterprint", restore);
    };
  }, []);
  return (
    <>
      <div className="report-actions">
        <Status value={report.outcome ?? "recorded"} />
        <span className="report-created">
          Recorded {dateTime(report.createdAt)}
        </span>
        <a
          className="button"
          download
          href={`/api/v1/reports/${report.id}/export`}
        >
          <Download size={16} />
          JSON export
        </a>
        <button className="button" onClick={() => window.print()} type="button">
          <Printer size={16} />
          Print / PDF
        </button>
      </div>
      {report.outcome === "partial" ? (
        <div className="notice warning">
          <ShieldCheck size={18} />
          <div>
            <strong>This is a partial completion.</strong>
            <p>
              Held and unreached steps remain unresolved. Review the recorded
              exceptions before handoff.
            </p>
          </div>
        </div>
      ) : null}
      <div className="report-grid">
        <div className="report-primary">
          <section className="panel">
            <div className="panel-body">
              <ProcedureRequirements
                prerequisites={report.sop.prerequisites}
                scope={report.sop.scope}
              />
            </div>
          </section>
          <section aria-label="Recorded tool calls" className="panel">
            <header className="panel-head">
              <div>
                <h2>Recorded tool calls</h2>
                <p>{toolHistory.scope}</p>
              </div>
              <span className="count">
                {toolHistory.captured ? toolCalls.length : "Not captured"}
              </span>
            </header>
            <div className="panel-body">
              <ToolCallHistory
                calls={toolCalls}
                emptyMessage={
                  toolHistory.captured
                    ? "No tool calls were recorded in this history."
                    : toolHistory.scope
                }
              />
            </div>
          </section>
          <section className="panel">
            <header className="panel-head">
              <div>
                <h2>Step record</h2>
                <p>
                  Evidence and attestations are distinguished for every step.
                </p>
              </div>
              <span className="count">{steps.length} steps</span>
            </header>
            <div className="report-step-list">
              {steps.map((step, i) => (
                <details
                  className="report-step"
                  key={step.id}
                  open={step.status === "held"}
                >
                  <summary>
                    <span className="step-index">{i + 1}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <span>
                        {humanize(step.verification.kind)} ·{" "}
                        {step.attempts.length} attempts
                      </span>
                    </div>
                    <Status value={step.status} />
                    <ChevronDown size={15} />
                  </summary>
                  <div className="report-step-body">
                    <p>{step.instruction}</p>
                    <div className="attempt-list">
                      {step.attempts.map((attempt, n) => (
                        <div className="attempt" key={attempt.id}>
                          <div>
                            <span className="eyebrow">ATTEMPT {n + 1}</span>
                            <Status
                              value={
                                attempt.outcome ?? attempt.status ?? "recorded"
                              }
                            />
                          </div>
                          {attempt.explanation ? (
                            <p>{attempt.explanation}</p>
                          ) : null}
                          {attempt.response || attempt.result?.response ? (
                            <p>
                              Technician response:{" "}
                              {humanize(
                                attempt.response ??
                                  attempt.result?.response ??
                                  ""
                              )}
                            </p>
                          ) : null}
                          {attempt.result?.criteria?.map((criterion) => (
                            <div
                              className="attempt-criterion"
                              key={criterion.id}
                            >
                              <Status value={criterion.verdict} />
                              <p>
                                <strong>{humanize(criterion.id)}</strong> ·{" "}
                                {criterion.reason}
                              </p>
                            </div>
                          ))}
                          {attempt.createdAt ? (
                            <time>{dateTime(attempt.createdAt)}</time>
                          ) : null}
                          <span className="mono">{attempt.id}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </section>
          <section className="panel">
            <header className="panel-head">
              <div>
                <h2>Visual evidence</h2>
                <p>Accepted and rejected frames remain part of the record.</p>
              </div>
              <span className="count">{evidence.length}</span>
            </header>
            <div className="panel-body">
              <EvidenceRecords evidence={evidence} />
            </div>
          </section>
          <section className="panel">
            <header className="panel-head">
              <div>
                <h2>Execution timeline</h2>
                <p>Append-only activity for this report.</p>
              </div>
            </header>
            <div className="panel-body">
              <AuditTimeline events={events} />
              {events.length ? null : (
                <p className="inline-empty">No timeline events returned.</p>
              )}
            </div>
          </section>
        </div>
        <aside className="report-rail">
          <section className="panel">
            <header className="panel-head">
              <h2>Exceptions & escalations</h2>
            </header>
            <div className="panel-body">
              {[...deviations, ...escalations].map((item) => (
                <div className="issue-record" key={item.id}>
                  <Status value={item.status} />
                  <p>
                    {item.description ?? item.reason ?? "Recorded exception"}
                  </p>
                  <span className="mono">
                    {item.stepId ?? item.id.slice(0, 12)}
                  </span>
                </div>
              ))}
              {["supervisor", "owner"].includes(user.role) &&
              escalations.some((item) => item.status === "open") ? (
                <Link className="button" href={`/runs/${report.runId}`}>
                  Review current escalations
                  <ArrowUpRight size={14} />
                </Link>
              ) : null}
              {deviations.length || escalations.length ? null : (
                <p className="subtle-note">
                  <CheckCircle2 size={16} />
                  No exceptions in this report.
                </p>
              )}
            </div>
          </section>
          <section className="panel">
            <header className="panel-head">
              <h2>Supervisor review</h2>
            </header>
            <div className="panel-body">
              {reviews.map((review) => (
                <ReviewRecord key={review.id} review={review} />
              ))}
              {reviews.length ? null : (
                <p className="inline-empty">Awaiting review.</p>
              )}
              {["owner", "supervisor"].includes(user.role) ? (
                <ReviewForm
                  onReviewed={(nextReviews) => setReviews(nextReviews)}
                  reportId={report.id}
                />
              ) : null}
            </div>
          </section>
          <div className="integrity-note">
            <ShieldCheck size={19} />
            <div>
              <strong>Content integrity</strong>
              <p>
                This report preserves the execution snapshot. Its SHA-256 digest
                is an integrity cue.
              </p>
              <code>{report.digest ?? "Digest unavailable"}</code>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
function ReviewRecord({ review }: { review: Review }) {
  return (
    <article className="review-record">
      <Status value={review.decision} />
      <p>{review.note}</p>
      <span>
        {review.reviewerName ?? "Authorized reviewer"} ·{" "}
        {dateTime(review.createdAt)}
      </span>
    </article>
  );
}
function ReviewForm({
  reportId,
  onReviewed,
}: {
  reportId: string;
  onReviewed: (reviews: Review[]) => void;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const review = async (decision: string) => {
    setBusy(true);
    setError("");
    try {
      const result = await api<Report>(`/reports/${reportId}/reviews`, {
        body: JSON.stringify({ decision, note }),
        method: "POST",
      });
      onReviewed(result.reviews);
      setNote("");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="review-form">
      <label htmlFor="review-note">Review note</label>
      <textarea
        id="review-note"
        onChange={(event) => setNote(event.target.value)}
        placeholder="Explain your decision. Required when returning for rework."
        rows={4}
        value={note}
      />
      {error ? (
        <div className="notice danger" role="alert">
          {error}
        </div>
      ) : null}
      <button
        className="button primary"
        disabled={busy}
        onClick={() => review("approved")}
        type="button"
      >
        <CheckCircle2 size={16} />
        Approve this revision
      </button>
      <button
        className="button"
        disabled={busy || !note.trim()}
        onClick={() => review("returned")}
        type="button"
      >
        <RotateCcw size={15} />
        Return for rework
      </button>
    </div>
  );
}
