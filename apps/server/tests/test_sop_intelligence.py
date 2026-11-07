from copy import deepcopy

import pytest

from tara_server.db.models import SOPDocument, SOPVersion
from tara_server.domain.sop_intelligence import intelligence
from tara_server.domain.sops import validate_definition
from tara_server.domain.source_quotes import unique_source_quote
from tara_server.schemas import SopIntelligenceResponse

INSPECT = "Inspect the visible switch pins."
CONFIRM = "Confirm the replacement is complete."
SECTION = {"heading": "Page 1", "page": 1, "text": f"{INSPECT}\n\n{CONFIRM}"}
STEPS = [
    {
        "id": "inspect",
        "title": "Inspect the pins",
        "instruction": INSPECT,
        "sources": [{"heading": "Page 1", "page": 1}],
        "verification": {
            "kind": "visual",
            "criteria": [{"id": "straight", "description": "The pins are straight."}],
        },
    },
    {
        "id": "confirm",
        "title": "Confirm completion",
        "instruction": CONFIRM,
        "sources": [{"heading": "Page 1", "page": 1}],
        "verification": {"kind": "finalization"},
    },
]


async def saved_procedure(workshop, *, text=SECTION["text"]):
    session, users, work = workshop
    version = await session.get(SOPVersion, work.sop_version_id)
    document = await session.get(SOPDocument, version.document_id)
    document.sections = [{**SECTION, "text": text}]
    version.definition = {**version.definition, "steps": deepcopy(STEPS)}
    await session.flush()
    return session, users["owner"], version


async def test_opposite_flags_on_one_page_resolve_to_their_own_instruction(workshop):
    session, owner, version = await saved_procedure(workshop)

    result = SopIntelligenceResponse.model_validate(await intelligence(session, owner, version.id))
    first, second = result.opportunities

    assert first.sectionId == second.sectionId
    assert (first.category, second.category) == ("ai-verified", "human-approval")
    assert first.sourceQuote == first.instruction == INSPECT
    assert second.sourceQuote == second.instruction == CONFIRM
    assert first.sourceQuote != second.sourceQuote
    assert result.document.sections[0].text == SECTION["text"]


async def test_explicit_citation_keeps_paraphrased_step_linked_to_original_words(workshop):
    session, owner, version = await saved_procedure(workshop)
    step = version.definition["steps"][0]
    step["instruction"] = "Bring the switch pins into view for inspection."
    step["sources"][0]["quote"] = INSPECT

    result = await intelligence(session, owner, version.id)

    assert result["opportunities"][0]["sourceQuote"] == INSPECT
    assert result["opportunities"][0]["instruction"] == step["instruction"]


async def test_unmatched_instruction_does_not_highlight_the_page_or_borrow_another_flag(workshop):
    session, owner, version = await saved_procedure(workshop)
    version.definition["steps"][0]["instruction"] = "Check all switch pins on camera."

    result = await intelligence(session, owner, version.id)

    assert result["opportunities"][0]["sourceQuote"] is None
    assert result["opportunities"][1]["sourceQuote"] == CONFIRM


async def test_malformed_saved_instruction_does_not_break_the_review_response(workshop):
    session, owner, version = await saved_procedure(workshop)
    version.definition["steps"][0]["instruction"] = {"invalid": "draft"}

    result = SopIntelligenceResponse.model_validate(await intelligence(session, owner, version.id))

    assert result.opportunities[0].instruction is None
    assert result.opportunities[0].sourceQuote is None


async def test_repeated_excerpt_is_not_assigned_to_an_arbitrary_occurrence(workshop):
    session, owner, version = await saved_procedure(
        workshop, text=f"{INSPECT}\n{INSPECT}\n{CONFIRM}"
    )

    result = await intelligence(session, owner, version.id)

    assert result["opportunities"][0]["sourceQuote"] is None
    assert result["opportunities"][1]["sourceQuote"] == CONFIRM


async def test_separate_flags_cannot_both_claim_the_same_excerpt(workshop):
    session, owner, version = await saved_procedure(workshop)
    for step in version.definition["steps"]:
        step["sources"][0]["quote"] = INSPECT

    result = await intelligence(session, owner, version.id)

    assert all(item["sourceQuote"] is None for item in result["opportunities"])


async def test_overlapping_excerpt_does_not_let_a_broad_flag_color_another_step(workshop):
    session, owner, version = await saved_procedure(workshop)
    version.definition["steps"][0]["sources"][0]["quote"] = SECTION["text"]

    result = await intelligence(session, owner, version.id)

    assert all(item["sourceQuote"] is None for item in result["opportunities"])


