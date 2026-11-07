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
  origin: "sample" | "upload";
  pageCount: number | null;
  sections: SourceSection[];
  size: number;
  title: string;
}

export interface Opportunity {
  capabilities: string[];
  category: OpportunityCategory;
  id: string;
  reason: string;
  sectionId: string;
  title: string;
}

export interface SopAnalysis {
  document: SopDocument;
  opportunities: Opportunity[];
}

export type OpportunityFilter = "all" | "assist" | "human";

export const categoryLabels: Record<OpportunityCategory, string> = {
  "ai-assisted": "AI-assisted",
  "ai-verified": "AI-verified",
  "human-approval": "Human approval",
  "human-performed": "Human-performed",
};

export function canAssist(category: OpportunityCategory): boolean {
  return category === "ai-assisted" || category === "ai-verified";
}
