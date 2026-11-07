import type { Opportunity, SopDocument } from "./types";

export interface SourceHighlight {
  end: number;
  kind: "exact" | "passage" | "instruction";
  sectionId: string;
  start: number;
}

/** Prefer a verified excerpt; otherwise show the complete cited passage in context. */
export function findSourceHighlight(
  document: SopDocument,
  opportunity: Opportunity | undefined
): SourceHighlight | null {
  if (!opportunity) {
    return null;
  }
  const section = document.sections.find(
    (item) => item.id === opportunity.sectionId
  );
  if (!section?.text.trim()) {
    return null;
  }
  const savedInstruction =
    document.sourceKind === "procedure-definition" ||
    section.heading.startsWith(
      "Saved instruction — original source citation unresolved:"
    );
  const quote = opportunity.sourceQuote;
  if (quote?.trim()) {
    const start = section.text.indexOf(quote);
    if (start >= 0 && section.text.indexOf(quote, start + 1) === -1) {
      return {
        end: start + quote.length,
        kind: savedInstruction ? "instruction" : "exact",
        sectionId: section.id,
        start,
      };
    }
  }
  return {
    end: section.text.length,
    kind: savedInstruction ? "instruction" : "passage",
    sectionId: section.id,
    start: 0,
  };
}

export function highlightDescription(
  highlight: SourceHighlight | null
): string {
  switch (highlight?.kind) {
    case "exact":
      return "Exact source excerpt highlighted";
    case "passage":
      return "Cited passage highlighted · exact excerpt unavailable";
    case "instruction":
      return "Saved instruction highlighted · original source unavailable";
    default:
      return "Source text unavailable";
  }
}
