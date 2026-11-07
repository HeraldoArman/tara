import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@tara/ui/components/card";
import { ArrowUpRight, ChartNoAxesCombined, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { Evaluation } from "@/lib/contracts";
import { formatCount } from "./dashboard-format";
import {
  formatRate,
  recordedCount,
  recordedSteps,
  runOutcomes,
} from "./owner-dashboard-data";

function ChartEmpty({ children }: { children: string }) {
  return (
    <div className="ops-chart-empty">
      <ChartNoAxesCombined aria-hidden="true" size={25} />
      <p>{children}</p>
    </div>
  );
}

export function RunOutcomeChart({ summary }: { summary: Evaluation }) {
  const outcomes = runOutcomes(summary);
  return (
    <Card className="dash-panel ops-outcomes">
      <CardHeader>
        <p className="dash-eyebrow">EXECUTION SNAPSHOT</p>
        <h2>Every run, accounted for.</h2>
        <CardDescription>
          Current outcomes of runs created in the selected period.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {summary.runs > 0 ? (
          <>
            <div className="ops-chart-total">
              <strong>{formatCount(summary.completed)}</strong>
              <div>
                <span>complete runs</span>
                <small>
                  {formatRate(summary.completed / summary.runs)} of{" "}
                  {formatCount(summary.runs)} recorded runs
                </small>
              </div>
            </div>
            <div aria-hidden="true" className="ops-stacked-bar">
              {outcomes.map(({ key, value }) => (
                <span
                  data-outcome={key}
                  hidden={value === 0}
                  key={key}
                  style={{ width: `${(value / summary.runs) * 100}%` }}
                />
              ))}
            </div>
            <dl className="ops-outcome-legend">
              {outcomes.map(({ key, label, value }) => (
                <div data-outcome={key} key={key}>
                  <dt>
                    <i aria-hidden="true" />
                    {label}
                  </dt>
                  <dd>{formatCount(value)}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <ChartEmpty>No recorded runs match these filters.</ChartEmpty>
        )}
      </CardContent>
    </Card>
  );
}

export function VerificationSnapshot({ summary }: { summary: Evaluation }) {
  const items = [
    { key: "aiVerified", label: "AI-verified steps", tone: "success" },
    { key: "attested", label: "Human-attested steps", tone: "active" },
    { key: "held", label: "Held steps", tone: "warning" },
    { key: "openEscalations", label: "Open escalations", tone: "warning" },
    { key: "returned", label: "Reports returned for review", tone: "neutral" },
  ];
  return (
    <Card className="dash-panel ops-verification">
      <CardHeader>
        <p className="dash-panel-eyebrow">
          <ShieldCheck aria-hidden="true" size={13} /> CHECKPOINTS & FOLLOW-UP
        </p>
        <h2>Keep the evidence in view.</h2>
        <CardDescription>
          Human attestation and AI verification stay separate.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="ops-verification-list">
          {items.map(({ key, label, tone }) => {
            const count = recordedCount(summary[key]);
            return (
              <div data-tone={tone} key={key}>
                <dt>{label}</dt>
                <dd>{count === null ? "—" : formatCount(count)}</dd>
              </div>
            );
          })}
        </dl>
        <Link className="dash-text-action" href="/evaluation">
          Open detailed evaluation <ArrowUpRight aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  );
}

export function TechnicianActivity({ summary }: { summary: Evaluation }) {
  const metrics = [...summary.technicianMetrics].sort(
    (left, right) =>
      right.runs - left.runs ||
      left.technicianName.localeCompare(right.technicianName)
  );
  const maximum = Math.max(1, ...metrics.map((metric) => metric.runs));
  return (
    <Card className="dash-panel ops-technicians">
      <CardHeader>
        <p className="dash-eyebrow">WORKFORCE ACTIVITY</p>
        <h2>Work across your team.</h2>
        <CardDescription>
          Run counts share one scale. Activity volume is not a performance
          score.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {metrics.length ? (
          <div className="ops-table-scroll">
            <table className="ops-team-table">
              <caption className="sr-only">
                Technician run outcomes for the selected SOP and period
              </caption>
              <thead>
                <tr>
                  <th scope="col">Technician</th>
                  <th scope="col">Run distribution</th>
                  <th scope="col">Complete</th>
                  <th scope="col">Active / paused</th>
                  <th scope="col">Partial</th>
                  <th scope="col">Other</th>
                  <th scope="col">All runs</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((metric) => (
                  <tr key={metric.technicianId}>
                    <th scope="row">{metric.technicianName}</th>
                    <td>
                      <div aria-hidden="true" className="ops-team-track">
                        <div
                          className="ops-stacked-bar"
                          style={{ width: `${(metric.runs / maximum) * 100}%` }}
                        >
                          {runOutcomes(metric).map(({ key, value }) => (
                            <span
                              data-outcome={key}
                              hidden={value === 0}
                              key={key}
                              style={{
                                width: `${(value / Math.max(1, metric.runs)) * 100}%`,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </td>
                    <td>{formatCount(metric.completed)}</td>
                    <td>{formatCount(metric.active)}</td>
                    <td>{formatCount(metric.partial)}</td>
                    <td>
                      {formatCount(
                        Math.max(
                          0,
                          metric.runs -
                            metric.completed -
                            metric.active -
                            metric.partial
                        )
                      )}
                    </td>
                    <td>{formatCount(metric.runs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ChartEmpty>
            Team activity will appear when a matching run is recorded.
          </ChartEmpty>
        )}
      </CardContent>
    </Card>
  );
}

export function StepActivity({
  summary,
  sopTitle,
}: {
  summary: Evaluation;
  sopTitle?: string;
}) {
  const steps = recordedSteps(summary);
  const maximum = Math.max(1, ...steps.map((step) => step.held));
  return (
    <Card className="dash-panel ops-steps" id="sop-breakdown">
      <CardHeader>
        <p className="dash-eyebrow">PROCEDURE DETAIL</p>
        <h2>A closer look at each step.</h2>
        <CardDescription>
          {sopTitle
            ? `${sopTitle} · Held steps first. Counts include all versions in scope.`
            : "Select a procedure above to inspect its recorded checkpoints."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sopTitle && steps.length ? (
          <div className="ops-table-scroll">
            <table>
              <caption className="sr-only">
                Recorded step attempts and held checkpoints for {sopTitle}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Step ID</th>
                  <th scope="col">Held</th>
                  <th scope="col">Runs with step</th>
                  <th scope="col">Attempts</th>
                  <th scope="col">Passed first attempt</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((step) => (
                  <tr key={step.stepId}>
                    <th scope="row">{step.stepId}</th>
                    <td>
                      <div className="ops-held-cell">
                        <div aria-hidden="true" className="ops-held-track">
                          <span
                            style={{ width: `${(step.held / maximum) * 100}%` }}
                          />
                        </div>
                        <span>{formatCount(step.held)}</span>
                      </div>
                    </td>
                    <td>{formatCount(step.runs)}</td>
                    <td>{formatCount(step.attempts)}</td>
                    <td>{formatCount(step.firstPass)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ChartEmpty>
            {sopTitle
              ? "No checkpoints are recorded for this procedure and period."
              : "Choose one SOP to keep steps from different procedures separate."}
          </ChartEmpty>
        )}
        <p className="ops-chart-note">
          A held step needs follow-up. Missing evidence alone does not establish
          a violation.
        </p>
      </CardContent>
    </Card>
  );
}
