"""Test suite for GET /health endpoint."""

from fastapi.testclient import TestClient


def test_health_check(client: TestClient):
    """Verify that /health returns ok status and initializes sentry probe."""
    response = client.get("/health")
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "potatoclaw-backend"
    assert data["version"] == "1.0.0"
    assert "sentry_initialized" in data
    assert data["sentry_initialized"] is True
