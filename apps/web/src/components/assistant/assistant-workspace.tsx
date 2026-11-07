"use client";

import "@tara/ui/assistant.css";
import "./assistant-workspace.css";

import {
  AssistantModeControl,
  AssistantStateControl,
  MediaControls,
} from "@tara/ui/components/assistant-controls";
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
import type {
  AssistantMode,
  AssistantState,
  AssistantStateSelection,
  CameraSource,
} from "@tara/ui/lib/assistant";
import {
  Activity,
  ArrowUpRight,
  CircleHelp,
  MessageCircle,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";

import { CameraPreview } from "./camera-preview";
import { previewGuidance, previewTask } from "./preview-data";
import { type PreviewDetail, PreviewDetails } from "./preview-details";
import { useCamera } from "./use-camera";

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
  const [consultation, setConsultation] = useState(false);
  const [replied, setReplied] = useState(false);
  const [detail, setDetail] = useState<PreviewDetail>(null);
  const camera = useCamera();
  const status = resolvePreviewState(selection, paused);
  const resting = status === "sleep";
  const guidanceHint =
    camera.source === "webcam"
      ? "Your camera stays local to this browser. No AI visual check has been performed, and this step is still waiting for evidence."
      : previewGuidance.hint;

  const changeState = useCallback((value: AssistantStateSelection) => {
    setSelection(value);
    setPaused(false);
    if (value === "sleep") {
      setConsultation(false);
    }
  }, []);

  const changePause = useCallback((value: boolean) => {
    setPaused(value);
    if (value) {
      setConsultation(false);
    } else {
      setSelection("auto");
    }
  }, []);

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

  const onReply = useCallback(() => {
    setReplied(true);
  }, []);
  const openHelp = useCallback(() => setDetail("help"), []);
  const openSop = useCallback(() => setDetail("sop"), []);
  const openRecord = useCallback(() => setDetail("record"), []);
  const closeDetail = useCallback(() => setDetail(null), []);
  const resumeAssistant = useCallback(() => changePause(false), [changePause]);
  const toggleConsultation = useCallback(
    () => setConsultation((value) => !value),
    []
  );

  let guidanceTitle: string = previewGuidance.title;
  if (status === "warning") {
    guidanceTitle = "Let’s get a clear view.";
  }
  if (replied) {
    guidanceTitle = "Let’s take a closer look.";
  }

  return (
    <main
      className="tara-assistant tara-workspace"
      data-mode={mode}
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
            LIVE WORKSPACE <span>/</span> {previewTask.workOrder}
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
        <section aria-label="Live work area" className="tara-camera-card">
          <CameraPreview
            observation={
              resting
                ? "Live view · assistant resting"
                : "Preview feed · awaiting visual evidence"
            }
            paused={resting}
            source={camera.source}
            status={status}
            stepLabel={`Step ${previewTask.step}/${previewTask.totalSteps} · ${previewTask.clause}`}
            stream={camera.stream}
          >
            <MediaControls
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
            id="current-instruction"
            tabIndex={-1}
          >
            <TaskStep
              description={previewTask.description}
              title={previewTask.title}
              verificationStatus="not_evidenced"
            >
              <button
                className="tara-source-button"
                onClick={openSop}
                type="button"
              >
                {previewTask.source}
                <ArrowUpRight aria-hidden="true" />
              </button>
            </TaskStep>
          </div>
        </section>

        <aside aria-label="TARA assistant" className="tara-workspace-assistant">
          <AssistantStatus status={status} />
          {resting ? (
            <div className="tara-resting-note">
              <p>Your current step stays right here.</p>
              <Button onClick={resumeAssistant} variant="outline">
                Resume assistant
              </Button>
            </div>
          ) : (
            <AssistantGuidance
              description={
                replied
                  ? "This sample reply keeps you on the inspection step: expose the switch and bring it into clear view. In a connected session, TARA will use the current SOP and evidence to answer your question."
                  : previewGuidance.description
              }
              hint={guidanceHint}
              onViewSop={openSop}
              source={previewTask.source}
              status={status}
              step={previewTask.step}
              title={guidanceTitle}
              totalSteps={previewTask.totalSteps}
            >
              <div className="tara-consultation-control">
                <Button onClick={toggleConsultation} variant="ghost">
                  <MessageCircle data-icon="inline-start" />
                  {consultation ? "Return to silent mode" : "Ask TARA"}
                </Button>
                <span>
                  {consultation ? "Text preview active" : "Silent mode"}
                </span>
              </div>
              <ReplyComposer
                disabled={!consultation}
                onSubmit={onReply}
                placeholder="Type a reply…"
                statusMessage={
                  consultation
                    ? "Sample replies · voice is not connected"
                    : "Activate Ask TARA to type"
                }
              />
              {replied ? (
                <p className="tara-reply-notice" role="status">
                  Practice reply received. Verification remains unchanged.
                </p>
              ) : null}
            </AssistantGuidance>
          )}
        </aside>
      </div>

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
          Session record<span>0 events</span>
          <ArrowUpRight aria-hidden="true" />
        </button>
      </footer>
      <PreviewDetails kind={detail} onClose={closeDetail} />
    </main>
  );
}
