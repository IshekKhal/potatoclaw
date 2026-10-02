"""Deterministic payload processor router endpoint."""

import io
from typing import Any, Dict, Optional
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
import pandas as pd

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
}


@router.post("/process")
async def process_payload(
    prompt: str = Form(""),
    data_type: str = Form("text"),
    file: Optional[UploadFile] = File(None),
) -> Dict[str, Any]:
    """Process incoming payloads deterministically across tabular, image, and text modalities."""
    with trace_span(op="agent.pipeline", name="PotatoClaw Gateway Router"):
        mode = data_type.lower().strip()

        # Branch A: Tabular / Lab Dataset Processing
        if mode == "tabular":
            if file is None:
                raise HTTPException(
                    status_code=400,
                    detail="Tabular processing requires a CSV file upload.",
                )

            filename = file.filename or ""
            if not filename.lower().endswith(".csv"):
                raise HTTPException(
                    status_code=400,
                    detail="Tabular file must have a .csv extension.",
                )

            file_bytes = await file.read()
            if not file_bytes:
                raise HTTPException(status_code=400, detail="Uploaded CSV file is empty.")

            try:
                df = pd.read_csv(io.BytesIO(file_bytes))
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

            return {
                "status": "success",
                "type": "vision_solution",
                "answer": answer,
            }

        # Branch C: Code and Text Reasoning (default fallback)
        effective_prompt = prompt.strip()
        if not effective_prompt:
            effective_prompt = "Hello PotatoClaw"

        answer = generate_text_reasoning(prompt=effective_prompt)
        return {
            "status": "success",
            "type": "code_solution",
            "answer": answer,
        }
