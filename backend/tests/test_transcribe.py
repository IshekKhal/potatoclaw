"""Test suite for POST /api/v1/transcribe endpoint."""

from fastapi.testclient import TestClient


def test_transcribe_synthetic_audio(client: TestClient, synthetic_wav_bytes: bytes):
    """Verify audio transcription using Groq Whisper Large V3 Turbo."""
    files = {
        "audio": ("tone.wav", synthetic_wav_bytes, "audio/wav"),
    }
    response = client.post("/api/v1/transcribe", files=files)
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "success"
    assert "text" in data
    assert isinstance(data["text"], str)


def test_transcribe_empty_file_rejected(client: TestClient):
    """Verify that empty audio uploads are rejected with HTTP 400."""
    files = {
        "audio": ("empty.wav", b"", "audio/wav"),
    }
    response = client.post("/api/v1/transcribe", files=files)
    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()
