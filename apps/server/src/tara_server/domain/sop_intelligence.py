"""Source-linked capability mapping from a saved, authorized procedure definition."""

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from tara_server.db.models import SOP, SOPDocument, User
from tara_server.domain.sops import authorized_version
from tara_server.errors import DomainError
from tara_server.schemas import normalize_sop_definition


def step_capability(step: dict, *, resolved: bool) -> dict:
    verification = step.get("verification")
    kind = verification.get("kind") if isinstance(verification, dict) else None
    if kind == "visual" and not verification.get("criteria"):
        kind = None
    if not resolved:
        return {
            "category": "human-performed",
            "capabilities": ["Human review", "Unresolved source citation"],
            "reason": "The saved step's citation does not resolve to an exact source heading and page. Review the procedure and its source before relying on an AI check.",
        }
    if kind == "visual":
        category = "ai-verified"
        capabilities = ["Visual checkpoint", "Fresh camera evidence"]
        reason = "This saved step defines a camera check against explicit visual criteria. It is a configured capability, not evidence that any work has passed. Unclear views require review or another check."
    elif kind == "finalization":
        category = "human-approval"
        capabilities = ["Human confirmation", "Procedure close-out"]
        reason = "The saved procedure requires a person's explicit final confirmation. This map does not approve, complete or certify the work."
    elif kind in {"attestation", "choice"}:
        category = "human-performed"
        capabilities = ["Guided checklist", "Technician confirmation"]
        reason = "The saved procedure requires the technician to provide an explicit response. TARa can explain the instruction, but the person's response is not visual verification."
    else:
        category = "human-performed"
        capabilities = ["Human review"]
        reason = "This saved step has no supported verification rule. Review the draft before assigning AI checks or executing the procedure."
    rationale = step.get("rationale")
    if isinstance(rationale, str) and rationale.strip():
        reason += " Procedure rationale: " + rationale.strip()
    return {"category": category, "capabilities": capabilities, "reason": reason}


async def intelligence(session: AsyncSession, actor: User, version_id: str) -> dict:
    version = await authorized_version(session, actor, version_id)
    sop = await session.get(SOP, version.sop_id)
    source = await session.get(SOPDocument, version.document_id) if version.document_id else None
    if not sop or sop.org_id != actor.org_id or (source and source.org_id != actor.org_id):
        raise DomainError("NOT_FOUND", "SOP source not found.", 404)
    try:
        definition = normalize_sop_definition(version.definition)
    except ValidationError:
        definition = version.definition
    saved_title = definition.get("title")
    version_title = (
        saved_title if isinstance(saved_title, str) and saved_title.strip() else sop.title
    )
    source_id = source.id if source else version.id
    sections = []
    for index, raw in enumerate(source.sections if source else []):
        if not isinstance(raw, dict):
            continue
        sections.append(
            {
                "id": f"{source_id}-section-{index + 1}",
                "heading": str(raw.get("heading") or f"Source passage {index + 1}"),
                "page": raw.get("page"),
                "text": str(raw.get("text") or ""),
            }
        )
    has_source = bool(sections)
    source_sections = list(sections)
    opportunities = []
    linked_sections = set()
    steps = definition.get("steps", [])
    for index, step in enumerate(steps if isinstance(steps, list) else []):
        if not isinstance(step, dict):
            continue
        title = str(step.get("title") or f"Step {index + 1}")
        citations = step.get("sources", [])
        matches = [
            section
            for section in source_sections
            if any(
                isinstance(citation, dict)
                and citation.get("heading") == section["heading"]
                and citation.get("page") == section["page"]
                for citation in (citations if isinstance(citations, list) else [])
            )
        ]
        resolved = bool(matches) or not has_source
        if not matches:
            section = {
                "id": f"{version.id}-step-{index + 1}",
                "heading": f"Procedure step {index + 1}: {title}",
                "page": None,
                "text": str(step.get("instruction") or "No saved instruction."),
            }
            sections.append(section)
            matches = [section]
        capability = step_capability(step, resolved=resolved)
        for section in matches:
            linked_sections.add(section["id"])
            opportunities.append(
                {
                    "id": f"{version.id}-step-{index + 1}-{section['id']}",
                    "sectionId": section["id"],
                    "title": title,
                    **capability,
                }
            )
    for section in sections:
        if section["id"] not in linked_sections:
            opportunities.append(
                {
                    "id": f"{version.id}-review-{section['id']}",
                    "sectionId": section["id"],
                    "title": section["heading"],
                    "category": "human-performed",
                    "capabilities": ["Human review"],
                    "reason": "No saved procedure step cites this passage. Review its context before defining any AI check.",
                }
            )
    pages = [section["page"] for section in sections if isinstance(section["page"], int)]
    return {
        "analysisMode": "server-definition",
        "version": {
            "id": version.id,
            "sopId": sop.id,
            "key": sop.key,
            "title": version_title,
            "version": str(definition.get("version") or version.version),
            "versionNumber": version.version_number,
            "status": version.status,
        },
        "document": {
            "id": source_id,
            "name": source.filename if source else "Saved procedure definition",
            "title": version_title,
            "format": source.filename.rsplit(".", 1)[-1].upper() if source else "PROCEDURE",
            "origin": "server",
            "sourceKind": "source-document" if has_source else "procedure-definition",
            "pageCount": max(pages) if pages else None,
            "size": None,
            "sections": sections,
        },
        "opportunities": opportunities,
    }
