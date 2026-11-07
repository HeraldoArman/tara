"use client";

import { AssistantMark } from "@tara/ui/components/assistant-status";
import { Button } from "@tara/ui/components/button";
import type { AssistantState } from "@tara/ui/lib/assistant";
import { Check, CirclePause, Eye, ScanLine, TriangleAlert } from "lucide-react";
import { type MouseEvent, useCallback, useId, useState } from "react";

import "./landing-preview.css";

const previewStates = {
  active: {
    description: "Remove the E keycap and bring the switch into view.",
    icon: Eye,
    label: "Active",
    note: "One step at a time",
    title: "Inspect the faulty key.",
  },
  sleep: {
    description: "Your current step is here when you’re ready to continue.",
    icon: CirclePause,
    label: "Sleep",
    note: "A quiet moment",
    title: "Here when you need me.",
  },
  success: {
    description: "A successful check lets the workflow move to the next step.",
    icon: Check,
    label: "Success",
    note: "Ready for the next step",
    title: "Checkpoint complete.",
  },
  warning: {
    description: "Pause this step. Move closer so the switch can be checked.",
    icon: TriangleAlert,
    label: "Warning",
    note: "A little course correction",
    title: "Bring the switch into view.",
  },
} as const;

const stateOrder: readonly AssistantState[] = [
  "sleep",
  "active",
  "warning",
  "success",
];

const keyboardRows = [
  {
    id: "number",
    keys: [
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
      "−",
      "=",
      "del",
    ],
  },
  {
    id: "top",
    keys: [
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
    keys: [
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
      "↵",
    ],
  },
  {
    id: "bottom",
    keys: [
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
      "shift",
      "↑",
      "fn",
    ],
  },
] as const;

const keys = keyboardRows.flatMap((row, rowPosition) =>
  row.keys.map((label, column) => ({
    highlighted: row.id === "top" && label === "e",
    id: `${row.id}-${column}`,
    label,
    x: 74 + column * 42,
    y: 76 + rowPosition * 42,
  }))
);

function PreviewKeyboard() {
  const id = useId();
  const keyGradient = `${id}-key`;
  const caseGradient = `${id}-case`;

  return (
    <svg
      aria-hidden="true"
      className="tara-landing-preview-keyboard"
      focusable="false"
      viewBox="0 0 740 330"
    >
      <defs>
        <linearGradient id={caseGradient} x2="0" y2="1">
          <stop offset="0" stopColor="#39424b" />
          <stop offset="1" stopColor="#1d252d" />
        </linearGradient>
        <linearGradient id={keyGradient} x2="0" y2="1">
          <stop offset="0" stopColor="#47515b" />
          <stop offset="1" stopColor="#2e3741" />
        </linearGradient>
      </defs>
      <path
        className="tara-landing-preview-cable"
        d="M535 48c0-40 86 2 110-40"
      />
      <rect
        fill={`url(#${caseGradient})`}
        height="252"
        rx="21"
        width="620"
        x="56"
        y="52"
      />
      <rect fill="#151d25" height="224" rx="12" width="594" x="69" y="65" />
      {keys.map((key) => (
        <g
          data-highlighted={key.highlighted || undefined}
          key={key.id}
          transform={`translate(${key.x} ${key.y})`}
        >
          <rect fill={`url(#${keyGradient})`} height="36" rx="6" width="36" />
          <text x="18" y="22">
            {key.label}
          </text>
        </g>
      ))}
      <g
        className="tara-landing-preview-keyboard-bottom"
        fill={`url(#${keyGradient})`}
      >
        <rect height="32" rx="6" width="36" x="74" y="247" />
        <rect height="32" rx="6" width="36" x="116" y="247" />
        <rect height="32" rx="6" width="46" x="158" y="247" />
        <rect height="32" rx="6" width="268" x="210" y="247" />
        <rect height="32" rx="6" width="46" x="484" y="247" />
        <rect height="32" rx="6" width="36" x="536" y="247" />
        <rect height="32" rx="6" width="36" x="578" y="247" />
        <rect height="32" rx="6" width="36" x="620" y="247" />
      </g>
      <g className="tara-landing-preview-screws">
        <circle cx="64" cy="64" r="2" />
        <circle cx="668" cy="64" r="2" />
        <circle cx="64" cy="292" r="2" />
        <circle cx="668" cy="292" r="2" />
      </g>
    </svg>
  );
}

export function LandingPreview() {
  const [state, setState] = useState<AssistantState>("active");
  const selectState = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    const value = event.currentTarget.dataset.state;
    if (
      value === "sleep" ||
      value === "active" ||
      value === "warning" ||
      value === "success"
    ) {
      setState(value);
    }
  }, []);
  const current = previewStates[state];
  const StateIcon = current.icon;

  return (
    <div className="tara-landing-preview" data-state={state}>
      <div className="tara-landing-preview-frame">
        <div className="tara-landing-preview-bar">
          <span aria-hidden="true" className="tara-landing-preview-window-dots">
            <i />
            <i />
            <i />
          </span>
          <span>YOUR WORK, IN FOCUS.</span>
          <ScanLine aria-hidden="true" />
        </div>
        <div className="tara-landing-preview-scene">
          <div className="tara-landing-preview-camera-label">
            <span /> SIMULATED VIEW
          </div>
          <div className="tara-landing-preview-orb">
            <AssistantMark />
            <div>
              <span>tara IS</span>
              <strong>{current.label}</strong>
            </div>
          </div>
          <div aria-hidden="true" className="tara-landing-preview-work-area">
            <span>WORK AREA</span>
            <i />
            <i />
            <i />
            <i />
          </div>
          <PreviewKeyboard />
          <div
            aria-atomic="true"
            aria-live="polite"
            className="tara-landing-preview-instruction"
          >
            <span className="tara-landing-preview-step-icon">
              <StateIcon aria-hidden="true" />
            </span>
            <div>
              <p className="tara-landing-preview-note">{current.note}</p>
              <h2>{current.title}</h2>
              <p className="tara-landing-preview-description">
                {current.description}
              </p>
            </div>
          </div>
        </div>
        <div className="tara-landing-preview-context">
          <span>Keyboard switch replacement</span>
          <span>
            SAMPLE SOP <span aria-hidden="true">·</span> STEP 02
          </span>
        </div>
      </div>
      <div className="tara-landing-preview-controls">
        <p>Try a state</p>
        <fieldset>
          <legend className="sr-only">Illustrative assistant states</legend>
          {stateOrder.map((value) => (
            <Button
              aria-pressed={state === value}
              className="tara-landing-preview-state"
              data-state={value}
              key={value}
              onClick={selectState}
              type="button"
              variant="ghost"
            >
              <span aria-hidden="true" />
              {previewStates[value].label}
            </Button>
          ))}
        </fieldset>
      </div>
      <p className="tara-landing-preview-disclaimer">
        Illustrative preview · no camera or live verification
      </p>
    </div>
  );
}
