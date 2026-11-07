"use client";
import { ArrowUpRight, BookOpen, Globe } from "lucide-react";
import type { ReferenceMedia } from "@/lib/contracts";
import { ReferenceMediaCards } from "./reference-media";

export function ToolResults({ data }: { data: unknown }) {
  if (!data || typeof data !== "object") {
    return null;
  }
  const payload = data as Record<string, unknown>;
  const items = Array.isArray(payload.items)
    ? payload.items.filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === "object"
      )
    : [];
  const supplementary =
    payload.supplementary === true || payload.panel === "references";
  return (
    <section className="tool-results">
      <p className="tool-results-label">
        {supplementary ? <Globe size={14} /> : <BookOpen size={14} />}
        {supplementary
          ? "Supplementary web references · approved SOP takes precedence"
          : "Approved source excerpts"}
      </p>
      {items.map((item) => (
        <article
          className="tool-result"
          key={String(item.id ?? item.url ?? item.heading)}
        >
          <h3>
            {typeof item.title === "string"
              ? item.title
              : String(item.heading ?? "Approved source")}
          </h3>
          <p>{String(item.text ?? item.snippet ?? "")}</p>
          {typeof item.page === "number" ? (
            <span>Source page {item.page}</span>
          ) : null}
          {typeof item.url === "string" && isWebUrl(item.url) ? (
            <a href={item.url} rel="noopener noreferrer" target="_blank">
              View source
              <ArrowUpRight size={12} />
            </a>
          ) : null}
        </article>
      ))}
      {Array.isArray(payload.media) ? (
        <ReferenceMediaCards items={payload.media as ReferenceMedia[]} />
      ) : null}
      {items.length ? null : (
        <p className="subtle-note">
          No matching source excerpts were returned. Use the approved procedure
          or request escalation.
        </p>
      )}
    </section>
  );
}
export function SourceDocument({
  source,
}: {
  source: Record<string, unknown> | null;
}) {
  if (!source) {
    return null;
  }
  return (
    <details className="source-document">
      <summary>
        View original source ·{" "}
        {String(source.filename ?? "Approved source document")}
      </summary>
      <p className="subtle-note">
        SHA-256 {String(source.sha256 ?? "Unavailable")}
      </p>
      <ToolResults data={{ items: source.sections }} />
    </details>
  );
}
function isWebUrl(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol);
  } catch {
    return false;
  }
}
