import io

import pytest
from pypdf import PageObject, PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from tara_server.domain import sops
from tara_server.errors import DomainError
from tara_server.settings import Settings


@pytest.fixture
def pdf_settings(monkeypatch):
    settings = Settings(_env_file=None, environment="development")
    monkeypatch.setattr(sops, "get_settings", lambda: settings)
    return settings


def text_pdf(pages: list[str], password: str | None = None) -> bytes:
    writer = PdfWriter()
    font = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        }
    )
    for text in pages:
        page = writer.add_blank_page(width=612, height=792)
        if not text:
            continue
        page[NameObject("/Resources")] = DictionaryObject(
            {NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})}
        )
        escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        stream = DecodedStreamObject()
        stream.set_data(f"BT /F1 12 Tf 36 750 Td ({escaped}) Tj ET".encode("ascii"))
        page.replace_contents(stream)
    if password is not None:
        writer.encrypt(password, algorithm="RC4-128")
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


def test_long_text_pdf_with_187_pages_preserves_citations_with_default_limits(pdf_settings):
    pages = [
        f"Procedure page {number}. "
        + "Prepare the work area and inspect the equipment before starting. " * 20
        for number in range(1, 188)
    ]
    content = text_pdf(pages)

    sections = sops.extract_sections("long-procedure.pdf", content)

    assert len(content) < pdf_settings.max_upload_bytes
    assert len(sections) == 187
    assert 120_000 < sum(len(section["text"]) for section in sections) <= 300_000
    assert [section["page"] for section in sections] == list(range(1, 188))
    assert [section["heading"] for section in sections] == [
        f"Page {number}" for number in range(1, 188)
    ]
    assert all(
        section["text"] == expected for section, expected in zip(sections, pages, strict=True)
    )


def test_pdf_over_default_page_limit_reports_actual_count_and_limit(pdf_settings):
    content = text_pdf([""] * 251)

    with pytest.raises(DomainError) as error:
        sops.extract_sections("too-many-pages.pdf", content)

    assert error.value.code == "VALIDATION_FAILED"
    assert error.value.status == 422
    assert "251" in error.value.message
    assert "250" in error.value.message
    assert "page" in error.value.message.lower()
    assert "encrypt" not in error.value.message.lower()


def test_password_required_pdf_is_rejected_explicitly(pdf_settings):
    content = text_pdf(["Inspect the equipment and follow the approved procedure."], "secret")

    with pytest.raises(DomainError) as error:
        sops.extract_sections("password-required.pdf", content)

    assert error.value.code == "VALIDATION_FAILED"
    assert error.value.status == 422
    assert "encrypt" in error.value.message.lower() or "password" in error.value.message.lower()
    assert "page limit" not in error.value.message.lower()


def test_blank_pdf_requires_ocr_instead_of_creating_empty_sections(pdf_settings):
    with pytest.raises(DomainError, match="OCR") as error:
        sops.extract_sections("scanned-procedure.pdf", text_pdf([""]))

    assert error.value.code == "VALIDATION_FAILED"
    assert error.value.status == 422


def test_malformed_pdf_with_valid_header_reports_unreadable_content(pdf_settings):
    with pytest.raises(DomainError) as error:
        sops.extract_sections("broken.pdf", b"%PDF-1.7\nnot a PDF object tree\n%%EOF\n")

    assert error.value.code == "VALIDATION_FAILED"
    assert error.value.status == 422
    assert "pdf" in error.value.message.lower()
    assert "page limit" not in error.value.message.lower()
    assert "unencrypted" not in error.value.message.lower()


def test_configured_pdf_page_limit_is_enforced_before_text_extraction(pdf_settings, monkeypatch):
    pdf_settings.max_pdf_pages = 2
    content = text_pdf(["A complete equipment inspection procedure."] * 3)

    def unexpected_extraction(*args, **kwargs):
        pytest.fail("An over-limit PDF must be rejected before extracting page text.")

    monkeypatch.setattr(PageObject, "extract_text", unexpected_extraction)
    with pytest.raises(DomainError) as error:
        sops.extract_sections("three-pages.pdf", content)

    assert "3" in error.value.message
    assert "2" in error.value.message
    assert "page" in error.value.message.lower()


def test_unreadable_pdf_page_identifies_page_without_exposing_parser_internals(
    pdf_settings, monkeypatch
):
    content = text_pdf(["Inspect the equipment before starting."] * 3)
    extract_text = PageObject.extract_text
    calls = 0

    def fail_second_page(page, *args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise ValueError("private parser diagnostics")
        return extract_text(page, *args, **kwargs)

    monkeypatch.setattr(PageObject, "extract_text", fail_second_page)
    with pytest.raises(DomainError) as error:
        sops.extract_sections("broken-page.pdf", content)

    assert error.value.code == "VALIDATION_FAILED"
    assert error.value.status == 422
    assert "page 2" in error.value.message.lower()
    assert "private parser diagnostics" not in error.value.message
    assert calls == 2


def test_pdf_text_limit_reports_count_and_stops_before_later_pages(pdf_settings, monkeypatch):
    pdf_settings.max_source_characters = 100
    text = "Prepare tools and check the approved procedure. " * 4
    content = text_pdf([text] * 3)
    extract_text = PageObject.extract_text
    extracted = []

    def record_extraction(page, *args, **kwargs):
        result = extract_text(page, *args, **kwargs)
        extracted.append(result)
        return result

    monkeypatch.setattr(PageObject, "extract_text", record_extraction)
    with pytest.raises(DomainError) as error:
        sops.extract_sections("too-much-text.pdf", content)

    assert error.value.code == "VALIDATION_FAILED"
    assert error.value.status == 422
    assert len(extracted) == 1
    message = error.value.message.replace(",", "")
    assert str(len(extracted[0])) in message
    assert "100" in message
    assert "character" in message.lower()
