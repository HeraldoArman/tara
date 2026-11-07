/** Drafts deliberately retain schema-invalid JSON until the manager repairs them. */
export function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
export function isStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}
export interface ReferenceDraftStep extends Record<string, unknown> {
  id: string;
  referenceMediaIds?: string[];
  sources: { heading: string; page?: number | null }[];
  title: string;
}
function validCitation(value: unknown): boolean {
  const source = objectRecord(value);
  return (
    !!source &&
    typeof source.heading === "string" &&
    (source.page === undefined ||
      source.page === null ||
      (typeof source.page === "number" && Number.isInteger(source.page)))
  );
}
export function referenceStepsForDraft(
  definition: unknown
): ReferenceDraftStep[] | null {
  const raw = objectRecord(definition);
  if (!(raw && Array.isArray(raw.steps) && raw.steps.length)) {
    return null;
  }
  const ids = new Set<string>();
  for (const entry of raw.steps) {
    const step = objectRecord(entry);
    if (
      !step ||
      typeof step.id !== "string" ||
      !step.id ||
      ids.has(step.id) ||
      typeof step.title !== "string" ||
      !Array.isArray(step.sources) ||
      !step.sources.length ||
      !step.sources.every(validCitation) ||
      (step.referenceMediaIds !== undefined &&
        !isStringList(step.referenceMediaIds))
    ) {
      return null;
    }
    ids.add(step.id);
  }
  return raw.steps as ReferenceDraftStep[];
}
