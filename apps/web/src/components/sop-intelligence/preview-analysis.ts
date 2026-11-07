import type {
  Opportunity,
  OpportunityCategory,
  SopAnalysis,
  SopDocument,
  SourceSection,
} from "./types";

interface PreviewRule {
  capabilities: string[];
  category: OpportunityCategory;
  pattern: RegExp;
  reason: string;
}

// Conservative frontend previews only. Live analysis should supply these same
// source-linked opportunities without using this keyword classifier.
const previewRules: PreviewRule[] = [
  {
    capabilities: ["Human review"],
    category: "human-approval",
    pattern:
      /\b(approv\w*|sign[ -]?off|supervisor|otorisasi|persetujuan|setujui|pengawas)\b/i,
    reason:
      "This passage mentions approval or supervision. Keep the decision with an authorized person and review the required sign-off in the source.",
  },
  {
    capabilities: ["Physical confirmation"],
    category: "human-performed",
    pattern:
      /\b(isolat\w*|disconnect\w*|lockout|electri\w*|hazard\w*|emergency|force|resistance|solder\w*|listrik|bahaya|darurat|cabut|tekanan|matikan)\b/i,
    reason:
      "This passage involves physical handling or a potentially critical condition. A person must perform and confirm the work before it can proceed.",
  },
  {
    capabilities: ["Human review"],
    category: "human-performed",
    pattern:
      /\b(not|never|cannot|mustn['’]?t|don['’]?t|no|tidak|jangan|dilarang)\b/i,
    reason:
      "This passage includes a restriction. A person should review its context and exceptions before deciding whether AI assistance is appropriate.",
  },
  {
    capabilities: ["OCR", "Information extraction"],
    category: "ai-assisted",
    pattern:
      /\b(serial|barcode|label|identif\w*|record\w*|document\w*|report\w*|catat\w*|lapor\w*|nomor|pindai\w*)\b/i,
    reason:
      "The passage contains information that tara may help read or capture. A person should confirm the extracted details against the original source.",
  },
  {
    capabilities: ["Computer vision", "Visual checkpoint"],
    category: "ai-verified",
    pattern:
      /\b(visual\w*|visible|inspect\w*|damage\w*|debris|housing|flush|terlihat|inspeksi|kerusakan|kotoran)\b/i,
    reason:
      "This passage describes a potentially observable condition. tara may help check it with a clear camera view, with human review whenever evidence is insufficient.",
  },
  {
    capabilities: ["Guided checklist"],
    category: "ai-assisted",
    pattern:
      /\b(check\w*|match\w*|compar\w*|confirm\w*|verif\w*|periksa\w*|cocok\w*|banding\w*|pastikan)\b/i,
    reason:
      "tara may guide this check and surface the relevant instruction. A person must confirm the result and decide whether the available evidence is adequate.",
  },
];

function mapSection(section: SourceSection): Opportunity {
  const rule = previewRules.find(({ pattern }) =>
    pattern.test(`${section.heading}\n${section.text}`)
  );

  return {
    capabilities: rule?.capabilities ?? ["Human judgment"],
    category: rule?.category ?? "human-performed",
    id: `opportunity-${section.id}`,
    reason:
      rule?.reason ??
      "The preview cannot establish a specific AI capability for this passage. Keep it with a person until its requirements and context have been reviewed.",
    sectionId: section.id,
    title: section.heading,
  };
}

export function createPreviewAnalysis(document: SopDocument): SopAnalysis {
  return {
    document,
    opportunities: document.sections.map(mapSection),
  };
}
