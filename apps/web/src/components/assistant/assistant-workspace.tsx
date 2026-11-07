"use client";

import "@tara/ui/assistant.css";
import "./assistant-workspace.css";
import "./product-glass.css";

import {
  AssistantModeControl,
  AssistantStateControl,
  MediaControls,
} from "@tara/ui/components/assistant-controls";
import {
  AssistantMark,
  AssistantStatus,
} from "@tara/ui/components/assistant-status";
import { Button } from "@tara/ui/components/button";
import { TaskStep } from "@tara/ui/components/task-step";
import { useAssistantAudio } from "@tara/ui/hooks/use-assistant-audio";
import type {
  AssistantMode,
  AssistantState,
  AssistantStateSelection,
  CameraSource,
} from "@tara/ui/lib/assistant";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  CircleHelp,
  RotateCcw,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { CameraPreview } from "./camera-preview";
import { previewSteps, previewTask } from "./preview-data";
import { type PreviewDetail, PreviewDetails } from "./preview-details";
import { PreviewGuidance } from "./preview-guidance";
import { getPreviewInstruction } from "./preview-instruction";
import {
  completedPreviewSteps,
  initialPreviewProgress,
  previewProgressReducer,
} from "./preview-progress";
import { useCamera } from "./use-camera";

const SUCCESS_PREVIEW_DURATION_MS = 700;

function resolvePreviewState(
  selection: AssistantStateSelection,
  paused: boolean
): AssistantState {
  if (paused) {
    return "sleep";
  }
  return selection === "auto" ? "active" : selection;
}

