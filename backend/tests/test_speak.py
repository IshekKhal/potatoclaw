"""Test suite for POST /api/v1/speak endpoint."""

from fastapi.testclient import TestClient


def test_speak_synthesis_live(client: TestClient):
    """Verify ElevenLabs speech synthesis returning MP3 audio bytes."""
    response = client.post("/api/v1/speak", data={"text": "System operational."})
    assert response.status_code == 200
    assert "audio/mpeg" in response.headers.get("content-type", "")
    assert len(response.content) > 1000


def test_speak_empty_text_rejected(client: TestClient):
    """Verify that empty text payload returns HTTP 400."""
    response = client.post("/api/v1/speak", data={"text": "   "})
    assert response.status_code == 400
    assert "required" in response.json()["detail"].lower()
