"""Health and readiness probe endpoint."""

from typing import Any, Dict
from fastapi import APIRouter
from app.core.config import settings

router = APIRouter()


@router.api_route("/health", methods=["GET", "HEAD"])
def health_check() -> Dict[str, Any]:
    """Health check endpoint confirming service status and Sentry initialization."""
    return {
        "status": "ok",
        "service": "potatoclaw-backend",
        "version": "1.0.0",
        "sentry_initialized": bool(settings.SENTRY_DSN),
    }
