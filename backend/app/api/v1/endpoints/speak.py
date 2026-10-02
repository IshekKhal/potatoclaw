"""Speech synthesis endpoint."""

from fastapi import APIRouter, Form, HTTPException, Response
from app.services.elevenlabs_voice import synthesize_voice

router = APIRouter()


@router.post("/speak")
def speak_endpoint(text: str = Form(...)) -> Response:
    """Synthesize text into speech audio binary."""
    if not text or not text.strip():
        raise HTTPException(
            status_code=400,
            detail="Text parameter is required for speech synthesis.",
        )

    audio_bytes = synthesize_voice(text=text.strip())

    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": 'inline; filename="speech.mp3"',
            "Content-Type": "audio/mpeg",
        },
    )
