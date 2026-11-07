from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel


class Schema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class Login(Schema):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)


class AssetInput(Schema):
    model: str = Field(min_length=1, max_length=200)
    serial: str = Field(min_length=1, max_length=200)


class WorkOrderInput(Schema):
    reference: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=300)
    asset: AssetInput
    issue: str = Field(min_length=1, max_length=4000)
    priority: Literal["priority", "standard"] = "standard"
    assigned_username: str
    sop_version_id: str
    estimated_minutes: int = Field(default=20, ge=1, le=10080)


class CameraPairingClaim(Schema):
    token: str = Field(min_length=32, max_length=200)


class Source(Schema):
    heading: str
    page: int | None = None


class Criterion(Schema):
    id: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1)


class Verification(Schema):
    kind: Literal["visual", "attestation", "choice", "finalization"]
    criteria: list[Criterion] = Field(default_factory=list)
    options: list[str] = Field(default_factory=list)
    pass_options: list[str] = Field(default_factory=list)
    accepted_response: str = "confirmed"

    @model_validator(mode="after")
    def validate_accepted_response(self):
        if self.kind in {"attestation", "finalization"} and (
            not self.accepted_response.strip() or len(self.accepted_response) > 1000
        ):
            raise ValueError(
                "Attestation and finalization require a nonblank accepted response of at most "
                "1000 characters"
            )
        if self.kind == "choice" and any(
            not option.strip() or len(option) > 1000 for option in self.options + self.pass_options
        ):
            raise ValueError("Choice responses must be nonblank and at most 1000 characters")
        return self


class Transition(Schema):
    action: Literal["next", "retry", "hold", "escalate"]
    alert: str | None = None
    deviation: str | None = None


class Step(Schema):
    id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1)
    instruction: str = Field(min_length=1)
    rationale: str = ""
    sources: list[Source] = Field(min_length=1)
    verification: Verification
    on_pass: Transition = Field(default_factory=lambda: Transition(action="next"))
    on_fail: Transition = Field(default_factory=lambda: Transition(action="retry"))
    reference_media_ids: list[str] = Field(default_factory=list)
    required: bool = True


class SOPDefinition(Schema):
    sop_key: str = Field(min_length=1, max_length=100)
    version: str = Field(min_length=1, max_length=30)
    title: str = Field(min_length=1, max_length=300)
    scope: str = ""
    prerequisites: list[str] = Field(default_factory=list)
    steps: list[Step] = Field(min_length=1, max_length=100)
    allow_partial_close: bool = True


def normalize_sop_definition(definition: dict) -> dict:
    """Fill schema defaults and canonical aliases without mutating the saved input."""
    return SOPDefinition.model_validate(definition).model_dump(mode="json", by_alias=True)


class DraftEdit(Schema):
    definition: dict


class Review(Schema):
    decision: Literal["approved", "returned"]
    note: str = Field(default="", max_length=4000)


class Command(Schema):
    expected_version: int = Field(ge=1)
    expected_step_id: str | None = None
    expected_attempt_id: str | None = None
    idempotency_key: str = Field(min_length=8, max_length=100)


class ResponseCommand(Command):
    response: str = Field(min_length=1, max_length=1000)


class ControlCommand(Command):
    action: Literal["pause", "resume", "retry", "retest"]
    reason: str = Field(default="", max_length=4000)


class FinishCommand(Command):
    outcome: Literal["complete", "partial"]
    reason: str = Field(default="", max_length=4000)


class IssueCommand(Command):
    kind: str = Field(default="technician-reported", max_length=100)
    note: str = Field(min_length=1, max_length=4000)
    escalate: bool = False


class CriterionResult(Schema):
    id: str
    verdict: Literal["pass", "fail", "unclear"]
    reason: str


class VisualAssessment(Schema):
    criteria: list[CriterionResult]
    model: str
    assessment_id: str


# Public response contracts are the source for generated frontend OpenAPI types.
class PublicModel(BaseModel):
    model_config = ConfigDict(extra="allow")


class UserResponse(PublicModel):
    id: str
    organizationId: str
    username: str
    name: str
    role: Literal["technician", "supervisor", "sop_manager", "owner"]


class AssigneeListResponse(PublicModel):
    items: list[UserResponse]


class CameraPairingResponse(PublicModel):
    id: str
    expiresAt: str
    participantIdentity: str
    claimed: bool


class CameraPairingCreatedResponse(PublicModel):
    id: str
    token: str
    expiresAt: str
    participantIdentity: str


class CameraPairingStateResponse(PublicModel):
    pairing: CameraPairingResponse | None


class CameraPairingConnectionResponse(PublicModel):
    url: str
    token: str
    roomName: str
    participantIdentity: str
    expiresAt: str