export function AssistantWorkspace() {
  const [mode, setMode] = useState<AssistantMode>("demo");
  const [selection, setSelection] = useState<AssistantStateSelection>("auto");
  const [paused, setPaused] = useState(false);
  const [detail, setDetail] = useState<PreviewDetail>(null);
  const [progress, dispatchProgress] = useReducer(
    previewProgressReducer,
    initialPreviewProgress
  );
  const successTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRef = useRef<AssistantState>("active");
  const camera = useCamera();
  const {
    enabled: audioEnabled,
    playTransition,
    setEnabled: setAudioEnabled,
  } = useAssistantAudio();
  const status = resolvePreviewState(selection, paused);
  const resting = status === "sleep";
  const complete = progress.phase === "complete";
  const stepSucceeded = progress.phase !== "working";
  const instruction = getPreviewInstruction(progress, selection, paused);
  const currentStep = previewSteps[progress.stepIndex] ?? previewSteps[0];
  const stepNumber = progress.stepIndex + 1;
  const totalSteps = previewSteps.length;
  const completedStepCount = completedPreviewSteps(progress);
  const source = `${previewTask.sop} ${currentStep.clause} · ${previewTask.version}`;

  const clearSuccessTimeout = useCallback(() => {
    if (successTimeout.current !== null) {
      clearTimeout(successTimeout.current);
      successTimeout.current = null;
    }
  }, []);

  useEffect(() => clearSuccessTimeout, [clearSuccessTimeout]);

  const finishStep = useCallback(() => {
    dispatchProgress({ type: "advance" });
    successTimeout.current = null;
    // Advancing the SOP must not override a newer Pause or manual state choice.
    if (statusRef.current === "success") {
      playTransition("success", "active");
      statusRef.current = "active";
      setSelection("active");
    }
  }, [playTransition]);

  const changeState = useCallback(
    (value: AssistantStateSelection) => {
      if (value === "success") {
        if (
          progress.phase !== "working" ||
          successTimeout.current !== null ||
          selection === "warning"
        ) {
          return;
        }
        dispatchProgress({ type: "complete-step" });
        successTimeout.current = setTimeout(
          finishStep,
          SUCCESS_PREVIEW_DURATION_MS
        );
      }
      const nextStatus = resolvePreviewState(value, false);
      playTransition(statusRef.current, nextStatus);
      statusRef.current = nextStatus;
      setSelection(value);
      setPaused(false);
    },
    [finishStep, playTransition, progress.phase, selection]
  );

  const changePause = useCallback(
    (value: boolean) => {
      const nextStatus = value ? "sleep" : "active";
      playTransition(statusRef.current, nextStatus);
      statusRef.current = nextStatus;
      setPaused(value);
      if (!value) {
        setSelection("auto");
      }
    },
    [playTransition]
  );

  const restartPreview = useCallback(() => {
    clearSuccessTimeout();
    dispatchProgress({ type: "restart" });
    playTransition(statusRef.current, "active");
    statusRef.current = "active";
    setSelection("active");
    setPaused(false);
  }, [clearSuccessTimeout, playTransition]);

  const { startCamera, stopCamera } = camera;
  const changeSource = useCallback(
    async (value: CameraSource) => {
      if (value === "webcam") {
        await startCamera();
      } else {
        stopCamera();
      }
    },
    [startCamera, stopCamera]
  );

  const openHelp = useCallback(() => setDetail("help"), []);
  const openSop = useCallback(() => setDetail("sop"), []);
  const openRecord = useCallback(() => setDetail("record"), []);
  const closeDetail = useCallback(() => setDetail(null), []);
  const resumeAssistant = useCallback(() => changePause(false), [changePause]);

  return (
    <main
      className="tara-assistant tara-workspace"
      data-mode={mode}
      data-progress={progress.phase}
      data-state={status}
    >
      <a className="tara-skip-link" href="#current-instruction">
        Skip to current instruction
      </a>
      <header className="tara-workspace-header">
        <Link aria-label="TARA home" className="tara-brand" href="/">
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
        <div className="tara-workspace-states">
          <AssistantStateControl
            onValueChange={changeState}
            successDisabled={stepSucceeded || Boolean(instruction.correction)}
            value={paused ? "sleep" : selection}
          />
        </div>
        <Button
          aria-label="About this preview"
          className="tara-workspace-help"
          onClick={openHelp}
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
            PREVIEW WORKSPACE <span>/</span> {previewTask.workOrder}
          </p>
          <h1 id="workspace-title">Let’s get this working.</h1>
        </div>
        <div className="tara-workspace-asset">
          <span className="tara-asset-icon">
            <Wrench aria-hidden="true" />
          </span>
          <div>
            <strong>{previewTask.asset}</strong>
            <span>{previewTask.task}</span>
          </div>
          <p>
            {previewTask.sop}
            <br />
            {previewTask.version}
          </p>
        </div>
      </section>

      <div className="tara-workspace-grid">
        <section aria-label="Preview work area" className="tara-camera-card">
          <h2 className="sr-only">Current task</h2>
          <CameraPreview
            observation={instruction.observation}
            paused={resting}
            source={camera.source}
            status={status}
            stepLabel={
              complete
                ? `${totalSteps}/${totalSteps} steps complete`
                : `Step ${stepNumber}/${totalSteps} · ${currentStep.clause}`
            }
            stream={camera.stream}
          >
            <MediaControls
              audioEnabled={audioEnabled}
              onAudioEnabledChange={setAudioEnabled}
              onPausedChange={changePause}
              onSourceChange={changeSource}
              paused={resting}
              source={camera.source}
              sourceBusy={camera.isPending}
            />
            {camera.error ? (
              <p className="tara-camera-error" role="alert">
                {camera.error}
              </p>
            ) : null}
          </CameraPreview>
          <div
            className="tara-workspace-current"
            data-correction={Boolean(instruction.correction)}
            id="current-instruction"
            tabIndex={-1}
          >
            <TaskStep
              description={instruction.description}
              title={instruction.title}
              verificationLabel={instruction.verificationLabel}
              verificationStatus={instruction.verificationStatus}
            >
              <button
                className="tara-source-button"
                onClick={openSop}
                type="button"
              >
                {source}
                <ArrowUpRight aria-hidden="true" />
              </button>
            </TaskStep>
            {instruction.correction ? (
              <Button
                className="tara-return-to-step"
                onClick={resumeAssistant}
                size="sm"
                variant="outline"
              >
                <ArrowLeft aria-hidden="true" />
                Return to current step
              </Button>
            ) : null}
            {complete ? (
              <Button
                className="tara-restart-preview"
                onClick={restartPreview}
                size="sm"
                variant="outline"
              >
                <RotateCcw aria-hidden="true" />
                Restart preview
              </Button>
            ) : null}
          </div>
        </section>

        <aside aria-label="TARA assistant" className="tara-workspace-assistant">
          <AssistantStatus status={status} />
          {resting && !complete ? (
            <div className="tara-resting-note">
              <p>Your current step stays right here.</p>
              <Button onClick={resumeAssistant} variant="outline">
                Resume assistant
              </Button>
            </div>
          ) : (
            <PreviewGuidance
              key={currentStep.id}
              onViewSop={openSop}
              progress={progress}
              source={source}
              status={status}
            />
          )}
        </aside>
      </div>

      <output aria-atomic="true" className="sr-only">
        {instruction.announcement}
      </output>

      <footer className="tara-workspace-footer">
        <span>
          <ShieldCheck aria-hidden="true" />A guided session. A clear record.
        </span>
        <span className="tara-preview-label">
          Component preview ·{" "}
          {camera.source === "webcam" ? "local camera" : "simulated feed"} · no
          AI verification
        </span>
        <button onClick={openRecord} type="button">
          <Activity aria-hidden="true" />
          Session record
          <span>
            {completedStepCount}/{totalSteps} complete
          </span>
          <ArrowUpRight aria-hidden="true" />
        </button>
      </footer>
      <PreviewDetails
        complete={complete}
        completedStepCount={completedStepCount}
        currentStepIndex={progress.stepIndex}
        kind={detail}
        onClose={closeDetail}
        seededStepCount={progress.seededStepCount}
      />
    </main>
  );
}
