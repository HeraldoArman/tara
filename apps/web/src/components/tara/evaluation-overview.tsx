import "./evaluation-overview.css";

import {
  ArrowUpRight,
  Camera,
  CheckCheck,
  ClipboardList,
  type LucideIcon,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Evaluation } from "@/lib/contracts";

function OverviewCard({
  badge,
  children,
  icon: Icon,
  label,
  title,
  tone,
  value,
}: {
  badge?: string;
  children: ReactNode;
  icon: LucideIcon;
  label: string;
  title: string;
  tone: "neutral" | "attention" | "evidence" | "performance";
  value: number | string;
}) {
  return (
    <article className="evaluation-overview-card" data-tone={tone}>
      <header className="evaluation-overview-card-heading">
        <div className="evaluation-overview-icon">
          <Icon aria-hidden="true" size={18} />
        </div>
        <h3>{title}</h3>
        {badge ? (
          <span className="evaluation-overview-badge">{badge}</span>
        ) : null}
      </header>
      <div className="evaluation-overview-value">
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
      {children}
    </article>
  );
}

export function EvaluationOverview({
  data,
  filtered,
  ownOnly,
}: {
  data: Evaluation;
  filtered: boolean;
  ownOnly: boolean;
}) {
  const held = data.held ?? 0;
  const firstAttempts = data.firstAttemptCount ?? 0;
  const firstPasses = data.firstPassCount ?? 0;
  const rate = firstAttempts > 0 ? data.firstPassRate : null;
  let scope = ownOnly ? "Your sessions" : "All authorized sessions";
  if (filtered) {
    scope = "Filtered view";
  }
  return (
    <section
      aria-labelledby="evaluation-overview-title"
      className="evaluation-overview"
    >
      <header className="evaluation-overview-heading">
        <div>
          <h2 id="evaluation-overview-title">Session overview</h2>
          <p>A clear view of progress, evidence and steps needing attention.</p>
        </div>
        <span className="evaluation-overview-scope">{scope}</span>
      </header>
      <div className="evaluation-overview-grid">
        <OverviewCard
          icon={ClipboardList}
          label="sessions started"
          title="Sessions"
          tone="neutral"
          value={data.runs}
        >
          <div className="evaluation-overview-breakdown">
            <span>
              <strong>{data.active}</strong>Open
            </span>
            <span>
              <strong>{data.completed}</strong>Complete
            </span>
            <span>
              <strong>{data.partial}</strong>Partial
            </span>
          </div>
        </OverviewCard>
        <OverviewCard
          badge={held > 0 ? "Review" : undefined}
          icon={ShieldAlert}
          label="steps on hold"
          title="Needs attention"
          tone={held > 0 ? "attention" : "neutral"}
          value={held}
        >
          <p className="evaluation-overview-description">
            {held > 0
              ? "Review the recovery instructions before continuing."
              : "No steps are currently held."}
          </p>
          <div className="evaluation-overview-card-footer">
            <Link href="/reports">
              Review sessions
              <ArrowUpRight aria-hidden="true" size={14} />
            </Link>
          </div>
        </OverviewCard>
        <OverviewCard
          icon={Camera}
          label="camera images saved"
          title="Evidence"
          tone="evidence"
          value={data.evidenceFrames ?? 0}
        >
          <p className="evaluation-overview-description">
            {data.acceptedEvidenceFrames ?? 0} accepted ·{" "}
            {data.unacceptedEvidenceFrames ?? 0} not accepted
          </p>
          <div className="evaluation-overview-card-footer">
            <a href="#evaluation-saved-images">
              View saved images
              <ArrowUpRight aria-hidden="true" size={14} />
            </a>
          </div>
        </OverviewCard>
        <OverviewCard
          icon={CheckCheck}
          label="passed on the first attempt"
          title="First-pass rate"
          tone="performance"
          value={rate === null ? "—" : `${Math.round(rate * 100)}%`}
        >
          {rate === null ? (
            <p className="evaluation-overview-note">
              No first attempts recorded yet.
            </p>
          ) : (
            <>
              <progress
                aria-label="Steps passed on the first recorded attempt"
                className="evaluation-overview-progress"
                max={firstAttempts}
                value={firstPasses}
              />
              <p className="evaluation-overview-note">
                {firstPasses} of {firstAttempts} steps passed first time.
              </p>
            </>
          )}
        </OverviewCard>
      </div>
    </section>
  );
}
