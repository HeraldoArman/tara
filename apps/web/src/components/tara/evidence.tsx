"use client";
import { ArrowUpRight, Camera, LoaderCircle } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { api, dateTime, errorMessage } from "@/lib/api";
import type { Evidence } from "@/lib/contracts";
import { Status } from "./ui";

export function EvidenceRecords({ evidence }: { evidence: Evidence[] }) {
  const [error, setError] = useState("");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const view = async (id: string) => {
    setError("");
    setBusy(id);
    try {
      const result = await api<{ url: string }>(`/evidence/${id}/url`);
      setUrls((previous) => ({ ...previous, [id]: result.url }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  };
  return (
    <>
      {error ? (
        <div className="notice danger" role="alert">
          {error}
        </div>
      ) : null}
      {evidence.map((item) => (
        <div className="evidence-record" key={item.id}>
          <article className="evidence-card">
            <Camera size={22} />
            <div>
              <strong>Step {item.stepId}</strong>
              <p>{dateTime(item.capturedAt)}</p>
              <span className="mono">SHA-256 {item.sha256.slice(0, 16)}…</span>
            </div>
            <Status value={item.accepted ? "accepted" : "rejected"} />
            <button
              aria-label={`View evidence for ${item.stepId}`}
              className="icon-button"
              disabled={!!busy}
              onClick={() => view(item.id)}
              type="button"
            >
              {busy === item.id ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <ArrowUpRight size={18} />
              )}
            </button>
          </article>
          {urls[item.id] ? (
            <a
              className="evidence-image-link"
              href={urls[item.id]}
              rel="noopener noreferrer"
              target="_blank"
            >
              <Image
                alt={`${item.accepted ? "Accepted" : "Rejected"} verification frame for step ${item.stepId}`}
                height={360}
                src={urls[item.id]}
                unoptimized
                width={640}
              />
              <span>
                Open original frame
                <ArrowUpRight size={13} />
              </span>
            </a>
          ) : null}
        </div>
      ))}
      {evidence.length === 0 ? (
        <p className="inline-empty">
          Accepted and rejected evidence appear here after a visual check.
        </p>
      ) : null}
    </>
  );
}
