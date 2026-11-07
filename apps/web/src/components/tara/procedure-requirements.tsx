export function ProcedureRequirements({
  scope,
  prerequisites,
  compact = false,
}: {
  scope?: unknown;
  prerequisites?: unknown;
  compact?: boolean;
}) {
  return (
    <section
      aria-label="Procedure scope and prerequisites"
      className={`procedure-requirements ${compact ? "compact" : ""}`}
    >
      <h3>Procedure scope</h3>
      <p>{scopeText(scope)}</p>
      <h3>Before you begin</h3>
      {isStringList(prerequisites) && prerequisites.length ? (
        <ul>
          {prerequisites.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>
          {prerequisites === undefined ||
          (isStringList(prerequisites) && !prerequisites.length)
            ? "No prerequisites were recorded."
            : "Prerequisites have an invalid format in this record. Review the draft validation errors."}
        </p>
      )}
    </section>
  );
}

import { isStringList } from "@/lib/draft-preview";

function scopeText(scope: unknown): string {
  if (scope === undefined || scope === "") {
    return "No scope was recorded for this version.";
  }
  return typeof scope === "string"
    ? scope
    : "Scope has an invalid format in this record. Review the draft validation errors.";
}
