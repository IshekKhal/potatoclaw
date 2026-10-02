"""Speech-to-text transcription endpoint."""

from typing import Any, Dict
from fastapi import APIRouter, File, HTTPException, UploadFile
from app.services.groq_transcribe import transcribe_audio

router = APIRouter()


@router.post("/transcribe")
async def transcribe_endpoint(audio: UploadFile = File(...)) -> Dict[str, Any]:
    """Transcribe audio upload using Groq Whisper Large V3 Turbo."""
    if not audio:
        raise HTTPException(status_code=400, detail="No audio file provided.")

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Uploaded audio file is empty.")

    filename = audio.filename or "audio.wav"
    text = transcribe_audio(audio_bytes=audio_bytes, filename=filename)

    return {
        "status": "success",
        "text": text,
    }
