"""Locate a unique verbatim excerpt without guessing from keywords or page numbers."""

import re

INSTRUCTION_BOUNDARY = re.compile(
    r"[.!?][\"'”’)\]]*(?=\s|$)|\n[ \t]*\n|(?:^|\n)[ \t]*(?:[-*•]|\d+[.)])[ \t]+"
)
LEADING_MARKER = re.compile(r"\s*(?:(?:[-*•]|\d+[.)])\s*)?")
ENDING_PUNCTUATION = re.compile(r"[.!?][\"'”’)\]]*$")
FOLLOWING_BOUNDARY = re.compile(
    r"^(?:[ \t]*[.!?][\"'”’)\]]*(?=\s|$)|[ \t]*\n[ \t]*\n|"
    r"[ \t]*\n[ \t]*(?:[-*•]|\d+[.)])[ \t]+)"
)


def has_instruction_context(text: str, start: int, end: int) -> bool:
    """Do not drop a negation, precondition, or trailing qualifier around a match."""
    prefix = text[:start]
    boundary = 0
    for match in INSTRUCTION_BOUNDARY.finditer(prefix):
        boundary = match.end()
    if LEADING_MARKER.fullmatch(prefix[boundary:]) is None:
        return False
    suffix = text[end:]
    if not suffix.strip():
        return True
    if ENDING_PUNCTUATION.search(text[start:end]) and suffix[0].isspace():
        return True
    return FOLLOWING_BOUNDARY.match(suffix) is not None


def unique_source_quote(text: str, candidate: str | None) -> str | None:
    if not candidate or not candidate.strip():
        return None
    words = candidate.split()
    pattern = r"\s+".join(re.escape(word) for word in words)
    if words[0][0].isalnum():
        pattern = r"(?<!\w)" + pattern
    if words[-1][-1].isalnum():
        pattern += r"(?!\w)"
    matcher = re.compile(pattern)
    match = matcher.search(text)
    if match is None or matcher.search(text, match.start() + 1) is not None:
        return None
    if not has_instruction_context(text, match.start(), match.end()):
        return None
    # Keep the source's exact whitespace and Unicode; no client offset conversion is needed.
    return text[match.start() : match.end()]


def step_source_quote(step: dict, section: dict) -> str | None:
    citations = step.get("sources", [])
    quotes = (
        {
            citation["quote"]
            for citation in citations
            if isinstance(citation, dict)
            and citation.get("heading") == section["heading"]
            and citation.get("page") == section["page"]
            and isinstance(citation.get("quote"), str)
        }
        if isinstance(citations, list)
        else set()
    )
    if quotes:
        resolved = {unique_source_quote(section["text"], quote) for quote in quotes}
        return resolved.pop() if len(resolved) == 1 else None
    instruction = step.get("instruction")
    if not isinstance(instruction, str):
        return None
    return unique_source_quote(section["text"], instruction)


def clear_overlapping_quotes(opportunities: list[dict], sections: list[dict]) -> None:
    """Separate cards cannot claim the same excerpt as their individual source location."""
    for section in sections:
        ranges = []
        for opportunity in opportunities:
            quote = opportunity.get("sourceQuote")
            if opportunity["sectionId"] == section["id"] and quote:
                start = section["text"].find(quote)
                ranges.append((start, start + len(quote), opportunity))
        ranges.sort(key=lambda item: item[0])
        for index, (start, end, opportunity) in enumerate(ranges):
            for other_start, other_end, other in ranges[index + 1 :]:
                if other_start >= end:
                    break
                if start < other_end:
                    opportunity["sourceQuote"] = None
                    other["sourceQuote"] = None
