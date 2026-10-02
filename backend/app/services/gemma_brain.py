"""Google DeepMind Gemma 4 intelligence engine for text, multimodal vision, and tabular verification."""

import json
from typing import Any, Dict
from fastapi import HTTPException
from google import genai
from google.genai import types

from app.core.config import settings
from app.services.sentry_tracing import trace_span


def get_genai_client() -> genai.Client:
    """Return an authenticated Google GenAI client."""
    if not settings.GEMINI_API_KEY:
        raise HTTPException(
            status_code=502,
            detail="GEMINI_API_KEY is not configured in environment.",
        )
    return genai.Client(api_key=settings.GEMINI_API_KEY)


def generate_text_reasoning(prompt: str, code_context: str = "") -> str:
    """Generate concise technical solutions using Gemma 4."""
    client = get_genai_client()

    full_prompt = (
        "You are PotatoClaw, an anti-thrash AI engineering companion for students. "
        "Provide a concise, direct, and working technical solution. "
        "Avoid fluff, buzzwords, or unnecessary explanations.\n\n"
    )
    if code_context:
        full_prompt += f"Context:\n```\n{code_context}\n```\n\n"
    full_prompt += f"Task / Question:\n{prompt}"

    with trace_span(op="llm.gemma_text", name="Gemma 4 Code & Text Reasoning"):
        try:
            response = client.models.generate_content(
                model=settings.GEMMA_MODEL_ID,
                contents=full_prompt,
            )
            return response.text.strip() if response.text else "No response generated."
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Gemma 4 text reasoning failed: {str(exc)}",
            ) from exc


def generate_multimodal_vision(image_bytes: bytes, mime_type: str, prompt: str) -> str:
    """Analyze screenshots and code images using Gemma 4 multimodal capabilities."""
    client = get_genai_client()

    effective_prompt = prompt.strip() if prompt else "Analyze this screenshot. Pinpoint any errors, logs, or UI issues."
    instruction = (
        "You are PotatoClaw, inspecting a student's screen snip. "
        "Pinpoint exact syntax errors, runtime stack traces, compiler output, or UI glitches visible in the image. "
        "Give the exact fix directly and concisely.\n\n"
        f"User Query: {effective_prompt}"
    )

    with trace_span(op="llm.gemma_multimodal", name="Gemma 4 Multimodal Vision"):
        try:
            image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
            response = client.models.generate_content(
                model=settings.GEMMA_MODEL_ID,
                contents=[image_part, instruction],
            )
            return response.text.strip() if response.text else "No analysis produced from image."
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Gemma 4 multimodal vision failed: {str(exc)}",
            ) from exc


def two_pass_tabular_synthesis(df_head: str, anomaly_metrics: Dict[str, Any], user_prompt: str) -> str:
    """Run two-pass Gemma 4 synthesis and verification on TabPFN tabular anomaly metrics."""
    client = get_genai_client()
    metrics_str = json.dumps(anomaly_metrics, indent=2)

    with trace_span(op="llm.gemma_two_pass", name="Gemma 4 Two-Pass Synthesis & Verification"):
        try:
            # Pass 2A: Synthesis
            pass_2a_prompt = (
                "You are PotatoClaw's tabular engineering specialist. "
                "Review the following dataset preview and Prior Labs TabPFN statistical anomaly metrics.\n\n"
                f"Dataset Sample (First Rows):\n{df_head}\n\n"
                f"TabPFN Anomaly & Distribution Metrics:\n{metrics_str}\n\n"
                f"User Inquiry: {user_prompt or 'Explain what these anomalies indicate and propose engineering fixes.'}\n\n"
                "Synthesize an engineering diagnostic explaining what the detected anomalies represent in this data."
            )

            res_2a = client.models.generate_content(
                model=settings.GEMMA_MODEL_ID,
                contents=pass_2a_prompt,
            )
            synthesis_draft = res_2a.text.strip() if res_2a.text else ""

            # Pass 2B: Verification & Fact-Audit
            pass_2b_prompt = (
                "You are a strict data auditing verifier. "
                "Audit the following draft summary against the exact raw numbers from the TabPFN output.\n"
                "Strip any unsupported claims or hallucinations. "
                "Return clean, verified markdown bullet points detailing confirmed anomalies and concrete next steps.\n\n"
                f"Raw TabPFN Metrics:\n{metrics_str}\n\n"
                f"Draft Summary to Audit:\n{synthesis_draft}\n\n"
                "Output verified markdown only:"
            )

            res_2b = client.models.generate_content(
                model=settings.GEMMA_MODEL_ID,
                contents=pass_2b_prompt,
            )
            return res_2b.text.strip() if res_2b.text else synthesis_draft
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Gemma 4 two-pass tabular analysis failed: {str(exc)}",
            ) from exc
