"""Test suite for Access Code security gatekeeper and endpoint protection."""

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


def test_auth_verify_success():
    """Verify that a valid X-Access-Code header receives HTTP 200 authorized status."""
    with TestClient(app) as unauthed_client:
        response = unauthed_client.post(
            "/api/v1/auth/verify",
            headers={"X-Access-Code": settings.ACCESS_CODE},
        )
        assert response.status_code == 200
        assert response.json() == {"status": "authorized"}


def test_auth_verify_missing_code():
    """Verify that missing X-Access-Code header receives HTTP 401 unauthorized."""
    with TestClient(app) as unauthed_client:
        response = unauthed_client.post("/api/v1/auth/verify")
        assert response.status_code == 401
        assert "Invalid or missing X-Access-Code" in response.json().get("detail", "")


def test_auth_verify_invalid_code():
    """Verify that an incorrect X-Access-Code header receives HTTP 401 unauthorized."""
    with TestClient(app) as unauthed_client:
        response = unauthed_client.post(
            "/api/v1/auth/verify",
            headers={"X-Access-Code": "000000"},
        )
        assert response.status_code == 401
        assert "Invalid or missing X-Access-Code" in response.json().get("detail", "")


def test_process_enforces_auth():
    """Verify that POST /api/v1/process rejects unauthenticated calls with HTTP 401."""
    with TestClient(app) as unauthed_client:
        response = unauthed_client.post("/api/v1/process", data={"prompt": "test"})
        assert response.status_code == 401
        assert "Invalid or missing X-Access-Code" in response.json().get("detail", "")


def test_health_remains_public():
    """Verify that GET /health remains completely public without requiring X-Access-Code."""
    with TestClient(app) as unauthed_client:
        response = unauthed_client.get("/health")
        assert response.status_code == 200
        assert response.json().get("status") == "ok"
