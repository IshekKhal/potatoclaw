"""Deterministic payload processor router endpoint."""

import io
from typing import Any, Dict, Optional
import xml.etree.ElementTree as ET
import zipfile
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
import pandas as pd

from app.core.auth import verify_access_code
from app.services.backboard_memory import ingest_memory, recall_memories
from app.services.gemma_brain import (
    generate_multimodal_vision,
    generate_text_reasoning,
    two_pass_tabular_synthesis,
)
from app.services.sentry_tracing import trace_span
from app.services.tabpfn_engine import analyze_tabular_dataset

router = APIRouter()

ALLOWED_IMAGE_TYPES = {
    "image/png": "image/png",
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/webp": "image/webp",
    "image/bmp": "image/bmp",
    "image/gif": "image/gif",
    "image/svg+xml": "image/svg+xml",
}


def extract_document_text(filename: str, file_bytes: bytes) -> str:
    """Extract plain text from uploaded PDF, Word DOCX, code, configuration, or text files."""
    lower_name = filename.lower()

    # 1. PDF Documents via pypdf
    if lower_name.endswith(".pdf"):
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(file_bytes))
            pages_text = [
                page.extract_text() or ""
                for page in reader.pages
            ]
            extracted = "\n".join(p for p in pages_text if p.strip())
            return extracted if extracted.strip() else "[PDF contains no extractable text]"
        except Exception as exc:
            return f"[PDF extraction error: {exc}]"

    # 2. Microsoft Word (.docx) Documents via pure-Python standard library
    if lower_name.endswith(".docx"):
        try:
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as docx_zip:
                xml_content = docx_zip.read("word/document.xml")
                tree = ET.fromstring(xml_content)
                ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
                paragraphs = []
                for p in tree.iter(f"{{{ns['w']}}}p"):
                    texts = [node.text for node in p.iter(f"{{{ns['w']}}}t") if node.text]
                    if texts:
                        paragraphs.append("".join(texts))
                extracted = "\n\n".join(paragraphs)
                return extracted if extracted.strip() else "[DOCX contains no extractable text]"
        except Exception as exc:
            return f"[DOCX extraction error: {exc}]"

    # 3. Known text, code, config, and script formats
    text_extensions = (
        ".txt", ".md", ".py", ".c", ".cpp", ".h", ".cs", ".java", ".rs", ".go",
        ".js", ".ts", ".html", ".css", ".json", ".yaml", ".toml", ".xml", ".sql",
        ".sh", ".bat", ".ps1", ".geojson", ".obj", ".log", ".env", ".rtf", ".ini",
        ".cfg", ".conf", ".r", ".swift", ".kt", ".dart", ".lua", ".tex"
    )
    if any(lower_name.endswith(ext) for ext in text_extensions):
        return file_bytes.decode("utf-8", errors="replace")

    # 4. UTF-8 decoding attempt for any unrecognized text format
    try:
        return file_bytes.decode("utf-8")
    except UnicodeDecodeError:
        pass

    # 5. Universal binary fallback providing file metadata and printable preview
    preview_chars = "".join(
        chr(b) if 32 <= b <= 126 or b in (10, 13, 9) else "."
        for b in file_bytes[:512]
    )
    return (
        f"[Binary File Metadata: name={filename}, size={len(file_bytes)} bytes]\n"
        f"[Printable Preview (first 512 bytes)]:\n{preview_chars}"
    )


