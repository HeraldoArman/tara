import type { components } from "@/lib/generated/api";

export type OpportunityCategory =
  | "ai-assisted"
  | "ai-verified"
  | "human-performed"
  | "human-approval";

export interface SourceSection {
  heading: string;
  id: string;
  page: number | null;
  text: string;
}

export interface SopDocument {
  format: string;
  id: string;
  name: string;
  origin: "sample" | "upload" | "server";
  pageCount: number | null;
  sections: SourceSection[];
  size?: number | null;
  sourceKind?: "source-document" | "procedure-definition";
  title: string;
}

export interface Opportunity {
  capabilities: string[];
  category: OpportunityCategory;
  id: string;
  instruction?: string | null;
  reason: string;
  sectionId: string;
  sourceQuote?: string | null;
  title: string;
}

export interface SopAnalysis {
  document: SopDocument;
  opportunities: Opportunity[];
}

export type SavedSopAnalysis = components["schemas"]["SopIntelligenceResponse"];
export type SavedSopVersion = SavedSopAnalysis["version"];

export type OpportunityFilter = "all" | "assist" | "human";

export const categoryLabels: Record<OpportunityCategory, string> = {
  "ai-assisted": "AI-assisted",
  "ai-verified": "Visual checkpoint",
  "human-approval": "Human confirmation",
  "human-performed": "Human-performed",
};

export function canAssist(category: OpportunityCategory): boolean {
  return category === "ai-assisted" || category === "ai-verified";
}
