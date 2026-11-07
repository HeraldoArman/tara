import { VerificationBadge } from "@tara/ui/components/verification-badge";
import type { VerificationStatus } from "@tara/ui/lib/assistant";
import { cn } from "@tara/ui/lib/utils";
import { EyeIcon } from "lucide-react";
import type { ReactNode } from "react";

interface TaskStepProps {
  children?: ReactNode;
  className?: string;
  description: string;
  title: string;
  verificationStatus?: VerificationStatus;
}

function TaskStep({
  children,
  className,
  description,
  title,
  verificationStatus,
}: TaskStepProps) {
  return (
    <div className={cn("tara-task-step", className)}>
      <span aria-hidden="true" className="tara-task-step-icon">
        <EyeIcon />
      </span>
      <div className="tara-task-step-copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {verificationStatus ? (
        <VerificationBadge status={verificationStatus} />
      ) : null}
      {children}
    </div>
  );
}

export type { TaskStepProps };
export { TaskStep };