@router.post("/process", dependencies=[Depends(verify_access_code)])
async def process_payload(
    background_tasks: BackgroundTasks,
    prompt: str = Form(""),
    data_type: str = Form("text"),
    file: Optional[UploadFile] = File(None),
) -> Dict[str, Any]:
    """Process incoming payloads deterministically across tabular, image, and text modalities."""
    with trace_span(op="agent.pipeline", name="PotatoClaw Gateway Router"):
        mode = data_type.lower().strip()

        # Branch A: Tabular / Lab Dataset Processing (CSV / TSV)
        if mode == "tabular":
            if file is None:
                raise HTTPException(
                    status_code=400,
                    detail="Tabular processing requires a CSV file upload.",
                )

            filename = (file.filename or "").lower()
            if not (filename.endswith(".csv") or filename.endswith(".tsv")):
                raise HTTPException(
                    status_code=400,
                    detail="Tabular file must have a .csv extension.",
                )

            file_bytes = await file.read()
            if not file_bytes:
                raise HTTPException(status_code=400, detail="Uploaded CSV file is empty.")

            try:
                sep = "\t" if filename.endswith(".tsv") else ","
                df = pd.read_csv(io.BytesIO(file_bytes), sep=sep)
            except Exception as exc:
                raise HTTPException(
                    status_code=400,
                    detail=f"Failed to parse CSV file: {str(exc)}",
                ) from exc

            df_head = df.head(10).to_string()
            metrics = analyze_tabular_dataset(df)
            answer = two_pass_tabular_synthesis(
                df_head=df_head,
                anomaly_metrics=metrics,
                user_prompt=prompt,
            )

            # Ingest tabular diagnosis into persistent memory asynchronously
            background_tasks.add_task(
                ingest_memory,
                prompt or "Tabular Anomaly Analysis",
                answer,
                "tabular_solution",
            )

            return {
                "status": "success",
                "type": "tabular_solution",
                "metrics": metrics,
                "answer": answer,
            }

        # Branch B: Multimodal Screenshot and Code Snippet Processing
        if mode == "image":
            if file is None:
                raise HTTPException(
                    status_code=400,
                    detail="Image processing requires an image file upload.",
                )

            content_type = file.content_type or ""
            filename = (file.filename or "").lower()

            mime_type = ALLOWED_IMAGE_TYPES.get(content_type)
            if not mime_type:
                if filename.endswith(".png"):
                    mime_type = "image/png"
                elif filename.endswith(".jpg") or filename.endswith(".jpeg"):
                    mime_type = "image/jpeg"
                elif filename.endswith(".webp"):
                    mime_type = "image/webp"
                elif filename.endswith(".bmp"):
                    mime_type = "image/bmp"
                elif filename.endswith(".gif"):
                    mime_type = "image/gif"
                elif filename.endswith(".svg"):
                    mime_type = "image/svg+xml"

            if not mime_type:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid image MIME type. Supported: image/png, image/jpeg, image/webp.",
                )

            file_bytes = await file.read()
            if not file_bytes:
                raise HTTPException(status_code=400, detail="Uploaded image file is empty.")

            answer = generate_multimodal_vision(
                image_bytes=file_bytes,
                mime_type=mime_type,
                prompt=prompt,
            )

            # Ingest vision diagnosis into persistent memory asynchronously
            background_tasks.add_task(
                ingest_memory,
                prompt or "Visual Error Diagnosis",
                answer,
                "vision_solution",
            )

            return {
                "status": "success",
                "type": "vision_solution",
                "answer": answer,
            }

        # Branch C: Universal Text & Document Reasoning (default fallback)
        attached_doc_header = ""
        if file is not None:
            file_bytes = await file.read()
            if file_bytes:
                fname = file.filename or "attached_file.txt"
                extracted_content = extract_document_text(fname, file_bytes)
                attached_doc_header = f"[Attached Document: {fname}]:\n{extracted_content}\n\n"

        effective_prompt = prompt.strip()
        if not effective_prompt and not attached_doc_header:
            effective_prompt = "Hello PotatoClaw"

        # Contextual memory recall via Backboard
        recall_query = effective_prompt if effective_prompt else (file.filename if file else "Attached document analysis")
        recalled = await recall_memories(recall_query)
        memory_bullets = ""
        if recalled:
            memory_bullets = "\n".join(
                f"- {m.get('content', '').strip()}"
                for m in recalled
                if m.get("content")
            )

        if attached_doc_header:
            # Prioritize active attached document over past memories
            prompt_for_gemma = (
                "Instructions: An active document is attached below. Prioritize the content of this document "
                "and the user's current question over any past recalled memories.\n\n"
                f"{attached_doc_header}"
            )
            if memory_bullets:
                prompt_for_gemma += f"Relevant Past Memories (Secondary context):\n{memory_bullets}\n\n"
            prompt_for_gemma += f"User Task / Query:\n{effective_prompt or 'Review and summarize the attached document.'}"
        else:
            if memory_bullets:
                prompt_for_gemma = (
                    f"Relevant Past Context:\n{memory_bullets}\n\n"
                    f"Current Task:\n{effective_prompt}"
                )
            else:
                prompt_for_gemma = effective_prompt

        answer = generate_text_reasoning(prompt=prompt_for_gemma)

        # Non-blocking memory ingestion in background
        background_tasks.add_task(
            ingest_memory,
            effective_prompt,
            answer,
            "general_interaction",
        )

        return {
            "status": "success",
            "type": "text_solution",
            "answer": answer,
        }
