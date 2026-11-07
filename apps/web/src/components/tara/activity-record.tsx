"use client";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, dateTime, errorMessage, humanize } from "@/lib/api";
import type { ActivityPage, AuditEvent, ToolCall } from "@/lib/contracts";
import { Status } from "./ui";

export function AuditTimeline({ events }: { events: AuditEvent[] }) {
  return (
    <ol className="audit-timeline">
      {events.map((event) => (
        <li key={event.id}>
          <span className="timeline-dot" />
          <div>
            <strong>
              {humanize(event.type ?? event.eventType ?? "Event")}
            </strong>
            <p>{auditMessage(event)}</p>
            {event.occurredAt || event.createdAt ? (
              <time>{dateTime(event.occurredAt ?? event.createdAt ?? "")}</time>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
function auditMessage(event: AuditEvent): string {
  if (event.message) {
    return event.message;
  }
  if (typeof event.payload?.message === "string") {
    return event.payload.message;
  }
  return JSON.stringify(event.payload ?? {});
}
export function ToolCallHistory({
  calls,
  emptyMessage = "No tool calls are recorded in this history.",
}: {
  calls: ToolCall[];
  emptyMessage?: string;
}) {
  return (
    <div className="tool-call-history">
      {calls.map((call) => (
        <article className="tool-call-record" key={call.id}>
          <div className="tool-call-heading">
            <h4>{humanize(call.name)}</h4>
            <Status value={call.status} />
          </div>
          <p className="subtle-note">
            <time>{dateTime(call.createdAt)}</time>
            <span>{call.durationMs} ms</span>
          </p>
          <details className="tool-call-details">
            <summary>Recorded inputs and outcome</summary>
            <dl>
              <dt>Inputs</dt>
              <dd>
                <pre>{JSON.stringify(call.arguments, null, 2)}</pre>
              </dd>
              <dt>Outcome</dt>
              <dd>
                <pre>{JSON.stringify(call.result, null, 2)}</pre>
              </dd>
            </dl>
          </details>
        </article>
      ))}
      {calls.length ? null : <p className="inline-empty">{emptyMessage}</p>}
    </div>
  );
}
export function ActivityRecord({ runId }: { runId: string }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [calls, setCalls] = useState<ToolCall[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(
    async (offset: number, signal?: AbortSignal) => {
      setBusy(true);
      setError("");
      try {
        const page = await api<ActivityPage>(
          `/runs/${runId}/activity?offset=${offset}&limit=100`,
          { signal }
        );
        if (signal?.aborted) {
          return;
        }
        setEvents((prior) =>
          mergeHistory(offset === 0 ? [] : prior, page.items)
        );
        setCalls((prior) =>
          mergeHistory(offset === 0 ? [] : prior, page.toolCalls)
        );
        setNextOffset(page.hasMore ? page.nextOffset : null);
        setLoaded(true);
      } catch (e) {
        if (!signal?.aborted) {
          setError(errorMessage(e));
        }
      } finally {
        if (!signal?.aborted) {
          setBusy(false);
        }
      }
    },
    [runId]
  );
  useEffect(() => {
    const controller = new AbortController();
    load(0, controller.signal).catch(() => setBusy(false));
    return () => controller.abort();
  }, [load]);
  return (
    <div className="activity-record">
      <div className="activity-record-summary">
        <p>
          {events.length} audit events · {calls.length} tool calls loaded
        </p>
        <button
          aria-label="Refresh session record"
          className="icon-button"
          disabled={busy}
          onClick={() => load(0)}
          type="button"
        >
          <RefreshCw size={16} />
        </button>
      </div>
      <section aria-label="Audit events">
        <h3>Audit events</h3>
        <AuditTimeline events={events} />
        {loaded && !events.length ? (
          <p className="inline-empty">No audit events are recorded.</p>
        ) : null}
      </section>
      <section aria-label="Tool calls">
        <h3>Tool calls</h3>
        <ToolCallHistory
          calls={calls}
          emptyMessage={
            loaded
              ? "No tool calls are recorded in this history."
              : "Tool history will appear when the session record loads."
          }
        />
      </section>
      {error ? (
        <div className="notice danger" role="alert">
          {error}
        </div>
      ) : null}
      {nextOffset === null && loaded ? (
        <p className="subtle-note" role="status">
          All session history is loaded.
        </p>
      ) : null}
      {nextOffset === null ? null : (
        <button
          className="button"
          disabled={busy}
          onClick={() => load(nextOffset)}
          type="button"
        >
          {historyButtonLabel(busy, !!error)}
        </button>
      )}
    </div>
  );
}
function historyButtonLabel(busy: boolean, failed: boolean) {
  if (busy) {
    return "Loading session history…";
  }
  return failed ? "Retry loading history" : "Load more history";
}
function mergeHistory<T extends { id: string }>(prior: T[], next: T[]): T[] {
  const records = new Map(prior.map((item) => [item.id, item]));
  for (const item of next) {
    records.set(item.id, item);
  }
  return [...records.values()];
}
