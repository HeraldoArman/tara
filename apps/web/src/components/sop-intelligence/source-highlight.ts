import type { Opportunity, SopDocument } from "./types";

export interface SourceHighlight {
  end: number;
  kind: "exact" | "step" | "instruction" | "sentences";
  ranges?: Array<{ start: number; end: number }>;
  sectionId: string;
  start: number;
}

const NUMBERED_HEADING = /^(?:step[ \t]+)?\d+(?:\.\d+)*[.) \t:–-]+(.+)$/gim;
const SENTENCE_END = /(?<=[.!?])\s+/u;
const REGEX_ESCAPE = /[.*+?^${}()|[\]\\]/g;
const WHITESPACE = /\s+/;
const WORD_CHAR = /[\p{L}\p{N}]/u;
const TITLE_PUNCTUATION = /[^\p{L}\p{N}]+/gu;

function normalizedTitle(value: string): string {
  return value.toLowerCase().replace(TITLE_PUNCTUATION, " ").trim();
}

function findSentenceHighlight(
  text: string,
  instruction: string,
  sectionId: string
): SourceHighlight | null {
  const sentences = instruction.split(SENTENCE_END);
  const ranges: Array<{ start: number; end: number }> = [];
  for (const sentence of sentences) {
    const words = sentence.trim().split(WHITESPACE);
    if (words.length < 3) {
      continue;
    }
    const pattern = words
      .map((word) => word.replace(REGEX_ESCAPE, "\\$&"))
      .join("\\s+");
    const matches = [...text.matchAll(new RegExp(pattern, "giu"))];
    if (matches.length === 1) {
      const [match] = matches;
      const start = match.index;
      const before = text[start - 1];
      const after = text[start + match[0].length];
      if (
        !(
          (before && WORD_CHAR.test(before)) ||
          (after && WORD_CHAR.test(after))
        )
      ) {
        ranges.push({ end: start + match[0].length, start });
      }
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  const distinct = ranges.filter(
    (range, index) => index === 0 || range.start >= ranges[index - 1].end
  );
  if (distinct.length) {
    const [first] = distinct;
    return {
      end: first.end,
      kind: "sentences",
      ranges: distinct,
      sectionId,
      start: first.start,
    };
  }
  return null;
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
  const sentenceHighlight = findSentenceHighlight(
    section.text,
    opportunity.instruction ?? "",
    section.id
  );
  if (sentenceHighlight) {
    return sentenceHighlight;
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
    case "sentences":
      return "Matching instruction sentences highlighted";
    case "step":
      return "Matching source step highlighted";
    case "instruction":
      return "Saved instruction highlighted · original source unavailable";
    default:
      return "Exact source excerpt unavailable";
  }
}