class CameraPairingStatusResponse(PublicModel):
    active: bool
    expiresAt: str | None = None


class CameraPairingRevokedResponse(PublicModel):
    revoked: bool


class AssetResponse(PublicModel):
    model: str
    serial: str


class WorkOrderResponse(PublicModel):
    id: str
    reference: str
    title: str
    asset: AssetResponse
    issue: str
    priority: str
    status: str
    assignedTo: str
    sopVersionId: str
    estimatedMinutes: int
    runId: str | None = None


class WorkOrderListResponse(PublicModel):
    items: list[WorkOrderResponse]


class AttemptResponse(PublicModel):
    id: str
    number: int
    kind: str
    outcome: str
    result: dict
    createdAt: str


class RunStepResponse(PublicModel):
    id: str
    title: str
    instruction: str
    rationale: str
    sources: list[Source]
    verification: Verification
    status: str
    attempts: list[AttemptResponse]


class EvidenceResponse(PublicModel):
    id: str
    stepId: str
    attemptId: str
    accepted: bool
    sha256: str
    mediaType: str
    source: str
    model: str
    capturedAt: str
    width: int | None = None
    height: int | None = None
    assessmentId: str | None = None
    correlationId: str | None = None
    urlEndpoint: str


class SOPMediaResponse(PublicModel):
    id: str
    title: str
    heading: str
    page: int | None
    width: int
    height: int
    mediaType: str
    urlEndpoint: str


class AlertResponse(PublicModel):
    id: str
    eventId: str
    stepId: str | None
    attemptId: str | None
    message: str
    status: str
    createdAt: str


class SOPSummaryResponse(PublicModel):
    id: str
    key: str
    title: str
    version: str
    scope: str = ""
    prerequisites: list[str] = Field(default_factory=list)


class RunResponse(PublicModel):
    id: str
    workOrderId: str
    version: int
    status: str
    interactionMode: str
    currentStepId: str | None
    currentAttemptId: str | None
    workOrder: WorkOrderResponse
    sop: SOPSummaryResponse
    steps: list[RunStepResponse]
    alerts: list[AlertResponse]
    evidence: list[EvidenceResponse]
    media: list[SOPMediaResponse] = Field(default_factory=list)
    deviations: list[dict]
    escalations: list[dict]
    startedAt: str
    elapsedSeconds: int


class SOPVersionResponse(PublicModel):
    id: str
    sopId: str
    key: str
    title: str
    version: str
    versionNumber: int
    status: str
    definition: dict
    validationErrors: list[str]
    media: list[SOPMediaResponse] = Field(default_factory=list)
    source: dict | None


class SopIntelligenceSection(PublicModel):
    id: str
    heading: str
    page: int | None
    text: str


class SopIntelligenceDocument(PublicModel):
    id: str
    name: str
    title: str
    format: str
    origin: Literal["server"] = "server"
    sourceKind: Literal["source-document", "procedure-definition"]
    pageCount: int | None
    size: int | None = None
    sections: list[SopIntelligenceSection]


class SopIntelligenceOpportunity(PublicModel):
    id: str
    sectionId: str
    title: str
    category: Literal["ai-assisted", "ai-verified", "human-performed", "human-approval"]
    capabilities: list[str]
    reason: str


class SopIntelligenceVersion(PublicModel):
    id: str
    sopId: str
    key: str
    title: str
    version: str
    versionNumber: int
    status: str


class SopIntelligenceResponse(PublicModel):
    analysisMode: Literal["server-definition"] = "server-definition"
    version: SopIntelligenceVersion
    document: SopIntelligenceDocument
    opportunities: list[SopIntelligenceOpportunity]


class SOPListResponse(PublicModel):
    items: list[dict]


class ReportResponse(PublicModel):
    id: str
    runId: str
    revision: int
    outcome: str
    status: str
    workOrder: WorkOrderResponse
    sop: SOPSummaryResponse
    steps: list[RunStepResponse]
    evidence: list[EvidenceResponse]
    media: list[SOPMediaResponse] = Field(default_factory=list)
    deviations: list[dict]
    escalations: list[dict]
    auditEvents: list[dict]
    toolCalls: list[dict] = Field(default_factory=list)
    toolHistoryScope: str | None = None
    reviews: list[dict]
    createdAt: str
    digest: str


class ReportListResponse(PublicModel):
    items: list[ReportResponse]


class EvaluationResponse(PublicModel):
    runs: int
    completed: int
    partial: int
    active: int
    firstPassRate: float | None
    evidenceCoverage: float | None
    stepMetrics: list[dict]
    criterionFailures: list[dict]
    latency: list[dict]
    technicianMetrics: list[dict] = Field(default_factory=list)
