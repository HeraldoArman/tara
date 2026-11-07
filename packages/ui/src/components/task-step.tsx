import { VerificationBadge } from "@tara/ui/components/verification-badge";
import type { VerificationStatus } from "@tara/ui/lib/assistant";
import { cn } from "@tara/ui/lib/utils";
import { CheckIcon, EyeIcon, TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";

interface TaskStepProps {
  children?: ReactNode;
  className?: string;
  description: string;
  title: string;
  verificationLabel?: string;
  verificationStatus?: VerificationStatus;
}

function TaskStep({
  children,
  className,
  description,
  title,
  verificationLabel,
  verificationStatus,
}: TaskStepProps) {
  let StepIcon = EyeIcon;
  if (verificationStatus === "verified") {
    StepIcon = CheckIcon;
  } else if (verificationStatus === "blocked") {
    StepIcon = TriangleAlertIcon;
  }
  return (
    <div className={cn("tara-task-step", className)}>
      <span aria-hidden="true" className="tara-task-step-icon">
        <StepIcon />
      </span>
      <div className="tara-task-step-copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {verificationStatus ? (
        <VerificationBadge
          label={verificationLabel}
          status={verificationStatus}
        />
      ) : null}
      {children}
    </div>
  );
}

export type { TaskStepProps };
export { TaskStep };
