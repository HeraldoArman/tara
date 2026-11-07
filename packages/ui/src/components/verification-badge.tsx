import {
  type VerificationStatus,
  verificationLabels,
} from "@tara/ui/lib/assistant";
import { cn } from "@tara/ui/lib/utils";
import { CheckIcon, CircleDashedIcon, ShieldAlertIcon } from "lucide-react";

interface VerificationBadgeProps {
  className?: string;
  label?: string;
  status: VerificationStatus;
}

function VerificationBadge({
  className,
  label,
  status,
}: VerificationBadgeProps) {
  const needsAttention = status === "contradicted" || status === "blocked";
  let Icon = CircleDashedIcon;
  if (status === "verified") {
    Icon = CheckIcon;
  } else if (needsAttention) {
    Icon = ShieldAlertIcon;
  }

  return (
    <span
      className={cn("tara-verification-badge", className)}
      data-verification={status}
    >
      <Icon aria-hidden="true" />
      {label ?? verificationLabels[status]}
    </span>
  );
}

export type { VerificationBadgeProps };
export { VerificationBadge };
