import { describe, expect, test } from "bun:test";

import { findSourceHighlight } from "../../apps/web/src/components/sop-intelligence/source-highlight";
import type {
  Opportunity,
  SopDocument,
} from "../../apps/web/src/components/sop-intelligence/types";

const visualInstruction = "Inspect the exposed switch for visible damage.";
const humanInstruction = "Pull the keycap upward using a keycap puller.";
const text = `Preparation\n${humanInstruction}\n${visualInstruction}\nKeep the work area clear.`;
const document: SopDocument = {
  format: "PDF",
  id: "source",
  name: "keyboard.pdf",
  origin: "server",
  pageCount: 1,
  sections: [{ heading: "Page 1", id: "page-one", page: 1, text }],
  title: "Keyboard procedure",
};
const visual: Opportunity = {
  capabilities: ["Visual checkpoint"],
  category: "ai-verified",
  id: "inspect-switch",
  instruction: visualInstruction,
  reason: "Inspect the switch.",
  sectionId: "page-one",
  sourceQuote: visualInstruction,
  title: "Inspect the switch",
};
const human: Opportunity = {
  ...visual,
  category: "human-performed",
  id: "remove-keycap",
  instruction: humanInstruction,
  sourceQuote: humanInstruction,
  title: "Remove the keycap",
};

describe("per-flag source highlights", () => {
  test("green and red cards on the same page select different instructions", () => {
    const visualRange = findSourceHighlight(document, visual);
    const humanRange = findSourceHighlight(document, human);
    expect(visualRange).not.toBeNull();
    expect(humanRange).not.toBeNull();
    expect(text.slice(visualRange?.start, visualRange?.end)).toBe(
      visualInstruction
    );
    expect(text.slice(humanRange?.start, humanRange?.end)).toBe(
      humanInstruction
    );
    expect(humanRange?.end).toBeLessThan(visualRange?.start ?? 0);
  });

  test("does not fall back to a page for old, unresolved, or stale quotes", () => {
    for (const quote of [undefined, null, "", "  ", "Inspect the keycap."]) {
      expect(
        findSourceHighlight(document, { ...visual, sourceQuote: quote })
      ).toBeNull();
    }
    expect(findSourceHighlight(document, undefined)).toBeNull();
    expect(
      findSourceHighlight(document, { ...visual, sectionId: "other-page" })
    ).toBeNull();
  });

  test("rejects ambiguous repeated text rather than picking the first occurrence", () => {
    const repeated = {
      ...document,
      sections: [
        {
          ...document.sections[0],
          text: `${visualInstruction}\n${visualInstruction}`,
        },
      ],
    };
    expect(findSourceHighlight(repeated, visual)).toBeNull();
  });

  test("preserves Unicode and original line breaks around the exact excerpt", () => {
    const quote = "Periksa label 🔧\nsebelum melanjutkan.";
    const original = `⚠️ Persiapan\n${quote}\nSelesai.`;
    const unicodeDocument = {
      ...document,
      sections: [{ ...document.sections[0], text: original }],
    };
    const range = findSourceHighlight(unicodeDocument, {
      ...visual,
      sourceQuote: quote,
    });
    expect(range).not.toBeNull();
    if (!range) {
      throw new Error("Expected the unique excerpt to resolve");
    }
    expect(original.slice(range.start, range.end)).toBe(quote);
    expect(
      original.slice(0, range.start) + quote + original.slice(range.end)
    ).toBe(original);
  });
});
