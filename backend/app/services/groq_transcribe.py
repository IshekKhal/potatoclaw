"""Groq Whisper Large V3 Turbo transcription service."""

from fastapi import HTTPException
from groq import Groq
from app.core.config import settings
from app.services.sentry_tracing import trace_span


def get_groq_client() -> Groq:
    """Return an authenticated Groq client."""
    if not settings.GROQ_API_KEY:
        raise HTTPException(
            status_code=502,
            detail="GROQ_API_KEY is not configured in environment.",
        )
    return Groq(api_key=settings.GROQ_API_KEY)


def transcribe_audio(audio_bytes: bytes, filename: str = "audio.wav") -> str:
    """Transcribe audio bytes using Groq Whisper Large V3 Turbo."""
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Audio payload is empty.")

    client = get_groq_client()

    with trace_span(op="tool.stt", name="Groq Whisper Turbo STT"):
        try:
            result = client.audio.transcriptions.create(
                file=(filename, audio_bytes),
                model=settings.GROQ_STT_MODEL_ID,
                response_format="text",
            )
            if isinstance(result, str):
                return result.strip()
            return getattr(result, "text", str(result)).strip()
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Groq transcription failed: {str(exc)}",
            ) from exc
