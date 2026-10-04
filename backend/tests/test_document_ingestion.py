"""Tests for universal document ingestion (PDF, DOCX, Code, Data, Text)."""

import io
import xml.etree.ElementTree as ET
import zipfile
from fastapi.testclient import TestClient
from pypdf import PdfWriter

from app.api.v1.endpoints.process import extract_document_text


def test_extract_text_markdown():
    """Verify plain text and markdown extraction."""
    md_content = b"# Architecture\n\nThis is a test of document ingestion.\n- Point 1\n- Point 2"
    result = extract_document_text("GEMINI.md", md_content)
    assert "# Architecture" in result
    assert "Point 1" in result


def test_extract_docx_pure_python():
    """Verify DOCX extraction using zipfile and xml.etree."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        doc_xml = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            '<w:body>'
            '<w:p><w:r><w:t>First Paragraph</w:t></w:r></w:p>'
            '<w:p><w:r><w:t>Second Paragraph</w:t></w:r></w:p>'
            '</w:body>'
            '</w:document>'
        )
        z.writestr("word/document.xml", doc_xml)

    docx_bytes = buf.getvalue()
    result = extract_document_text("report.docx", docx_bytes)
    assert "First Paragraph" in result
    assert "Second Paragraph" in result


def test_extract_pdf_pypdf():
    """Verify PDF extraction via pypdf."""
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    pdf_bytes = buf.getvalue()

    result = extract_document_text("document.pdf", pdf_bytes)
    assert isinstance(result, str)
    assert len(result) > 0


def test_extract_binary_fallback():
    """Verify unrecognized binary formats extract metadata and printable preview."""
    binary_data = b"\x00\x01\x02\x03\x04HelloWorld\xff\xfe"
    result = extract_document_text("firmware.bin", binary_data)
    assert "Binary File Metadata" in result
    assert "firmware.bin" in result
    assert "HelloWorld" in result


def test_process_with_attached_document_e2e(client: TestClient):
    """Verify POST /api/v1/process with attached document in text mode."""
    doc_bytes = b"User Guide: To trim memory, press Alt+Shift+P and click the memory badge."
    data = {
        "prompt": "How do I trim memory based on the document?",
        "data_type": "text",
    }
    files = {
        "file": ("guide.txt", doc_bytes, "text/plain"),
    }
    response = client.post("/api/v1/process", data=data, files=files)
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["status"] == "success"
    assert res_data["type"] == "text_solution"
    assert isinstance(res_data["answer"], str)
    assert len(res_data["answer"]) > 0
