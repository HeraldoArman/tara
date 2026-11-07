import type { Opportunity, SopDocument } from "./types";

export interface SourceHighlight {
  end: number;
  sectionId: string;
  start: number;
}

/** Highlight only a unique, verbatim excerpt supplied for this flag. */
export function findSourceHighlight(
  document: SopDocument,
  opportunity: Opportunity | undefined
): SourceHighlight | null {
  const quote = opportunity?.sourceQuote;
  if (!(opportunity && quote?.trim())) {
    return null;
  }
  const section = document.sections.find(
    (item) => item.id === opportunity.sectionId
  );
  if (!section) {
    return null;
  }
  const start = section.text.indexOf(quote);
  if (start < 0 || section.text.indexOf(quote, start + 1) !== -1) {
    return null;
  }
  return { end: start + quote.length, sectionId: section.id, start };
}
