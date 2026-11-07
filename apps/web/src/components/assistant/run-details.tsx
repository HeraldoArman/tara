"use client";

import { ArrowUpRight, CheckCircle2, Flag, PackageSearch } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";
import { ActivityRecord } from "@/components/tara/activity-record";
import { Drawer } from "@/components/tara/drawer";
import { Escalations } from "@/components/tara/escalations";
import { EvidenceRecords } from "@/components/tara/evidence";
import { ProcedureRequirements } from "@/components/tara/procedure-requirements";
import { ReferenceMediaCards } from "@/components/tara/reference-media";
import { ToolResults } from "@/components/tara/tool-results";
import { Status } from "@/components/tara/ui";
import { api, errorMessage } from "@/lib/api";
import type { List, Part, Run } from "@/lib/contracts";
import type { useRunSession } from "@/lib/use-run-session";

const presentationPanels: Record<string, string> = {
  activity: "Session record",
  evidence: "Evidence record",
  parts: "Parts lookup",
  references: "Supplementary references",
  report: "Service reports",
  sop: "Approved SOP",
};
const recordedStatuses = new Set([
  "ai_verified",
  "attested",
  "complete",
  "skipped",
]);

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Named panels preserve the execution record and share a single accessible dialog.
export function RunDetails({
  run,
  session,
  canOperate,
  canResolve,
  panel,
  setPanel,
}: {
  run: Run;
  session: ReturnType<typeof useRunSession>;
  canOperate: boolean;
  canResolve: boolean;
  panel: string;
  setPanel: (panel: string) => void;
}) {
  const router = useRouter();
  const [parts, setParts] = useState<Part[]>([]);
  const [panelError, setPanelError] = useState("");
  const [reason, setReason] = useState("");
  const active = ["active", "paused"].includes(run.status);
  const actionable =
    canOperate && session.connection === "connected" && active && !session.busy;
  const allRecorded =
    run.steps.length > 0 &&
    run.steps.every((step) => recordedStatuses.has(step.status));

  useEffect(() => {
    const name = session.presentation?.panel;
    if (typeof name === "string" && presentationPanels[name]) {
      setPanel(presentationPanels[name]);
    }
  }, [session.presentation, setPanel]);

  useEffect(() => {
    setPanelError("");
    if (panel !== "Parts inventory" && panel !== "Parts lookup") {
      return;
    }
    if (
      panel === "Parts lookup" &&
      session.presentation?.panel === "parts" &&
      Array.isArray(session.presentation.items)
    ) {
      setParts(session.presentation.items as Part[]);
      return;
    }
    let cancelled = false;
    api<List<Part>>("/parts")
      .then((result) => {
        if (!cancelled) {
          setParts(result.items);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPanelError(errorMessage(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [panel, session.presentation]);

  const closePanel = useCallback(() => setPanel(""), [setPanel]);
  const changeReason = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setReason(event.target.value);
    },
    []
  );
  const { action } = session;
  const finish = useCallback(
    async (outcome: "complete" | "partial") => {
      const result = await action("run.finish", { outcome, reason });
      if (result && typeof result === "object") {
        const { reportId } = result as { reportId?: string };
        router.push(reportId ? `/reports/${reportId}` : "/reports");
      }
    },
    [action, reason, router]
  );
  const finishPartial = useCallback(() => finish("partial"), [finish]);
  const finishComplete = useCallback(() => finish("complete"), [finish]);
  const recordIssue = useCallback(
    () =>
      action("run.issue", {
        escalate: true,
        kind: "deviation",
        note: reason,
      }),
    [action, reason]
  );

  return (
    <Drawer onClose={closePanel} open={!!panel} title={panel}>
      {panelError ? (
        <div className="notice danger" role="alert">
          {panelError}
        </div>
      ) : null}
      {panel === "Session help" ? (
        <div className="problem-form">
          <p className="lede">
            Start the bench camera to connect to TARa and share your work area.
            Microphone access is requested only when you choose Ask TARA.
          </p>
          <p>
            Follow the current instruction. Visual checkpoints use camera
            evidence; confirmation and choice steps use your recorded response.
            TARa stays quiet during correct work and shows corrections when a
            check needs attention.
          </p>
          <p>
            Pause stops execution checks. Resume continues the same step. Use
            Session record or Evidence to review recorded work, and Problem /
            close to record an issue or close with unresolved work.
          </p>
        </div>
      ) : null}
      {panel === "Approved SOP" ? (
        <>
          {session.presentation?.panel === "sop" &&
          Array.isArray(session.presentation.items) ? (
            <ToolResults data={session.presentation} />
          ) : null}
          <div className="drawer-summary">
            <span className="eyebrow">PINNED VERSION {run.sop.version}</span>
            <h3>{run.sop.title}</h3>
            <p>{run.sop.key}</p>
          </div>
          <ProcedureRequirements
            prerequisites={run.sop.prerequisites}
            scope={run.sop.scope}
          />
          <ReferenceMediaCards items={run.media ?? []} />
          {run.steps.map((step, index) => (
            <section
              aria-current={step.id === run.currentStepId ? "step" : undefined}
              className="sop-step"
              key={step.id}
            >
              <div>
                <span className="step-index">{index + 1}</span>
                <h3>{step.title}</h3>
                <Status value={step.status} />
              </div>
              <p>{step.instruction}</p>
              {step.rationale ? (
                <div className="rationale">
                  <strong>Why this matters</strong>
                  <p>{step.rationale}</p>
                </div>
              ) : null}
              <p className="subtle-note">
                {step.sources
                  .map((source) =>
                    [
                      source.heading ?? source.section,
                      source.page ? `Page ${source.page}` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  )
                  .join(" / ")}
              </p>
            </section>
          ))}
        </>
      ) : null}
      {panel === "Session record" ? (
        <ActivityRecord key={run.id} runId={run.id} />
      ) : null}
      {panel === "Evidence record" ? (
        <EvidenceRecords evidence={run.evidence} />
      ) : null}
      {panel === "Supplementary references" ? (
        <ToolResults data={session.presentation} />
      ) : null}
      {panel === "Parts inventory" || panel === "Parts lookup" ? (
        <>
          <p className="lede">
            Organization inventory. Verify compatibility against the approved
            procedure.
          </p>
          {parts.map((part) => (
            <div className="part-card" key={part.id}>
              <PackageSearch size={23} />
              <div>
                <h3>{part.name}</h3>
                <span className="mono">{part.sku}</span>
                <p>
                  {part.location} · {part.stock ?? part.quantity ?? 0} in stock
                </p>
              </div>
              {part.price !== undefined || part.priceCents !== undefined ? (
                <strong>
                  {new Intl.NumberFormat("en", {
                    currency: part.currency ?? "IDR",
                    maximumFractionDigits: 0,
                    style: "currency",
                  }).format(part.price ?? (part.priceCents ?? 0) / 100)}
                </strong>
              ) : null}
            </div>
          ))}
          {parts.length || panelError ? null : (
            <p className="inline-empty">No matching inventory records.</p>
          )}
        </>
      ) : null}
      {panel === "Service reports" ? (
        <div className="problem-form">
          <p className="lede">
            Review complete and partial execution reports, including every
            attempt and exception.
          </p>
          <Link
            className="button primary"
            href={run.reportId ? `/reports/${run.reportId}` : "/reports"}
          >
            Open service reports
            <ArrowUpRight size={15} />
          </Link>
        </div>
      ) : null}
      {panel === "Report a problem" ? (
        <div className="problem-form">
          <Escalations
            canResolve={canResolve}
            items={run.escalations}
            onResolved={session.refresh}
          />
          <p className="lede">
            Keep unresolved work visible. A partial report preserves held and
            unreached steps.
          </p>
          <label htmlFor="problem-reason">What needs attention?</label>
          <textarea
            disabled={!(canOperate && active)}
            id="problem-reason"
            onChange={changeReason}
            placeholder="Describe the issue or the reason for partial closure"
            rows={5}
            value={reason}
          />
          <button
            className="button"
            disabled={!(actionable && reason.trim())}
            onClick={recordIssue}
            type="button"
          >
            <Flag size={16} />
            Record problem & request escalation
          </button>
          <button
            className="button"
            disabled={!(actionable && reason.trim())}
            onClick={finishPartial}
            type="button"
          >
            Close with unresolved work
          </button>
          <button
            className="button primary"
            disabled={!(actionable && allRecorded)}
            onClick={finishComplete}
            type="button"
          >
            <CheckCircle2 size={16} />
            Complete & generate report
          </button>
          {run.reportId ? (
            <Link className="button" href={`/reports/${run.reportId}`}>
              Open report
              <ArrowUpRight size={15} />
            </Link>
          ) : null}
          {session.error ? (
            <p className="notice danger" role="alert">
              {session.error}
            </p>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}
