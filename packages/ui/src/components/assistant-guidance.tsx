"use client";

import { Button } from "@tara/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@tara/ui/components/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@tara/ui/components/input-group";
import type { AssistantState } from "@tara/ui/lib/assistant";
import { cn } from "@tara/ui/lib/utils";
import {
  ArrowUpIcon,
  ArrowUpRightIcon,
  AudioLinesIcon,
  LoaderCircleIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useId,
  useState,
} from "react";

interface AssistantGuidanceProps {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly completedSteps?: number;
  readonly description: string;
  readonly eyebrow?: string;
  readonly hint?: string;
  readonly onViewSop?: () => void;
  readonly source: string;
  readonly status: AssistantState;
  readonly step: number;
  readonly title: string;
  readonly totalSteps: number;
}

function AssistantGuidance({
  children,
  className,
  completedSteps,
  description,
  eyebrow,
  hint,
  onViewSop,
  source,
  status,
  step,
  title,
  totalSteps,
}: AssistantGuidanceProps) {
  const titleId = useId();
  const isWarning = status === "warning";
  const GuidanceIcon = isWarning ? TriangleAlertIcon : SparklesIcon;
  const progress = Math.min(
    Math.max(completedSteps ?? step - 1, 0),
    Math.max(totalSteps, 1)
  );

  return (
    <Card
      aria-labelledby={titleId}
      className={cn("tara-guidance-card", className)}
      data-state={status}
      role="region"
    >
      <CardHeader>
        <div className="tara-guidance-meta">
          <p className="tara-eyebrow">
            <span className="tara-state-dot" /> In the moment
          </p>
          <span>
            Step {step} of {totalSteps}
          </span>
        </div>
        <p className="tara-guidance-eyebrow">
          <GuidanceIcon aria-hidden="true" />
          {eyebrow ??
            (isWarning ? "Before you continue" : "Right here with you")}
        </p>
        <CardTitle>
          <h2 id={titleId}>{title}</h2>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {hint ? <p className="tara-guidance-hint">{hint}</p> : null}
        <p className="tara-guidance-source">
          <ShieldCheckIcon aria-hidden="true" />
          {source}
        </p>
        {children}
      </CardContent>
      <CardFooter>
        <progress
          aria-label={
            completedSteps === undefined
              ? "Steps before the current step"
              : "Completed steps"
          }
          className="tara-step-progress"
          max={Math.max(totalSteps, 1)}
          value={progress}
        />
        <div className="tara-guidance-footer">
          <span>One step at a time.</span>
          {onViewSop ? (
            <Button onClick={onViewSop} size="sm" variant="ghost">
              View SOP{" "}
              <ArrowUpRightIcon aria-hidden="true" data-icon="inline-end" />
            </Button>
          ) : (
            <span>SOP-grounded guidance</span>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

interface ReplyComposerProps {
  readonly disabled?: boolean;
  readonly onSubmit: (reply: string) => void;
  readonly pending?: boolean;
  readonly placeholder?: string;
  readonly statusMessage?: string;
}

function ReplyComposer({
  disabled = false,
  onSubmit,
  pending = false,
  placeholder = "Type a reply…",
  statusMessage = "Text replies are available",
}: ReplyComposerProps) {
  const [value, setValue] = useState("");
  const inputId = useId();
  const messageId = useId();
  const isDisabled = disabled || pending;
  const composerStatus = pending ? "Preparing your guidance…" : statusMessage;

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const reply = value.trim();
      if (!reply || isDisabled) {
        return;
      }
      onSubmit(reply);
      setValue("");
    },
    [isDisabled, onSubmit, value]
  );

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.currentTarget.value);
  }, []);

  return (
    <form
      aria-busy={pending}
      className="tara-reply-composer"
      onSubmit={handleSubmit}
    >
      <p className="tara-composer-status" id={messageId}>
        <AudioLinesIcon aria-hidden="true" />
        {composerStatus}
      </p>
      <label className="sr-only" htmlFor={inputId}>
        Reply to tara
      </label>
      <InputGroup>
        <InputGroupInput
          aria-describedby={messageId}
          autoComplete="off"
          disabled={isDisabled}
          id={inputId}
          maxLength={1000}
          name="reply"
          onChange={handleChange}
          placeholder={placeholder}
          value={value}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            aria-label="Send reply"
            disabled={isDisabled || !value.trim()}
            size="icon-sm"
            type="submit"
            variant="default"
          >
            {pending ? (
              <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
            ) : (
              <ArrowUpIcon aria-hidden="true" />
            )}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}

export type { AssistantGuidanceProps, ReplyComposerProps };
export { AssistantGuidance, ReplyComposer };
