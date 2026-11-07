/* biome-ignore-all lint/performance/noJsxPropsBind: React Compiler memoizes live-workspace handlers, including response-specific callbacks. */
"use client";

import "@tara/ui/assistant.css";
import "./assistant-workspace.css";
import "./product-glass.css";
import "./run-assistant-workspace.css";

import { AssistantModeControl } from "@tara/ui/components/assistant-controls";
import {
  AssistantGuidance,
  ReplyComposer,
} from "@tara/ui/components/assistant-guidance";
import {
  AssistantMark,
  AssistantStatus,
} from "@tara/ui/components/assistant-status";
import { Button } from "@tara/ui/components/button";
import { TaskStep } from "@tara/ui/components/task-step";
import type { AssistantMode, AssistantState } from "@tara/ui/lib/assistant";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Camera,
  CameraOff,
  Check,
  CircleHelp,
  FileText,
  Flag,
  LoaderCircle,
  MessageCircle,
  Mic,
  MicOff,
  PackageSearch,
  Pause,
  Play,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Volume2,
  VolumeX,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ProcedureRequirements } from "@/components/tara/procedure-requirements";
import { humanize } from "@/lib/api";
import type { Run, RunStep } from "@/lib/contracts";
import {
  getRunAssistantView,
  type RunAssistantView,
} from "@/lib/run-assistant";
import { useRunSession } from "@/lib/use-run-session";
import { LiveCamera } from "./live-camera";
import { PairPhoneCamera } from "./pair-phone-camera";
import { RunAssetLabel } from "./run-asset-label";
import { RunDetails } from "./run-details";

type RunSession = ReturnType<typeof useRunSession>;

function HeldStepAction({
  enabled,
  session,
  visual,
}: {
  enabled: boolean;
  session: RunSession;
  visual: boolean;
}) {
  const retest = async () => {
    if (!enabled || (visual && !session.camera)) {
      return;
    }
    const result = await session.action("run.control", { action: "retest" });
    if (result && visual) {
      await session.action("run.retry");
    }
  };
  return (
    <Button
      disabled={!enabled || (visual && !session.camera) || session.checking}
      onClick={retest}
      variant="outline"
    >
      <RefreshCw aria-hidden="true" />
      {visual ? "Retest current frame" : "Retest this step"}
    </Button>
  );
}

function StepActions({
  allStepsComplete,
  canOperate,
  onFinish,
  session,
  step,
}: {
  allStepsComplete: boolean;
  canOperate: boolean;
  onFinish: () => Promise<void>;
  session: RunSession;
  step?: RunStep;
}) {
  const enabled =
    canOperate &&
    session.connection === "connected" &&
    !session.busy &&
    session.run.status === "active";
  if (allStepsComplete) {
    return (
      <Button disabled={!enabled} onClick={onFinish}>
        <Check aria-hidden="true" />
        Complete &amp; generate report
      </Button>
    );
  }
  if (!step) {
    return null;
  }
  if (step.status === "held") {
    return (
      <HeldStepAction
        enabled={enabled}
        session={session}
        visual={step.verification.kind === "visual"}
      />
    );
  }
  if (step.verification.kind === "visual") {
    return (
      <Button
        disabled={!(enabled && session.camera) || session.checking}
        onClick={() => session.action("run.retry")}
      >
        {session.checking ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <ScanLine aria-hidden="true" />
        )}
        {session.checking ? "Checking current frame…" : "Check current frame"}
      </Button>
    );
  }
  const responses = step.verification.options?.length
    ? step.verification.options
    : [step.verification.acceptedResponse ?? "confirmed"];
  return (
    <div className="tara-live-responses">
      {responses.map((response) => (
        <Button
          disabled={!enabled}
          key={response}
          onClick={() => session.action("run.respond", { response })}
          variant="outline"
        >
          <Check aria-hidden="true" />
          {response === "confirmed"
            ? "I confirm this step"
            : humanize(response)}
        </Button>
      ))}
    </div>
  );
}

async function changeVideoSource(
  canOperate: boolean,
  open: boolean,
  session: RunSession
): Promise<void> {
  const { useLaptopCamera: switchToLaptop } = session;
  if (session.cameraSource === "phone") {
    if (canOperate && open) {
      await switchToLaptop();
    }
    return;
  }
  if (session.camera) {
    await session.toggleCamera();
    return;
  }
  if (canOperate && open) {
    await session.startCamera();
  }
}

