"use client";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Camera,
  CameraOff,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Expand,
  FileText,
  Flag,
  Layers,
  LoaderCircle,
  LockKeyhole,
  Mic,
  MicOff,
  PackageSearch,
  Pause,
  Play,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, duration, errorMessage, humanize } from "@/lib/api";
import type { List, Part, Run } from "@/lib/contracts";
import { useRunSession } from "@/lib/use-run-session";
import { ActivityRecord } from "./activity-record";
import { Drawer } from "./drawer";
import { Escalations } from "./escalations";
import { EvidenceRecords } from "./evidence";
import { ProcedureRequirements } from "./procedure-requirements";
import { ReferenceMediaCards } from "./reference-media";
import { ToolResults } from "./tool-results";
import { Status, Wordmark } from "./ui";

const acceptedStatuses = [
  "ai_verified",
  "attested",
  "verified",
  "complete",
  "passed",
  "completed",
];
const presentationPanels: Record<string, string> = {
  activity: "Session record",
  evidence: "Evidence record",
  parts: "Parts inventory",
  references: "Supplementary references",
  report: "Service reports",
  sop: "Approved SOP",
};
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This render composes the camera, authoritative checklist and named detail panels; mutation logic is isolated in useRunSession.
export function Workspace({
  initialRun,
  canOperate = true,
  canResolve = false,
}: {
  initialRun: Run;
  canOperate?: boolean;
  canResolve?: boolean;
}) {
  const session = useRunSession(initialRun);
  const {
    run,
    connection,
    error,
    busy,
    camera,
    microphone,
    muted,
    transcript,
    video,
  } = session;
  const router = useRouter();
  const [layout, setLayout] = useState("demo");
  const [panel, setPanel] = useState("");
  const [parts, setParts] = useState<Part[]>([]);
  const [panelError, setPanelError] = useState("");
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [elapsed, setElapsed] = useState(initialRun.elapsedSeconds);
  const step = run.steps.find((item) => item.id === run.currentStepId);
  const index = run.steps.findIndex((item) => item.id === run.currentStepId);
  const complete = run.steps.filter((item) =>
    acceptedStatuses.includes(item.status)
  ).length;
  const consulting =
    connection === "connected" && run.interactionMode === "consultation";
  const latestAlert = run.alerts
    .filter((item) => item.stepId === run.currentStepId)
    .at(-1);
  const active = ["active", "paused"].includes(run.status);
  const connected = connection === "connected";
  const scanning = busy === "run.retry" || session.checking;
  useEffect(() => {
    const payload = session.presentation;
    if (!payload || typeof payload.panel !== "string") {
      return;
    }
    const title = presentationPanels[payload.panel];
    if (!title) {
      return;
    }
    setPanel(title);
    setPanelError("");
    if (payload.panel === "parts" && Array.isArray(payload.items)) {
      setParts(payload.items as Part[]);
      return;
    }
    const loadPanel = async () => {
      if (payload.panel === "parts") {
        const result = await api<List<Part>>("/parts");
        setParts(result.items);
      }
    };
    loadPanel().catch((e: unknown) => setPanelError(errorMessage(e)));
  }, [session.presentation]);
  useEffect(() => {
    setElapsed(run.elapsedSeconds);
    if (run.status !== "active") {
      return;
    }
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [run.elapsedSeconds, run.status]);
  const openPanel = async (name: string) => {
    setPanel(name);
    setPanelError("");
    try {
      if (name === "Parts inventory") {
        const result = await api<List<Part>>("/parts");
        setParts(result.items);
      }
    } catch (e) {
      setPanelError(errorMessage(e));
    }
  };
  const finish = async (outcome: string) => {
    const result = await session.action("run.finish", { outcome, reason });
    if (result && typeof result === "object") {
      const value = result as { reportId?: string };
      if (value.reportId) {
        router.push(`/reports/${value.reportId}`);
      } else {
        router.push("/reports");
      }
    }
  };
  const send = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!text.trim()) {
      return;
    }
    const content = text.trim();
    setText("");
    await session.action("assistant.text", { text: content });
  };
  const state = workspaceTone(consulting, !!latestAlert, run.status);
  return (
    <main className="workspace-page" data-state={state} data-view={layout}>
      <div aria-hidden="true" className="workspace-ambience" />
      <header className="workspace-header">
        <Wordmark />
        <span className="header-rule" />
        <div className="workspace-brand-copy">
          <span className="eyebrow">FIELD ASSISTANT</span>
          <span>Your work, in focus.</span>
        </div>
        <fieldset
          aria-label="Workspace layout"
          className="segmented glass layout-toggle"
        >
          <button
            aria-pressed={layout === "demo"}
            onClick={() => setLayout("demo")}
            type="button"
          >
            <Layers size={14} />
            Demo<span> mode</span>
          </button>
          <button
            aria-pressed={layout === "product"}
            onClick={() => setLayout("product")}
            type="button"
          >
            <Expand size={14} />
            Product<span> mode</span>
          </button>
        </fieldset>
        <Link
          aria-label="Back to work queue"
          className="icon-button queue-back"
          href="/"
        >
          <ArrowLeft size={19} />
        </Link>
      </header>
      <div className="workspace-main">
        <div className="session-heading">
          <div>
            <p className="eyebrow">
              LIVE WORKSPACE <span>/</span> {run.workOrder.reference}
            </p>
            <h1>Let’s get this working.</h1>
          </div>
          <div className="job-context">
            <span className="job-icon">
              <WrenchIcon />
            </span>
            <div>
              <strong>{run.workOrder.asset.model}</strong>
              <span>{run.workOrder.title}</span>
            </div>
            <span className="mono">
              {run.sop.key}
              <b>v{run.sop.version}</b>
            </span>
          </div>
        </div>
        <div className="live-workspace">
          <section
            aria-label="Live bench camera"
            className="camera-stage glass"
          >
            <div className="stage-media">
              <video
                aria-label="Your live bench camera"
                autoPlay
                muted
                playsInline
                ref={video}
              />
              {camera ? null : (
                <div className="camera-empty">
                  <div className="camera-empty-icon">
                    <Camera size={36} />
                  </div>
                  <h2>A clearer view of your work.</h2>
                  <p>
                    Connect the assistant, then turn on your bench camera.
                    <br />
                    Only required checks send a still frame for analysis.
                  </p>
                  <button
                    className="button camera-start"
                    disabled={!canOperate || connection === "connecting"}
                    onClick={connected ? session.toggleCamera : session.connect}
                    type="button"
                  >
                    {connection === "connecting" ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Camera size={16} />
                    )}{" "}
                    {connected ? "Enable bench camera" : "Connect assistant"}
                    <ArrowRight size={15} />
                  </button>
                </div>
              )}
              <div aria-hidden="true" className="stage-shade" />
              <div className="stage-hud top-left">
                <span className="rec-dot" />
                {camera ? "LIVE VIEW" : "CAMERA OFF"}
                <span className="stage-chip">
                  {connected ? "Connected" : humanize(connection)}
                </span>
              </div>
              <div className="stage-hud top-right">
                <Clock3 size={13} />
                {duration(elapsed)}
              </div>
              {camera ? (
                <div aria-hidden="true" className="viewfinder">
                  <i />
                  <i />
                  <i />
                  <i />
                  <span>WORK AREA</span>
                </div>
              ) : null}
              <div className="stage-hud bottom-left">
                <ShieldCheck size={14} />
                <span>{cameraStatus(scanning, camera)}</span>
              </div>
              <div className="stage-hud bottom-right">
                {index >= 0
                  ? `STEP ${index + 1} / ${run.steps.length}`
                  : humanize(run.status)}
              </div>
              {scanning ? (
                <div className="scan-overlay">
                  <div />
                  <span>Checking the current frame…</span>
                </div>
              ) : null}
              <div className="camera-controls glass">
                <button
                  disabled={!connected || !!busy}
                  onClick={session.toggleCamera}
                  type="button"
                >
                  {camera ? <CameraOff size={16} /> : <Camera size={16} />}
                  <span>{camera ? "Camera off" : "Use camera"}</span>
                </button>
                <span className="control-divider" />
                <button
                  disabled={!(connected && active) || !!busy}
                  onClick={() =>
                    session.action("run.control", {
                      action: run.status === "paused" ? "resume" : "pause",
                    })
                  }
                  type="button"
                >
                  {run.status === "paused" ? (
                    <Play size={15} />
                  ) : (
                    <Pause size={15} />
                  )}
                  <span>{run.status === "paused" ? "Resume" : "Pause"}</span>
                </button>
                <span className="control-divider" />
                <button
                  aria-label={
                    muted
                      ? "Unmute assistant replies"
                      : "Mute assistant replies"
                  }
                  aria-pressed={muted}
                  disabled={!connected}
                  onClick={session.toggleMute}
                  type="button"
                >
                  {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                </button>
              </div>
            </div>
            <footer className="stage-footer">
              <span className="stage-footer-icon">
                <ScanLine size={19} />
              </span>
              <div>
                <strong>{step?.title ?? "Session closed"}</strong>
                <span>
                  {step?.verification.kind === "visual"
                    ? "Hold the required detail clearly in view"
                    : humanize(step?.verification.kind ?? run.status)}
                </span>
              </div>
              <span className="stage-quality">
                LIVE
                <span />
              </span>
            </footer>
          </section>
          <aside className="assistant-column">
            <section
              aria-label="Assistant interaction mode"
              className="assistant-state glass"
            >
              <div
                aria-hidden="true"
                className={`state-orbit ${scanning ? "is-working" : ""}`}
              >
                <span className="tara-mark">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <div>
                <p className="eyebrow">
                  TARA IS <span className="state-dot" />
                </p>
                <h2>{assistantTitle(consulting, !!latestAlert)}</h2>
                <p>{assistantDescription(consulting, microphone, connected)}</p>
              </div>
              <Sparkles className="state-spark" size={19} />
            </section>
            <section
              aria-label="Current guidance"
              className="guidance-card glass"
            >
              <header>
                <span className="eyebrow">
                  <span className="state-dot" /> IN THE MOMENT
                </span>
                <span>
                  Step {Math.max(1, index + 1)} of {run.steps.length}
                </span>
              </header>
              <div className="guidance-content">
                <details className="workspace-prerequisites" open={index === 0}>
                  <summary>Scope and prerequisites</summary>
                  <ProcedureRequirements
                    compact
                    prerequisites={run.sop.prerequisites}
                    scope={run.sop.scope}
                  />
                </details>
                <p className="focus-kicker">
                  <BookOpen size={14} />
                  {run.sop.title}
                </p>
                <h2>
                  {step?.title ??
                    (active
                      ? "All required steps recorded."
                      : "Your session is recorded.")}
                </h2>
                <p className="focus-copy">
                  {step?.instruction ??
                    (active
                      ? "Complete the session to generate your service report."
                      : "Open the report to review the work, evidence and unresolved issues.")}
                </p>
                {step?.sources.length ? (
                  <p className="focus-source">
                    <FileText size={12} />
                    {step.sources
                      .map((source) =>
                        [
                          source.heading,
                          source.page ? `p. ${source.page}` : source.section,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      )
                      .join(" / ")}
                  </p>
                ) : null}
                {step?.verification.criteria?.length ? (
                  <ul className="criterion-list">
                    {step.verification.criteria.map((criterion) => (
                      <li key={criterion.id}>
                        <span />
                        <span>{criterion.description}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {step?.attempts.at(-1)?.result.criteria?.length ? (
                  <div className="current-criterion-results">
                    {step.attempts.at(-1)?.result.criteria?.map((criterion) => (
                      <div className="attempt-criterion" key={criterion.id}>
                        <Status value={criterion.verdict} />
                        <p>
                          <strong>{humanize(criterion.id)}</strong> ·{" "}
                          {criterion.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
                {latestAlert ? (
                  <div className="execution-alert" role="status">
                    <CircleAlert size={17} />
                    <div>
                      <strong>{latestAlert.message}</strong>
                      {latestAlert.nextAction ? (
                        <p>{latestAlert.nextAction}</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {step && active ? (
                  <div className="step-actions">
                    {step.verification.kind === "visual" ? (
                      <button
                        className="button primary"
                        disabled={
                          !(connected && camera) ||
                          !!busy ||
                          run.status === "paused"
                        }
                        onClick={() => session.action("run.retry")}
                        type="button"
                      >
                        {scanning ? (
                          <LoaderCircle className="spin" size={16} />
                        ) : (
                          <ScanLine size={16} />
                        )}{" "}
                        {visualCheckLabel(scanning, step.attempts.length)}
                      </button>
                    ) : null}
                    {["attestation", "finalization"].includes(
                      step.verification.kind
                    )
                      ? (step.verification.options?.length
                          ? step.verification.options
                          : [step.verification.acceptedResponse ?? "confirmed"]
                        ).map((option) => (
                          <button
                            className="button"
                            disabled={
                              !connected || !!busy || run.status === "paused"
                            }
                            key={option}
                            onClick={() =>
                              session.action("run.respond", {
                                response: option,
                              })
                            }
                            type="button"
                          >
                            <Check size={16} />
                            {option === "confirmed"
                              ? "I confirm this step"
                              : humanize(option)}
                          </button>
                        ))
                      : null}
                    {step.verification.kind === "choice"
                      ? step.verification.options?.map((option) => (
                          <button
                            className="button choice-button"
                            disabled={
                              !connected || !!busy || run.status === "paused"
                            }
                            key={option}
                            onClick={() =>
                              session.action("run.respond", {
                                response: option,
                              })
                            }
                            type="button"
                          >
                            {humanize(option)}
                            <ArrowRight size={15} />
                          </button>
                        ))
                      : null}
                    {step.status === "held" ? (
                      <button
                        className="button"
                        disabled={!connected || !!busy}
                        onClick={() =>
                          session.action("run.control", { action: "retest" })
                        }
                        type="button"
                      >
                        <RefreshCw size={15} />
                        Retest this step
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {active && complete === run.steps.length ? (
                  <button
                    className="button primary"
                    disabled={!connected || !!busy}
                    onClick={() => finish("complete")}
                    type="button"
                  >
                    <CheckCircle2 size={16} />
                    Complete & generate report
                  </button>
                ) : null}
                {active ? null : (
                  <Link
                    className="button primary"
                    href={
                      run.reportId ? `/reports/${run.reportId}` : "/reports"
                    }
                  >
                    Open service report
                    <ArrowUpRight size={15} />
                  </Link>
                )}
                {consulting && transcript ? (
                  <div className="consultation-answer">
                    <span className="eyebrow">TARA</span>
                    <p>{transcript}</p>
                  </div>
                ) : null}
              </div>
              <div className="guidance-bottom">
                <button
                  aria-pressed={consulting}
                  className={`button ${consulting ? "consultation-active" : "primary"} ask-button`}
                  disabled={!connected || !!busy || !active}
                  onClick={session.consultation}
                  type="button"
                >
                  {consulting ? <MicOff size={16} /> : <Sparkles size={16} />}{" "}
                  {consulting ? "Return to silent mode" : "Ask TARa"}
                </button>
                <div className="voice-status">
                  {microphone ? <Mic size={13} /> : <MicOff size={13} />}{" "}
                  {microphoneDescription(consulting, microphone)}
                </div>
                <form className="composer" onSubmit={send}>
                  <input
                    aria-label="Message TARa"
                    disabled={!(consulting && connected) || !!busy}
                    onChange={(event) => setText(event.target.value)}
                    placeholder={
                      consulting
                        ? "Ask about this step…"
                        : "Activate Ask TARa to type"
                    }
                    value={text}
                  />
                  <button
                    aria-label="Send message"
                    disabled={!(consulting && text.trim()) || !!busy}
                    type="submit"
                  >
                    <ArrowUp size={18} />
                  </button>
                </form>
                <div
                  aria-label="Procedure progress"
                  aria-valuemax={run.steps.length}
                  aria-valuemin={0}
                  aria-valuenow={complete}
                  className="procedure-progress"
                  role="progressbar"
                >
                  <span
                    style={{
                      width: `${(100 * complete) / Math.max(1, run.steps.length)}%`,
                    }}
                  />
                </div>
                <div className="guidance-meta">
                  <span>
                    {complete} of {run.steps.length} verified
                  </span>
                  <button
                    onClick={() => openPanel("Approved SOP")}
                    type="button"
                  >
                    View SOP
                    <ArrowUpRight size={12} />
                  </button>
                </div>
              </div>
            </section>
          </aside>
        </div>
        {canOperate ? null : (
          <div className="notice info">
            You are reviewing this session. Only the assigned technician can
            perform execution actions.
          </div>
        )}
        {error ? (
          <div className="notice danger workspace-error" role="alert">
            <CircleAlert size={18} />
            <div>
              <strong>Action needed</strong>
              <p>{error}</p>
              {connected ? null : (
                <button
                  className="text-button"
                  disabled={!canOperate || connection === "connecting"}
                  onClick={session.connect}
                  type="button"
                >
                  Reconnect assistant
                </button>
              )}
            </div>
          </div>
        ) : null}
        <div className="workspace-below">
          <section aria-label="Procedure checklist" className="checklist-strip">
            {run.steps.map((item, i) => (
              <div
                aria-current={
                  item.id === run.currentStepId ? "step" : undefined
                }
                className={`checklist-item ${item.status}`}
                key={item.id}
              >
                <span className="checklist-number">
                  <ChecklistNumber index={i} status={item.status} />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <span>{humanize(item.status)}</span>
                </div>
              </div>
            ))}
          </section>
          <footer className="workspace-footer">
            <span>
              <ShieldCheck size={14} />A guided session. A clear record.
            </span>
            <div>
              <button
                onClick={() => openPanel("Parts inventory")}
                type="button"
              >
                <PackageSearch size={14} />
                Parts
              </button>
              <button
                onClick={() => openPanel("Evidence record")}
                type="button"
              >
                <Camera size={14} />
                Evidence · {run.evidence.length}
              </button>
              <button onClick={() => openPanel("Session record")} type="button">
                <Activity size={14} />
                Session record
                <ArrowUpRight size={12} />
              </button>
              <button
                onClick={() => setPanel("Report a problem")}
                type="button"
              >
                <Flag size={14} />
                Problem / close
              </button>
            </div>
          </footer>
        </div>
      </div>
      <div aria-live="polite" className="sr-only">
        {step
          ? `Current step: ${step.title}. ${humanize(step.status)}.`
          : `Run ${run.status}.`}
        {latestAlert?.message}
      </div>
      <Drawer onClose={() => setPanel("")} open={!!panel} title={panel}>
        {panelError ? <div className="notice danger">{panelError}</div> : null}
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
            {run.steps.map((item, i) => (
              <section className="sop-step" key={item.id}>
                <div>
                  <span className="step-index">{i + 1}</span>
                  <h3>{item.title}</h3>
                  <Status value={item.status} />
                </div>
                <p>{item.instruction}</p>
                {item.rationale ? (
                  <div className="rationale">
                    <strong>Why this matters</strong>
                    <p>{item.rationale}</p>
                  </div>
                ) : null}
                <p className="subtle-note">
                  {item.sources
                    .map(
                      (source) =>
                        source.heading ??
                        source.section ??
                        `Page ${source.page}`
                    )
                    .join(" · ")}
                </p>
              </section>
            ))}
          </>
        ) : null}
        {panel === "Session record" ? (
          <ActivityRecord key={run.id} runId={run.id} />
        ) : null}
        {panel === "Parts inventory" ? (
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
                    {part.location} · {part.stock ?? part.quantity ?? 0} in
                    stock
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
        {panel === "Evidence record" ? (
          <EvidenceRecords evidence={run.evidence} />
        ) : null}
        {panel === "Supplementary references" ? (
          <ToolResults data={session.presentation} />
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
              id="problem-reason"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Describe the issue or the reason for partial closure"
              rows={5}
              value={reason}
            />
            <button
              className="button"
              disabled={!(reason.trim() && connected) || !!busy}
              onClick={() =>
                session.action("run.issue", {
                  escalate: true,
                  kind: "deviation",
                  note: reason,
                })
              }
              type="button"
            >
              <Flag size={16} />
              Record problem & request escalation
            </button>
            <button
              className="button"
              disabled={!(reason.trim() && connected) || !!busy || !active}
              onClick={() => finish("partial")}
              type="button"
            >
              Close with unresolved work
            </button>
            <button
              className="button primary"
              disabled={
                !connected || !!busy || !active || complete !== run.steps.length
              }
              onClick={() => finish("complete")}
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
          </div>
        ) : null}
      </Drawer>
    </main>
  );
}
function WrenchIcon() {
  return <ScanLine size={23} />;
}

function workspaceTone(consulting: boolean, hasAlert: boolean, status: string) {
  if (hasAlert && !consulting) {
    return "warning";
  }
  if (consulting) {
    return "active";
  }
  if (status === "complete") {
    return "success";
  }
  return "sleep";
}
function cameraStatus(scanning: boolean, camera: boolean) {
  if (scanning) {
    return "Checking this frame…";
  }
  if (camera) {
    return "Live preview · checks on demand";
  }
  return "No video is being captured";
}
function assistantTitle(consulting: boolean, hasAlert: boolean) {
  if (consulting) {
    return "Listening";
  }
  if (hasAlert) {
    return "Attention needed";
  }
  return "Quietly here";
}
function assistantDescription(
  consulting: boolean,
  microphone: boolean,
  connected: boolean
) {
  if (consulting && microphone) {
    return "Microphone on · ready for your question.";
  }
  if (consulting) {
    return "Consultation active · type below.";
  }
  if (connected) {
    return "Silent mode. Ready when you need me.";
  }
  return "Connect to continue your procedure.";
}
function visualCheckLabel(scanning: boolean, attempts: number) {
  if (scanning) {
    return "Checking frame…";
  }
  if (attempts) {
    return "Retry visual check";
  }
  return "Check current frame";
}
function microphoneDescription(consulting: boolean, microphone: boolean) {
  if (consulting && microphone) {
    return "Listening · microphone enabled";
  }
  if (consulting) {
    return "Text consultation active";
  }
  return "Microphone off · silent execution";
}
function ChecklistNumber({ status, index }: { status: string; index: number }) {
  if (acceptedStatuses.includes(status)) {
    return <Check size={15} />;
  }
  if (status === "locked") {
    return <LockKeyhole size={13} />;
  }
  return <>{index + 1}</>;
}
