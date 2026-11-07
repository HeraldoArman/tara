"use client";

import { ArrowUpRight, Camera, RefreshCw } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { dateTime, humanize } from "@/lib/api";
import type { Evidence, RunStep } from "@/lib/contracts";
import "./reports-records.css";

const IMAGE_PAGE_SIZE = 12;

function evidenceLabel(item: Evidence, steps: RunStep[]): string {
  if (item.accepted) {
    return "Accepted";
  }
  const attempt = steps
    .flatMap((step) => step.attempts)
    .find((candidate) => candidate.id === item.attemptId);
  return attempt?.outcome === "unclear"
    ? "Needs more evidence"
    : "Not accepted";
}

function SavedEvidenceImage({
  item,
  steps,
  title,
  recordLink,
}: {
  item: Evidence;
  steps: RunStep[];
  title?: string;
  recordLink?: string;
}) {
  const [revision, setRevision] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const source = `/api/v1/evidence/${encodeURIComponent(item.id)}/content${revision ? `?refresh=${revision}` : ""}`;
  const step = steps.find((candidate) => candidate.id === item.stepId);
  const heading = title ?? step?.title ?? `Step ${item.stepId}`;
  const label = evidenceLabel(item, steps);
  const refresh = () => {
    setFailed(false);
    setLoaded(false);
    setRevision((value) => value + 1);
  };

  return (
    <figure className="saved-evidence-card">
      <div className="saved-evidence-preview">
        {failed ? (
          <div className="saved-evidence-failure" role="status">
            <Camera aria-hidden="true" size={25} />
            <p>The saved image could not be loaded.</p>
            <button className="button small" onClick={refresh} type="button">
              <RefreshCw size={14} />
              Refresh image
            </button>
          </div>
        ) : (
          <a href={source} rel="noopener noreferrer" target="_blank">
            {loaded ? null : (
              <span className="saved-evidence-loading">
                Loading saved image…
              </span>
            )}
            <Image
              alt={`${label} camera frame for ${heading}`}
              height={item.height || 360}
              key={source}
              loading="lazy"
              onError={() => setFailed(true)}
              onLoad={() => setLoaded(true)}
              src={source}
              unoptimized
              width={item.width || 640}
            />
          </a>
        )}
      </div>
      <figcaption>
        <div className="saved-evidence-heading">
          <span className="eyebrow">SAVED IMAGE</span>
          <span
            className={`status status-${item.accepted ? "accepted" : "held"}`}
          >
            <span aria-hidden="true" />
            {label}
          </span>
        </div>
        <h3>{heading}</h3>
        <p>{dateTime(item.capturedAt)}</p>
        <p>
          {humanize(item.source)} · {item.width} × {item.height}
        </p>
        <span className="saved-evidence-digest mono">
          SHA-256 {item.sha256.slice(0, 16)}…
        </span>
        {failed ? null : (
          <a
            className="saved-evidence-original"
            href={source}
            rel="noopener noreferrer"
            target="_blank"
          >
            Open saved image <ArrowUpRight size={14} />
          </a>
        )}
        {recordLink ? (
          <a className="saved-evidence-original" href={recordLink}>
            View session record <ArrowUpRight size={14} />
          </a>
        ) : null}
      </figcaption>
    </figure>
  );
}

export function EvidenceRecords({
  evidence,
  steps = [],
  labels = {},
  recordLinks = {},
}: {
  evidence: Evidence[];
  steps?: RunStep[];
  labels?: Record<string, string>;
  recordLinks?: Record<string, string>;
}) {
  const [visible, setVisible] = useState(IMAGE_PAGE_SIZE);
  const sorted = [...evidence].sort((a, b) =>
    b.capturedAt.localeCompare(a.capturedAt)
  );

  if (!evidence.length) {
    return (
      <p className="inline-empty">
        No saved images yet. A visual check saves its camera frame here,
        including views that need clarification. Reading a model label does not
        verify a step.
      </p>
    );
  }

  return (
    <div className="saved-evidence">
      <div className="saved-evidence-grid">
        {sorted.slice(0, visible).map((item) => (
          <SavedEvidenceImage
            item={item}
            key={item.id}
            recordLink={recordLinks[item.id]}
            steps={steps}
            title={labels[item.id]}
          />
        ))}
      </div>
      {evidence.length > visible ? (
        <button
          className="button"
          onClick={() => setVisible((value) => value + IMAGE_PAGE_SIZE)}
          type="button"
        >
          Show more saved images ({evidence.length - visible} remaining)
        </button>
      ) : null}
    </div>
  );
}
