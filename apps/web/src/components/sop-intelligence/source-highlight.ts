import type { Opportunity, SopDocument } from "./types";

export interface SourceHighlight {
  end: number;
  kind: "exact" | "step" | "instruction";
  sectionId: string;
  start: number;
}

const NUMBERED_HEADING = /^(?:step[ \t]+)?\d+(?:\.\d+)*[.) \t:–-]+(.+)$/gim;
const TITLE_PUNCTUATION = /[^\p{L}\p{N}]+/gu;

function normalizedTitle(value: string): string {
  return value.toLowerCase().replace(TITLE_PUNCTUATION, " ").trim();
}

/** Only select a numbered source block when its heading uniquely matches the saved step. */
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
  if (savedInstruction) {
    return {
      end: section.text.length,
      kind: "instruction",
      sectionId: section.id,
      start: 0,
    };
  }
  const headings = [...section.text.matchAll(NUMBERED_HEADING)];
  const title = normalizedTitle(opportunity.title);
  const matches = headings.filter(
    (heading) => normalizedTitle(heading[1] ?? "") === title
  );
  if (title && matches.length === 1) {
    const [heading] = matches;
    const index = headings.indexOf(heading);
    const start = heading.index ?? 0;
    const end = headings[index + 1]?.index ?? section.text.length;
    return { end, kind: "step", sectionId: section.id, start };
  }
  return null;
}

export function highlightDescription(
  highlight: SourceHighlight | null
): string {
  switch (highlight?.kind) {
    case "exact":
      return "Exact source excerpt highlighted";
    case "step":
      return "Matching source step highlighted";
    case "instruction":
      return "Saved instruction highlighted · original source unavailable";
    default:
      return "Exact source excerpt unavailable";
  }
}
