import type { components } from "./generated/api";

type Schemas = components["schemas"];
type PublicSchema<K extends keyof Schemas> = {
  [P in keyof Schemas[K] as string extends P
    ? never
    : number extends P
      ? never
      : P]: Schemas[K][P];
};
export type User = PublicSchema<"UserResponse">;
export type Role = User["role"];
export type WorkOrder = PublicSchema<"WorkOrderResponse">;
export type RunRecord = PublicSchema<"RunRecordResponse">;
export type RunRecordPage = PublicSchema<"RunRecordListResponse">;
export type RecentEvidence = PublicSchema<"RecentEvidenceResponse">;
export type Source = Schemas["Source"] & { section?: string; text?: string };
export type Criterion = Schemas["Criterion"];
export type Verification = Schemas["Verification"];
export type SopStep = Pick<
  Schemas["RunStepResponse"],
  "id" | "title" | "instruction" | "rationale" | "verification"
> & {
  sources: Source[];
  onPass?: { action: string };
  onFail?: { action: string };
  referenceMediaIds?: string[];
};
export type Attempt = Omit<PublicSchema<"AttemptResponse">, "result"> & {
  status?: string;
  response?: string;
  explanation?: string;
  result: {
    criteria?: { id: string; verdict: string; reason: string }[];
    response?: string;
    [key: string]: unknown;
  };
};
export type RunStep = Omit<
  PublicSchema<"RunStepResponse">,
  "sources" | "attempts"
> & { sources: Source[]; attempts: Attempt[] };
export type Alert = PublicSchema<"AlertResponse"> & { nextAction?: string };
export type Evidence = PublicSchema<"EvidenceResponse"> & {
  status?: string;
  createdAt?: string;
};
/** Narrow view types for the API's explicitly open-ended audit/issue dictionaries. */
export interface Issue {
  createdAt?: string;
  description?: string;
  id: string;
  reason?: string;
  status: string;
  stepId?: string;
}
export interface AuditEvent {
  actorId?: string;
  createdAt?: string;
  eventType?: string;
  id: string;
  message?: string;
  occurredAt?: string;
  payload?: Record<string, unknown>;
  stepId?: string;
  type?: string;
}
export interface ToolCall {
  arguments: Record<string, unknown>;
  createdAt: string;
  durationMs: number;
  id: string;
  name: string;
  result: Record<string, unknown>;
  status: string;
}
export interface ActivityPage {
  hasMore: boolean;
  items: AuditEvent[];
  limit: number;
  nextOffset: number | null;
  offset: number;
  toolCalls: ToolCall[];
}
export type SopSummary = PublicSchema<"SOPSummaryResponse"> & {
  scope: string;
  prerequisites: string[];
};
export type Run = Omit<
  PublicSchema<"RunResponse">,
  "steps" | "deviations" | "escalations" | "alerts" | "sop"
> & {
  alerts: Alert[];
  steps: RunStep[];
  deviations: Issue[];
  escalations: Issue[];
  reportId?: string | null;
  media?: ReferenceMedia[];
  sop: SopSummary;
};
export type SopVersion = Omit<
  PublicSchema<"SOPVersionResponse">,
  "definition"
> & {
  definition: {
    sopKey?: string;
    title?: string;
    version?: string;
    scope?: string;
    prerequisites?: string[];
    steps: SopStep[];
  };
  steps?: SopStep[];
  sourceFilename?: string;
  media?: ReferenceMedia[];
};
export type ReferenceMedia = PublicSchema<"SOPMediaResponse"> & {
  sha256?: string;
};
export type Sop = Schemas["SOPListResponse"]["items"][number] & {
  id: string;
  key: string;
  title: string;
  versions: SopVersion[];
};
export interface Review {
  createdAt: string;
  decision: string;
  id: string;
  note: string;
  reviewerId?: string;
  reviewerName?: string;
}
export type Report = Omit<
  PublicSchema<"ReportResponse">,
  | "steps"
  | "deviations"
  | "escalations"
  | "auditEvents"
  | "reviews"
  | "sop"
  | "toolCalls"
> & {
  steps: RunStep[];
  deviations: Issue[];
  escalations: Issue[];
  auditEvents: AuditEvent[];
  reviews: Review[];
  sop: SopSummary;
  toolCalls?: ToolCall[];
  toolHistoryScope?: string;
  snapshot?: Partial<Run> & {
    auditEvents?: AuditEvent[];
    toolCalls?: ToolCall[];
    toolHistoryScope?: string;
  };
};
export interface Part {
  currency?: string;
  id: string;
  location: string;
  name: string;
  price?: number;
  priceCents?: number;
  quantity?: number;
  sku: string;
  stock?: number;
}
export interface TechnicianMetric {
  active: number;
  activeSeconds: number;
  attemptedSteps: number;
  attempts: number;
  completed: number;
  firstPassRate: number | null;
  partial: number;
  retakes: number;
  runs: number;
  technicianId: string;
  technicianName: string;
}
export type Evaluation = Schemas["EvaluationResponse"] & {
  technicianMetrics: TechnicianMetric[];
};
export interface List<T> {
  items: T[];
}
export interface Connection {
  roomName?: string;
  token: string;
  url: string;
  workerIdentity: string;
}
