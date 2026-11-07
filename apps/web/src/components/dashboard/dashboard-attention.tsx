import { Button } from "@tara/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@tara/ui/components/card";
import { ArrowUpRight, CircleCheck, TriangleAlert } from "lucide-react";
import { useCallback } from "react";
import type {
  DashboardSopSummary,
  DashboardStepSummary,
} from "./dashboard-analytics";
import { formatCount } from "./dashboard-format";

interface AttentionProps {
  onSelect: (id: string) => void;
  sops: readonly DashboardSopSummary[];
  steps: readonly DashboardStepSummary[];
}

function AttentionStep({
  step,
  code,
  max,
  onSelect,
}: {
  step: DashboardStepSummary;
  code: string;
  max: number;
  onSelect: (id: string) => void;
}) {
  const select = useCallback(
    () => onSelect(step.sopId),
    [onSelect, step.sopId]
  );
  return (
    <li>
      <button
        aria-label={`Focus ${code}, step ${step.stepNumber}: ${step.title}`}
        className="dash-attention-step"
        onClick={select}
        type="button"
      >
        <div>
          <span>
            {code} · STEP {step.stepNumber}
          </span>
          <strong>{step.title}</strong>
        </div>
        <span className="dash-attention-count">
          {formatCount(step.warning)}
          <span>warnings</span>
        </span>
      </button>
      <div aria-hidden="true" className="dash-attention-track">
        <span style={{ width: `${(step.warning / max) * 100}%` }} />
      </div>
    </li>
  );
}

export function DashboardAttention({ sops, steps, onSelect }: AttentionProps) {
  const topSteps = steps.filter((step) => step.warning > 0).slice(0, 3);
  const highest = topSteps[0]?.warning ?? 1;
  const [topSop] = sops.toSorted((a, b) => b.warning - a.warning);
  const selectTop = useCallback(() => {
    if (topSop) {
      onSelect(topSop.sop.id);
    }
  }, [onSelect, topSop]);
  return (
    <Card className="dash-panel dash-attention">
      <CardHeader>
        <p className="dash-panel-eyebrow">
          <TriangleAlert aria-hidden="true" />A CLOSER LOOK
        </p>
        <CardTitle>
          <h2>Where attention gathers.</h2>
        </CardTitle>
        <CardDescription>
          Steps with the most Warning triggers in this view.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {topSteps.length ? (
          <ol className="dash-attention-list">
            {topSteps.map((step) => (
              <AttentionStep
                code={
                  sops.find((row) => row.sop.id === step.sopId)?.sop.code ??
                  "SOP"
                }
                key={`${step.sopId}-${step.stepId}`}
                max={highest}
                onSelect={onSelect}
                step={step}
              />
            ))}
          </ol>
        ) : (
          <div className="dash-attention-empty">
            <CircleCheck aria-hidden="true" />
            <strong>No Warning triggers</strong>
            <p>No warnings were recorded in this sample selection.</p>
          </div>
        )}
      </CardContent>
      <CardFooter>
        {topSop && topSop.warning > 0 ? (
          <Button
            className="dash-text-action"
            onClick={selectTop}
            variant="ghost"
          >
            Focus the most flagged SOP
            <ArrowUpRight data-icon="inline-end" />
          </Button>
        ) : (
          <p className="dash-caption">
            A zero count is not a compliance assessment.
          </p>
        )}
      </CardFooter>
    </Card>
  );
}