async def test_invalid_explicit_quote_does_not_fall_back_to_the_entire_page(workshop):
    session, owner, version = await saved_procedure(workshop)
    version.definition["steps"][0]["sources"][0]["quote"] = "Not in this document."

    result = await intelligence(session, owner, version.id)

    assert result["opportunities"][0]["sourceQuote"] is None
    assert result["opportunities"][1]["sourceQuote"] == CONFIRM


async def test_affirmative_fragment_cannot_hide_a_source_prohibition(workshop):
    source = f"Do not remove the cover.\n\n{CONFIRM}"
    session, owner, version = await saved_procedure(workshop, text=source)
    step = version.definition["steps"][0]
    step["instruction"] = "remove the cover."

    fallback = await intelligence(session, owner, version.id)
    assert fallback["opportunities"][0]["sourceQuote"] is None

    step["sources"][0]["quote"] = "remove the cover."
    explicit = await intelligence(session, owner, version.id)
    assert explicit["opportunities"][0]["sourceQuote"] is None
    assert validate_definition(version.definition, [{**SECTION, "text": source}]) == []


async def test_unresolved_citation_labels_saved_instruction_without_coloring_the_wrong_page(
    workshop,
):
    session, owner, version = await saved_procedure(workshop)
    version.definition["steps"][0]["sources"] = [{"heading": "Page 9", "page": 9}]

    result = await intelligence(session, owner, version.id)
    first = result["opportunities"][0]
    selected = next(
        section for section in result["document"]["sections"] if section["id"] == first["sectionId"]
    )

    assert first["sourceQuote"] == INSPECT
    assert first["category"] == "human-performed"
    assert selected["page"] is None
    assert "original source citation unresolved" in selected["heading"]
    assert result["document"]["sections"][0]["id"] != first["sectionId"]


async def test_procedure_without_document_highlights_only_its_saved_instruction(workshop):
    session, owner, version = await saved_procedure(workshop)
    version.document_id = None

    result = await intelligence(session, owner, version.id)

    assert result["document"]["sourceKind"] == "procedure-definition"
    assert [item["sourceQuote"] for item in result["opportunities"]] == [INSPECT, CONFIRM]
    assert len({item["sectionId"] for item in result["opportunities"]}) == 2


@pytest.mark.parametrize(
    ("text", "candidate", "expected"),
    [
        (
            "🔧 Checklist.\nInspect the visible\n switch pins.",
            INSPECT,
            "Inspect the visible\n switch pins.",
        ),
        ("Use keycaps, not keycap pullers.", "keycap", None),
        ("Inspect. Inspect.", "Inspect.", None),
        ("Disconnect the cable.", "Connect the cable.", None),
        ("Do not remove the cover.", "Remove the cover.", None),
        ("Do not remove the cover.", "remove the cover.", None),
        ("Do not\nremove the cover.", "remove the cover.", None),
        ("Only after power isolation, remove the cover.", "remove the cover.", None),
        ("Remove the cover, only after power isolation.", "Remove the cover", None),
        ("Inspect pins Inspect pins Inspect pins", "Inspect pins Inspect pins", None),
        ("- Inspect the visible switch pins.\n- Confirm completion.", INSPECT, INSPECT),
        ("1. Inspect the visible switch pins.\n2. Confirm completion.", INSPECT, INSPECT),
        ("Do not remove the cover.", "Do not remove the cover.", "Do not remove the cover."),
        ("Inspect the pins.", "  ", None),
    ],
)
def test_quotes_preserve_original_text_and_require_unique_complete_tokens(
    text, candidate, expected
):
    assert unique_source_quote(text, candidate) == expected


def test_draft_quotes_are_optional_and_do_not_block_validation():
    definition = {"sopKey": "TEST", "version": "1", "title": "Test", "steps": deepcopy(STEPS)}
    assert validate_definition(definition, [SECTION]) == []
    definition["steps"][0]["sources"][0]["quote"] = INSPECT
    assert validate_definition(definition, [SECTION]) == []
    definition["steps"][0]["sources"][0]["quote"] = "A sentence absent from the source."
    assert validate_definition(definition, [SECTION]) == []
    definition["steps"][0]["sources"][0]["quote"] = INSPECT
    assert validate_definition(definition, [SECTION, SECTION]) == []
