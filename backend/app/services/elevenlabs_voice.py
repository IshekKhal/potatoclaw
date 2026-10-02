"""ElevenLabs speech synthesis service."""

from fastapi import HTTPException
from elevenlabs.client import ElevenLabs
from app.core.config import settings
from app.services.sentry_tracing import trace_span


def get_elevenlabs_client() -> ElevenLabs:
    """Return an authenticated ElevenLabs client."""
    if not settings.ELEVENLABS_API_KEY:
        raise HTTPException(
            status_code=502,
            detail="ELEVENLABS_API_KEY is not configured in environment.",
        )
    return ElevenLabs(api_key=settings.ELEVENLABS_API_KEY)


def synthesize_voice(text: str, voice_id: str = "") -> bytes:
    """Synthesize text into MP3 audio bytes using ElevenLabs."""
    clean_text = text.strip() if text else ""
    if not clean_text:
        raise HTTPException(status_code=400, detail="Text payload for speech synthesis is empty.")

    client = get_elevenlabs_client()
    selected_voice = voice_id or settings.ELEVENLABS_VOICE_ID

    with trace_span(op="tool.tts", name="ElevenLabs Speech Synthesis"):
        try:
            audio_stream = client.text_to_speech.convert(
                text=clean_text,
                voice_id=selected_voice,
                model_id=settings.ELEVENLABS_MODEL_ID,
            )
            audio_bytes = b"".join(chunk for chunk in audio_stream)
            if not audio_bytes:
                raise HTTPException(status_code=502, detail="ElevenLabs generated empty audio stream.")
            return audio_bytes
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"ElevenLabs speech synthesis failed: {str(exc)}",
            ) from exc