function CameraSourceControl({
  canOperate,
  session,
}: {
  canOperate: boolean;
  session: RunSession;
}) {
  const open = ["active", "paused"].includes(session.run.status);
  const pending = Boolean(session.busy) || session.cameraBusy;
  const usingPhone = session.cameraSource === "phone";
  let CameraIcon = session.camera ? CameraOff : Camera;
  let cameraLabel = session.camera ? "Camera off" : "Use camera";
  if (usingPhone) {
    CameraIcon = Smartphone;
    cameraLabel = "Use laptop camera";
  }
  const changeCamera = async () => {
    await changeVideoSource(canOperate, open, session);
  };
  return (
    <Button
      disabled={
        usingPhone || !session.camera
          ? !(canOperate && open) || pending
          : session.cameraBusy
      }
      onClick={changeCamera}
      variant="ghost"
    >
      {session.cameraBusy ? (
        <LoaderCircle aria-hidden="true" className="animate-spin" />
      ) : (
        <CameraIcon aria-hidden="true" />
      )}
      {cameraLabel}
    </Button>
  );
}

function LiveMediaControls({
  canOperate,
  session,
}: {
  canOperate: boolean;
  session: RunSession;
}) {
  const open = ["active", "paused"].includes(session.run.status);
  const connected = session.connection === "connected";
  const pending = Boolean(session.busy) || session.cameraBusy;
  const paused = session.run.status === "paused";
  const audioUnavailable = session.muted || session.audioBlocked;
  return (
    <fieldset className="tara-media-controls tara-live-media">
      <legend className="sr-only">Live view controls</legend>
      <CameraSourceControl canOperate={canOperate} session={session} />
      <span aria-hidden="true" className="tara-control-divider" />
      <Button
        aria-pressed={paused}
        disabled={!(canOperate && connected && open) || pending}
        onClick={() =>
          session.action("run.control", { action: paused ? "resume" : "pause" })
        }
        variant="ghost"
      >
        {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
        {paused ? "Resume" : "Pause"}
      </Button>
      <Button
        disabled={!(canOperate && connected && open)}
        onClick={session.enableAudio}
        size="sm"
        title="Enable tara replies on your speaker"
        variant="ghost"
      >
        <Volume2 aria-hidden="true" />
        Enable speaker
      </Button>
      <Button
        aria-label={
          audioUnavailable ? "Enable assistant audio" : "Mute assistant audio"
        }
        aria-pressed={!audioUnavailable}
        disabled={!(canOperate && connected && open) || pending}
        onClick={session.toggleMute}
        size={session.audioBlocked ? "sm" : "icon"}
        title={
          audioUnavailable ? "Enable assistant audio" : "Mute assistant audio"
        }
        variant="ghost"
      >
        {audioUnavailable ? (
          <VolumeX aria-hidden="true" />
        ) : (
          <Volume2 aria-hidden="true" />
        )}
        {session.audioBlocked ? "Enable audio" : null}
      </Button>
    </fieldset>
  );
}

function useSuccessFeedback(
  completedSteps: number,
  status: AssistantState
): AssistantState {
  const previous = useRef(completedSteps);
  const [showSuccess, setShowSuccess] = useState(false);
  useEffect(() => {
    const increased = completedSteps > previous.current;
    previous.current = completedSteps;
    setShowSuccess(increased);
    if (!increased) {
      return;
    }
    const timer = window.setTimeout(() => setShowSuccess(false), 700);
    return () => window.clearTimeout(timer);
  }, [completedSteps]);
  return showSuccess && status === "active" ? "success" : status;
}

function RunCriteria({
  checking,
  currentAttemptId,
  step,
}: {
  checking: boolean;
  currentAttemptId: Run["currentAttemptId"];
  step?: RunStep;
}) {
  if (!step) {
    return null;
  }
  const latest = step.attempts.at(-1);
  const results =
    !checking && latest?.id === currentAttemptId
      ? (latest?.result.criteria ?? [])
      : [];
  return (
    <>
      {step.verification.criteria?.length ? (
        <ul className="tara-live-criteria">
          {step.verification.criteria.map((criterion) => (
            <li key={criterion.id}>{criterion.description}</li>
          ))}
        </ul>
      ) : null}
      {results.length ? (
        <section
          aria-label="Current criterion results"
          className="tara-live-results"
        >
          {results.map((criterion) => (
            <div data-verdict={criterion.verdict} key={criterion.id}>
              <strong>
                {humanize(criterion.id)} · {humanize(criterion.verdict)}
              </strong>
              <p>{criterion.reason}</p>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}

function RunConsultation({
  canOperate,
  session,
}: {
  canOperate: boolean;
  session: RunSession;
}) {
  const connected = session.connection === "connected";
  const active = session.run.status === "active";
  const consulting =
    connected && active && session.run.interactionMode === "consultation";
  const canAct = canOperate && connected && active && !session.busy;
  let composerStatus = connected
    ? "Resume listening to speak or type"
    : "Start the video session to speak or type";
  if (consulting) {
    composerStatus = session.microphone
      ? "Microphone on · you can speak or type"
      : "Microphone unavailable · type your question";
  }
  let speakerStatus = "Waiting for assistant audio";
  if (session.audioReady > 0) {
    speakerStatus = "Speaker connected";
  }
  if (session.audioBlocked) {
    speakerStatus = "Enable speaker to hear replies";
  }
  if (session.muted) {
    speakerStatus = "Speaker muted";
  }
  return (
    <>
      <div className="tara-consultation-control">
        <Button
          disabled={!canAct}
          onClick={session.consultation}
          variant="ghost"
        >
          <MessageCircle aria-hidden="true" />
          {consulting ? "Pause listening" : "Resume listening"}
        </Button>
        <span>{consulting ? "Listening" : "Listening paused"}</span>
      </div>
      <ReplyComposer
        disabled={!(canAct && consulting)}
        onSubmit={async (text) => {
          await session.action("assistant.text", { text });
        }}
        pending={session.busy === "assistant.text"}
        placeholder="Ask about this step…"
        statusMessage={composerStatus}
      />
      {session.transcript ? (
        <div className="tara-live-answer" role="status">
          <span>tara</span>
          <p>{session.transcript}</p>
        </div>
      ) : null}
      <p className="tara-live-microphone">
        {session.microphone ? (
          <Mic aria-hidden="true" />
        ) : (
          <MicOff aria-hidden="true" />
        )}
        {session.microphone ? "Microphone on" : "Microphone off"}
      </p>
      {connected ? (
        <p className="tara-live-microphone" role="status">
          <Volume2 aria-hidden="true" />
          {speakerStatus}
        </p>
      ) : null}
    </>
  );
}

function RunGuidance({
  canOperate,
  onFinish,
  onViewSop,
  session,
  status,
  view,
}: {
  canOperate: boolean;
  onFinish: () => Promise<void>;
  onViewSop: () => void;
  session: RunSession;
  status: AssistantState;
  view: RunAssistantView;
}) {
  const paused = session.run.status === "paused";
  return (
    <AssistantGuidance
      completedSteps={view.completedSteps}
      description={view.description}
      eyebrow={view.correction ? "Before you continue" : "Your current step"}
      hint={
        paused
          ? "Your procedure is paused. Resume when you are ready."
          : "Correct work stays quiet. Speak whenever you need help."
      }
      onViewSop={onViewSop}
      source={view.source}
      status={status}
      step={view.stepNumber}
      title={view.title}
      totalSteps={view.totalSteps}
    >
      <details className="tara-live-prerequisites" open={view.stepNumber === 1}>
        <summary>Scope and prerequisites</summary>
        <ProcedureRequirements
          compact
          prerequisites={session.run.sop.prerequisites}
          scope={session.run.sop.scope}
        />
      </details>
      {view.correction && view.step ? (
        <p className="tara-live-approved-step">
          <BookOpen aria-hidden="true" />
          Approved step: {view.step.title}
        </p>
      ) : null}
      <RunCriteria
        checking={session.checking}
        currentAttemptId={session.run.currentAttemptId}
        step={view.step}
      />
      {view.active ? (
        <div className="tara-live-step-actions">
          <StepActions
            allStepsComplete={view.allStepsComplete}
            canOperate={canOperate}
            onFinish={onFinish}
            session={session}
            step={view.step}
          />
        </div>
      ) : (
        <Link
          className="tara-live-report-link"
          href={
            session.run.reportId
              ? `/reports/${session.run.reportId}`
              : "/reports"
          }
        >
          Open service report
          <ArrowUpRight aria-hidden="true" />
        </Link>
      )}
      {paused ? (
        <Button
          disabled={
            !canOperate ||
            session.connection !== "connected" ||
            Boolean(session.busy)
          }
          onClick={() => session.action("run.control", { action: "resume" })}
          variant="outline"
        >
          <Play aria-hidden="true" />
          Resume assistant
        </Button>
      ) : null}
      {view.active ? (
        <RunConsultation canOperate={canOperate} session={session} />
      ) : null}
    </AssistantGuidance>
  );
}

export function RunAssistantWorkspace({
  initialRun,
  canOperate = false,
  canResolve = false,
}: {
  initialRun: Run;
  canOperate?: boolean;
  canResolve?: boolean;
}) {
  const session = useRunSession(initialRun);
  const { run, connection, busy } = session;
  const view = getRunAssistantView(run, connection, session.checking);
  const status = useSuccessFeedback(view.completedSteps, view.status);
  const router = useRouter();
  const [mode, setMode] = useState<AssistantMode>("demo");
  const [panel, setPanel] = useState("");
  const connected = connection === "connected";
  const paused = run.status === "paused";
  const canAct = canOperate && connected && run.status === "active" && !busy;
  const openSop = () => setPanel("Approved SOP");
  const finish = async () => {
    if (!(canAct && view.allStepsComplete)) {
      return;
    }
    const result = await session.action("run.finish", {
      outcome: "complete",
      reason: "",
    });
    if (
      result &&
      typeof result === "object" &&
      "reportId" in result &&
      typeof result.reportId === "string"
    ) {
      router.push(`/reports/${result.reportId}`);
    }
  };
  const usingPhone = session.cameraSource === "phone";
  const startVideo = usingPhone
    ? session.startPhoneSession
    : session.startSession;
  const startCamera = canOperate && view.active ? startVideo : undefined;
  return (
    <main
      className="tara-assistant tara-workspace tara-live-workspace"
      data-mode={mode}
      data-state={status}
    >
      <a className="tara-skip-link" href="#current-instruction">
        Skip to current instruction
      </a>
      <header className="tara-workspace-header">
        <Link aria-label="tara work queue" className="tara-brand" href="/">
          <AssistantMark />
          <span>
            tara<span className="tara-brand-period">.</span>
          </span>
        </Link>
        <div className="tara-brand-caption">
          <span className="tara-workspace-eyebrow">FIELD ASSISTANT</span>
          <span>Your work, in focus.</span>
        </div>
        <div className="tara-workspace-modes">
          <AssistantModeControl onValueChange={setMode} value={mode} />
        </div>
        <span className="tara-live-connection" role="status">
          {humanize(connection)}
        </span>
        <Button
          aria-label="Session help"
          className="tara-workspace-help"
          onClick={() => setPanel("Session help")}
          size="icon"
          variant="outline"
        >
          <CircleHelp />
        </Button>
      </header>
      <section
        aria-labelledby="workspace-title"
        className="tara-workspace-intro"
      >
        <div>
          <p className="tara-workspace-eyebrow">
            LIVE WORKSPACE <span>/</span>
            {run.workOrder.reference}
          </p>
          <h1 id="workspace-title">{run.workOrder.title}</h1>
        </div>
        <div className="tara-workspace-asset">
          <span className="tara-asset-icon">
            <Wrench aria-hidden="true" />
          </span>
          <div>
            <strong>{run.workOrder.asset.model}</strong>
            <span>{run.workOrder.asset.serial}</span>
          </div>
          <p>
            {run.sop.key}
            <br />v{run.sop.version}
          </p>
        </div>
      </section>
      <div className="tara-workspace-grid">
        <section
          aria-label="Work area and current instruction"
          className="tara-camera-card"
        >
          <LiveCamera
            busy={session.cameraBusy || connection === "connecting"}
            camera={session.camera}
            checking={session.checking}
            connection={connection}
            elapsedSeconds={run.elapsedSeconds}
            onStart={startCamera}
            paused={paused}
            running={run.status === "active"}
            startDescription={
              usingPhone
                ? "Open the paired phone page and tap Start phone camera. Keep the microphone and tara on this laptop."
                : undefined
            }
            startDisabled={!(canOperate && view.active) || Boolean(busy)}
            startLabel={usingPhone ? "Reconnect phone session" : undefined}
            status={status}
            stepLabel={
              view.allStepsComplete
                ? `${view.totalSteps}/${view.totalSteps} steps recorded`
                : `Step ${view.stepNumber}/${view.totalSteps}`
            }
            stream={session.cameraStream}
          >
            <LiveMediaControls canOperate={canOperate} session={session} />
          </LiveCamera>
          <div
            className="tara-workspace-current"
            data-correction={Boolean(view.correction)}
            id="current-instruction"
            tabIndex={-1}
          >
            <TaskStep
              description={view.description}
              title={view.title}
              verificationLabel={view.verificationLabel}
              verificationStatus={view.verificationStatus}
            >
              <button
                className="tara-source-button"
                onClick={openSop}
                type="button"
              >
                {view.source}
                <ArrowUpRight aria-hidden="true" />
              </button>
            </TaskStep>
          </div>
        </section>
        <aside aria-label="tara assistant" className="tara-workspace-assistant">
          <AssistantStatus status={status} />
          <RunGuidance
            canOperate={canOperate}
            onFinish={finish}
            onViewSop={openSop}
            session={session}
            status={status}
            view={view}
          />
          {canOperate && view.active ? (
            <>
              <RunAssetLabel
                canOperate={canOperate}
                run={run}
                session={session}
              />
              <PairPhoneCamera
                disabled={Boolean(busy) || session.cameraBusy}
                onConnect={session.startPhoneSession}
                onPairingChange={session.refreshPhonePairing}
                onUseLaptop={session.useLaptopCamera}
                pairing={session.phonePairing}
                phoneConnected={session.phoneConnected}
                runId={run.id}
              />
            </>
          ) : null}
        </aside>
      </div>
      {canOperate ? null : (
        <p className="tara-live-review-note">
          You are reviewing this session. Only the assigned technician can
          perform the work.
        </p>
      )}
      {session.error ? (
        <div className="tara-live-error" role="alert">
          <strong>Action needed</strong>
          <p>{session.error}</p>
          {!connected && canOperate && view.active ? (
            <Button
              disabled={session.cameraBusy || connection === "connecting"}
              onClick={session.startSession}
              variant="outline"
            >
              Reconnect video session
            </Button>
          ) : null}
        </div>
      ) : null}
      <output aria-atomic="true" className="sr-only">
        {view.title}. {view.description}
      </output>
      <footer className="tara-workspace-footer">
        <span>
          <ShieldCheck aria-hidden="true" />A guided session. A clear record.
        </span>
        <button onClick={() => setPanel("Parts inventory")} type="button">
          <PackageSearch aria-hidden="true" />
          Parts
        </button>
        <button onClick={() => setPanel("Evidence record")} type="button">
          <Camera aria-hidden="true" />
          Evidence<span>{run.evidence.length}</span>
        </button>
        <button
          onClick={() => setPanel("Supplementary references")}
          type="button"
        >
          <BookOpen aria-hidden="true" />
          References
        </button>
        <button onClick={() => setPanel("Session record")} type="button">
          <Activity aria-hidden="true" />
          Session record
          <span>
            {view.completedSteps}/{view.totalSteps} recorded
          </span>
          <ArrowUpRight aria-hidden="true" />
        </button>
        <button onClick={() => setPanel("Report a problem")} type="button">
          <Flag aria-hidden="true" />
          Problem / close
        </button>
        <button onClick={() => setPanel("Service reports")} type="button">
          <FileText aria-hidden="true" />
          Report
        </button>
      </footer>
      <RunDetails
        canOperate={canOperate}
        canResolve={canResolve}
        panel={panel}
        run={run}
        session={session}
        setPanel={setPanel}
      />
    </main>
  );
}
