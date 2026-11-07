import { ArrowUpRight, Camera, ClipboardList } from "lucide-react";
import Link from "next/link";
import type { Evaluation } from "@/lib/contracts";
import { EvidenceRecords } from "./evidence";

export function EvaluationInsights({ data }: { data: Evaluation }) {
  const visualSteps = data.visualSteps ?? 0;
  const verified = data.verifiedVisualSteps ?? 0;
  const coverage =
    data.evidenceCoverage === null
      ? "No visual checkpoints recorded"
      : `${(data.evidenceCoverage * 100).toFixed(1)}%`;
  return (
    <div className="evaluation-insights">
      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Work in progress</h2>
            <p>Follow the saved session to understand what needs attention.</p>
          </div>
          <ClipboardList aria-hidden="true" size={20} />
        </header>
        <div className="panel-body evaluation-attention">
          <p>
            <strong>{data.active}</strong> sessions are still open.
          </p>
          <p>
            <strong>{data.held ?? 0}</strong> steps are held for recovery.
          </p>
          <p>
            <strong>{data.unclearChecks ?? 0}</strong> visual checks were
            recorded as unclear.
          </p>
          <p>
            <strong>{data.errorChecks ?? 0}</strong> checks could not complete.
          </p>
          <p>
            <strong>{data.deviations ?? 0}</strong> issues recorded ·{" "}
            <strong>{data.openEscalations ?? 0}</strong> open escalations
          </p>
          <Link className="button" href="/reports">
            Review session records
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </section>
      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Visual evidence coverage</h2>
            <p>Accepted evidence for required camera checkpoints.</p>
          </div>
          <Camera aria-hidden="true" size={20} />
        </header>
        <div className="panel-body evaluation-coverage">
          <strong>{coverage}</strong>
          <p>
            {verified} of {visualSteps} required visual checkpoints have an
            accepted frame.
          </p>
          <progress
            aria-label="Required visual checkpoints with accepted evidence"
            max={Math.max(visualSteps, 1)}
            value={verified}
          />
          <p>
            {data.evidenceFrames ?? 0} images saved ·{" "}
            {data.acceptedEvidenceFrames ?? 0} accepted ·{" "}
            {data.unacceptedEvidenceFrames ?? 0} not accepted
          </p>
          <p className="subtle-note">{data.evidenceCoverageScope}</p>
        </div>
      </section>
    </div>
  );
}

export function EvaluationEvidence({ data }: { data: Evaluation }) {
  const evidence = data.recentEvidence ?? [];
  const labels = Object.fromEntries(
    evidence.map((frame) => [frame.id, `${frame.sopKey} · ${frame.stepTitle}`])
  );
  const recordLinks = Object.fromEntries(
    evidence.map((frame) => [frame.id, `/reports/runs/${frame.runId}`])
  );
  return (
    <section
      className="panel evaluation-saved-images"
      id="evaluation-saved-images"
    >
      <header className="panel-head">
        <div>
          <h2>Recent saved camera images</h2>
          <p>
            Actual evidence from sessions matching the current filters. Open a
            session to see every attempt and image.
          </p>
        </div>
        <span className="count">{data.evidenceFrames ?? 0} saved</span>
      </header>
      <div className="panel-body">
        <EvidenceRecords
          evidence={evidence}
          labels={labels}
          recordLinks={recordLinks}
        />
      </div>
    </section>
  );
}
