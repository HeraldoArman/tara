"use client";

import type { AssistantState, CameraSource } from "@tara/ui/lib/assistant";
import { cn } from "@tara/ui/lib/utils";
import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";

import "./camera-preview.css";

const KEY_ROWS = [
  {
    id: "numbers",
    labels: [
      "esc",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "0",
      "-",
      "=",
      "del",
    ],
  },
  {
    id: "top",
    labels: [
      "tab",
      "q",
      "w",
      "e",
      "r",
      "t",
      "y",
      "u",
      "i",
      "o",
      "p",
      "[",
      "]",
      "\\",
    ],
  },
  {
    id: "middle",
    labels: [
      "caps",
      "a",
      "s",
      "d",
      "f",
      "g",
      "h",
      "j",
      "k",
      "l",
      ";",
      "'",
      "enter",
      "",
    ],
  },
  {
    id: "bottom",
    labels: [
      "shift",
      "z",
      "x",
      "c",
      "v",
      "b",
      "n",
      "m",
      ",",
      ".",
      "/",
      "",
      "",
      "",
    ],
  },
  {
    id: "modifiers",
    labels: [
      "ctrl",
      "alt",
      "cmd",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "cmd",
      "alt",
      "ctrl",
    ],
  },
] as const;

const KEYS = KEY_ROWS.flatMap((row, rowPosition) =>
  row.labels.map((label, column) => ({
    highlighted: row.id === "top" && label === "e",
    id: `${row.id}-${column}`,
    label,
    x: 242 + column * 49,
    y: 217 + rowPosition * 45,
  }))
);

function KeyboardScene() {
  const id = useId();
  const faceId = `${id}-face`;
  const caseId = `${id}-case`;
  const selectedId = `${id}-selected`;

  return (
    <svg
      aria-hidden="true"
      className="tara-camera__keyboard"
      focusable="false"
      viewBox="0 0 1200 640"
    >
      <defs>
        <linearGradient id={faceId} x2="0" y2="1">
          <stop offset="0" stopColor="#454d56" />
          <stop offset="0.5" stopColor="#323a43" />
          <stop offset="1" stopColor="#242c34" />
        </linearGradient>
        <linearGradient id={caseId} x2="1" y2="1">
          <stop offset="0" stopColor="#3d4853" />
          <stop offset="0.5" stopColor="#27323b" />
          <stop offset="1" stopColor="#151d24" />
        </linearGradient>
        <linearGradient id={selectedId} x2="0" y2="1">
          <stop offset="0" stopColor="#625037" />
          <stop offset="1" stopColor="#3c301f" />
        </linearGradient>
      </defs>
      <g className="tara-camera__work-area">
        <text x="177" y="139">
          WORK AREA
        </text>
        <path d="M177 180v-14q0-10 10-10h16 M998 180v-14q0-10-10-10h-16 M177 451v14q0 10 10 10h16 M998 451v14q0 10-10 10h-16" />
      </g>
      <path
        className="tara-camera__cable"
        d="M966 275 C1031 268 1066 207 1116 201"
      />
      <rect
        className="tara-camera__case"
        fill={`url(#${caseId})`}
        height="302"
        rx="26"
        width="785"
        x="198"
        y="184"
      />
      <rect fill="#10181f" height="262" rx="13" width="747" x="217" y="204" />
      {KEYS.map((key) => (
        <g
          className={cn(
            "tara-camera__key",
            key.highlighted && "tara-camera__key--highlighted"
          )}
          key={key.id}
          transform={`translate(${key.x} ${key.y})`}
        >
          <rect
            className="tara-camera__key-base"
            height="40"
            rx="7"
            width="44"
            y="3"
          />
          <rect
            className="tara-camera__key-face"
            fill={`url(#${key.highlighted ? selectedId : faceId})`}
            height="40"
            rx="7"
            width="44"
          />
          <text fontSize={key.label.length > 2 ? 8 : 10} x="22" y="22">
            {key.label}
          </text>
        </g>
      ))}
      <g className="tara-camera__screws">
        <circle cx="222" cy="209" r="2.5" />
        <circle cx="959" cy="209" r="2.5" />
        <circle cx="222" cy="460" r="2.5" />
        <circle cx="959" cy="460" r="2.5" />
        <text x="931" y="462">
          K2
        </text>
      </g>
      <g
        className="tara-camera__puller"
        transform="translate(1065 372) rotate(17)"
      >
        <rect height="60" rx="6" width="13" x="-6.5" y="-13" />
        <path d="M-5-28v-15M5-28v-15" />
        <rect
          className="tara-camera__puller-grip"
          height="17"
          rx="4"
          width="28"
          x="-14"
          y="-28"
        />
      </g>
      <g className="tara-camera__spare-switch" transform="translate(1010 503)">
        <rect height="25" rx="4" width="25" />
        <path d="M8 10h9M12.5 6v8" />
      </g>
    </svg>
  );
}

function PreviewTimer() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = performance.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((performance.now() - started) / 1000));
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const minutes = Math.floor(elapsed / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (elapsed % 60).toString().padStart(2, "0");

  return (
    <span
      aria-label="Preview session elapsed time"
      className="tara-camera__timer"
      role="timer"
    >
      {minutes}:{seconds}
    </span>
  );
}

function WebcamFeed({ stream }: { readonly stream: MediaStream | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.srcObject = stream;
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <video
      aria-label="Local live camera preview, without audio"
      autoPlay
      className="tara-camera__video"
      muted
      playsInline
      ref={videoRef}
    />
  );
}

export interface CameraPreviewProps {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly observation?: string;
  readonly paused: boolean;
  readonly source: CameraSource;
  readonly status: AssistantState;
  readonly stepLabel?: string;
  readonly stream: MediaStream | null;
}

export function CameraPreview({
  children,
  className,
  observation,
  paused,
  source,
  status,
  stepLabel = "Step 2 / 5 · §2.3",
  stream,
}: CameraPreviewProps) {
  const caption =
    source === "simulated" ? "Simulated feed" : "Local camera · preview only";
  const previewMessage = paused
    ? "Preview feed · assistant resting"
    : "Sample work area · no live verification";

  return (
    <figure
      aria-label={
        source === "simulated"
          ? "Simulated keyboard work area with the E key highlighted"
          : "Local camera preview"
      }
      className={cn("tara-camera", className)}
      data-paused={paused}
      data-status={status}
    >
      <div className="tara-camera__scene">
        {source === "webcam" ? (
          <WebcamFeed stream={stream} />
        ) : (
          <KeyboardScene />
        )}
      </div>
      <figcaption className="tara-camera__heading">
        <span className="tara-camera__live-label">
          <span aria-hidden="true" /> PREVIEW
        </span>
        <span className="tara-camera__source">{caption}</span>
      </figcaption>
      <PreviewTimer />
      <div className="tara-camera__bottom">
        <p className="tara-camera__observation">
          <span />
          {observation ?? previewMessage}
        </p>
        <div className="tara-camera__toolbar">
          <div className="tara-camera__controls">{children}</div>
          <span className="tara-camera__step">{stepLabel}</span>
        </div>
      </div>
    </figure>
  );
}
