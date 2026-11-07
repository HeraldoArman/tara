"use client";

import { Button } from "@tara/ui/components/button";
import {
  type AssistantMode,
  type AssistantStateSelection,
  assistantStates,
  type CameraSource,
} from "@tara/ui/lib/assistant";
import { cn } from "@tara/ui/lib/utils";
import {
  CameraIcon,
  LayersIcon,
  LoaderCircleIcon,
  MaximizeIcon,
  MonitorPlayIcon,
  PauseIcon,
  PlayIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import { type ChangeEvent, useCallback, useId } from "react";

interface AssistantModeControlProps {
  className?: string;
  onValueChange: (value: AssistantMode) => void;
  value: AssistantMode;
}

function AssistantModeControl({
  className,
  onValueChange,
  value,
}: AssistantModeControlProps) {
  const name = useId();
  const selectDemo = useCallback(() => onValueChange("demo"), [onValueChange]);
  const selectProduct = useCallback(
    () => onValueChange("product"),
    [onValueChange]
  );

  return (
    <fieldset
      className={cn("tara-segmented-control tara-mode-control", className)}
    >
      <legend className="sr-only">Workspace layout</legend>
      <label>
        <input
          checked={value === "demo"}
          name={name}
          onChange={selectDemo}
          type="radio"
          value="demo"
        />
        <span>
          <LayersIcon aria-hidden="true" /> Demo mode
        </span>
      </label>
      <label>
        <input
          checked={value === "product"}
          name={name}
          onChange={selectProduct}
          type="radio"
          value="product"
        />
        <span>
          <MaximizeIcon aria-hidden="true" /> Product mode
        </span>
      </label>
    </fieldset>
  );
}

interface AssistantStateControlProps {
  className?: string;
  onValueChange: (value: AssistantStateSelection) => void;
  value: AssistantStateSelection;
}

const stateSelections = [
  "auto",
  "sleep",
  "active",
  "warning",
  "success",
] as const;

function AssistantStateControl({
  className,
  onValueChange,
  value,
}: AssistantStateControlProps) {
  const name = useId();
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextState = event.currentTarget.value;
      switch (nextState) {
        case "auto":
        case "sleep":
        case "active":
        case "warning":
        case "success":
          onValueChange(nextState);
          break;
        default:
          break;
      }
    },
    [onValueChange]
  );

  return (
    <fieldset
      className={cn("tara-segmented-control tara-state-control", className)}
    >
      <legend className="sr-only">Preview assistant appearance</legend>
      {stateSelections.map((state) => (
        <label data-state={state} key={state}>
          <input
            checked={value === state}
            name={name}
            onChange={handleChange}
            type="radio"
            value={state}
          />
          <span>
            {state === "auto" ? null : (
              <span aria-hidden="true" className="tara-state-dot" />
            )}
            {state === "auto" ? "Auto" : assistantStates[state].label}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

interface MediaControlsProps {
  audioEnabled?: boolean;
  className?: string;
  onAudioEnabledChange?: (enabled: boolean) => void;
  onPausedChange: (paused: boolean) => void;
  onSourceChange: (source: CameraSource) => void;
  paused: boolean;
  source: CameraSource;
  sourceBusy?: boolean;
}

function MediaControls({
  audioEnabled,
  className,
  onAudioEnabledChange,
  onPausedChange,
  onSourceChange,
  paused,
  source,
  sourceBusy = false,
}: MediaControlsProps) {
  const CameraControlIcon = source === "webcam" ? MonitorPlayIcon : CameraIcon;
  const PauseControlIcon = paused ? PlayIcon : PauseIcon;
  const AudioControlIcon = audioEnabled ? Volume2Icon : VolumeXIcon;
  const handleSourceChange = useCallback(() => {
    onSourceChange(source === "webcam" ? "simulated" : "webcam");
  }, [onSourceChange, source]);
  const handlePausedChange = useCallback(() => {
    onPausedChange(!paused);
  }, [onPausedChange, paused]);
  const handleAudioChange = useCallback(() => {
    onAudioEnabledChange?.(!audioEnabled);
  }, [audioEnabled, onAudioEnabledChange]);

  return (
    <fieldset className={cn("tara-media-controls", className)}>
      <legend className="sr-only">Live view controls</legend>
      <Button
        disabled={sourceBusy}
        onClick={handleSourceChange}
        variant="ghost"
      >
        {sourceBusy ? (
          <LoaderCircleIcon
            aria-hidden="true"
            className="animate-spin"
            data-icon="inline-start"
          />
        ) : (
          <CameraControlIcon aria-hidden="true" data-icon="inline-start" />
        )}
        {source === "webcam" ? "Use simulation" : "Use webcam"}
      </Button>
      <span aria-hidden="true" className="tara-control-divider" />
      <Button
        aria-pressed={paused}
        onClick={handlePausedChange}
        variant="ghost"
      >
        <PauseControlIcon aria-hidden="true" data-icon="inline-start" />
        {paused ? "Resume" : "Pause"}
      </Button>
      {onAudioEnabledChange ? (
        <Button
          aria-label={
            audioEnabled ? "Mute voice replies" : "Enable voice replies"
          }
          aria-pressed={audioEnabled}
          onClick={handleAudioChange}
          size="icon"
          variant="ghost"
        >
          <AudioControlIcon aria-hidden="true" />
        </Button>
      ) : null}
    </fieldset>
  );
}

export type {
  AssistantModeControlProps,
  AssistantStateControlProps,
  MediaControlsProps,
};
export { AssistantModeControl, AssistantStateControl, MediaControls };
