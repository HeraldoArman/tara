"use client";

import { Button } from "@tara/ui/components/button";
import {
  Card,
  CardContent,
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
  MessageCircleIcon,
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
  readonly composer?: ReactNode;
  readonly onViewSop?: () => void;
  readonly source: string;
  readonly status: AssistantState;
}

function AssistantGuidance({
  children,
  className,
  composer,
  onViewSop,
  source,
  status,
}: AssistantGuidanceProps) {
  const titleId = useId();

  return (
    <Card
      aria-labelledby={titleId}
      className={cn("tara-guidance-card", className)}
      data-state={status}
      role="region"
    >
      <CardHeader>
        <CardTitle>
          <h2 id={titleId}>
            <MessageCircleIcon aria-hidden="true" /> Ask TARA
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent
        aria-label="Conversation messages"
        className="tara-chat-scroll"
        role="region"
        tabIndex={0}
      >
        {children}
      </CardContent>
      <CardFooter>
        {composer}
        <div className="tara-guidance-footer">
          <span title={source}>{source}</span>
          {onViewSop ? (
            <Button onClick={onViewSop} size="sm" variant="ghost">
              SOP <ArrowUpRightIcon aria-hidden="true" data-icon="inline-end" />
            </Button>
          ) : (
            <span>SOP-grounded</span>
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
        Reply to TARA
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
