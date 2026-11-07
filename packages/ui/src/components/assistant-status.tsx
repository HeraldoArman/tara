import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@tara/ui/components/card";
import { type AssistantState, assistantStates } from "@tara/ui/lib/assistant";
import { cn } from "@tara/ui/lib/utils";
import { AsteriskIcon } from "lucide-react";

interface AssistantStatusProps {
  readonly className?: string;
  readonly status: AssistantState;
}

function AssistantMark({ className }: { readonly className?: string }) {
  return (
    <span aria-hidden="true" className={cn("tara-assistant-mark", className)}>
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

function AssistantStatus({ className, status }: AssistantStatusProps) {
  const state = assistantStates[status];

  return (
    <Card
      aria-atomic="true"
      aria-live="polite"
      className={cn("tara-status-card", className)}
      data-state={status}
      role="status"
    >
      <span aria-hidden="true" className="tara-status-orb">
        <AssistantMark />
      </span>
      <CardHeader>
        <p className="tara-eyebrow">
          tara IS <span className="tara-state-dot" />
        </p>
        <CardTitle>
          <h2 className="tara-status-title">{state.label}</h2>
        </CardTitle>
        <CardDescription>{state.description}</CardDescription>
      </CardHeader>
      <AsteriskIcon aria-hidden="true" className="tara-status-spark" />
    </Card>
  );
}

export type { AssistantStatusProps };
export { AssistantMark, AssistantStatus };
