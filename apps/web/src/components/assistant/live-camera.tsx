"use client";

import "./camera-preview.css";

import { Button } from "@tara/ui/components/button";
import type { AssistantState } from "@tara/ui/lib/assistant";
import { Camera, LoaderCircle } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { duration, humanize } from "@/lib/api";

export function LiveCamera({
  busy,
  camera,
  checking,
  children,
  connection,
  elapsedSeconds,
  onStart,
  paused,
  running,
  startDisabled,
  status,
  stepLabel,
  stream,
}: {
  busy: boolean;
  camera: boolean;
  checking: boolean;
  children: ReactNode;
  connection: string;
  elapsedSeconds: number;
  onStart?: () => Promise<unknown>;
  paused: boolean;
  running: boolean;
  startDisabled: boolean;
  status: AssistantState;
  stepLabel: string;
  stream: MediaStream | null;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [elapsed, setElapsed] = useState(elapsedSeconds);
  useEffect(() => {
    const element = video.current;
    if (!element) {
      return;
    }
    element.srcObject = stream;
    return () => {
      element.srcObject = null;
    };
  }, [stream]);
  useEffect(() => {
    setElapsed(elapsedSeconds);
    if (!running) {
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(elapsedSeconds + Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [elapsedSeconds, running]);
  let observation = "Camera off · no video is being captured";
  if (camera) {
    observation = paused
      ? "Live view · procedure paused"
      : "Live view · ready to check the current step";
  }
  if (checking) {
    observation = "Checking a fresh camera frame…";
  }
  return (
    <figure
      aria-label="Live work area"
      className="tara-camera tara-live-camera"
      data-paused={paused}
      data-status={status}
    >
      <div className="tara-camera__scene">
        <video
          aria-label="Live camera preview"
          autoPlay
          className="tara-camera__video"
          muted
          playsInline
          ref={video}
        />
      </div>
      {camera ? null : (
        <div className="tara-live-camera-off">
          <Camera aria-hidden="true" />
          <h2>Your work area, in focus.</h2>
          <p>
            {onStart
              ? "Start your camera to share the work area with TARA."
              : "No live video is available in this view."}
          </p>
          {onStart ? (
            <Button disabled={startDisabled || busy} onClick={onStart}>
              {busy ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <Camera aria-hidden="true" />
              )}
              {busy ? "Starting video…" : "Start bench camera"}
            </Button>
          ) : null}
        </div>
      )}
      <figcaption className="tara-camera__heading">
        <span className="tara-camera__live-label">
          <span aria-hidden="true" />
          {camera ? "LIVE" : "CAMERA OFF"}
        </span>
        <span className="tara-camera__source">{humanize(connection)}</span>
      </figcaption>
      <span
        aria-label="Active work time"
        className="tara-camera__timer"
        role="timer"
      >
        {duration(elapsed)}
      </span>
      <div className="tara-camera__bottom">
        <p className="tara-camera__observation">
          <span aria-hidden="true" />
          {observation}
        </p>
        <div className="tara-camera__toolbar">
          <div className="tara-camera__controls">{children}</div>
          <span className="tara-camera__step">{stepLabel}</span>
        </div>
      </div>
    </figure>
  );
}
