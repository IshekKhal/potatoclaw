"""Access Code security gatekeeper authentication dependency."""

from typing import Optional
from fastapi import Header, HTTPException

from app.core.config import settings


def verify_access_code(
    x_access_code: Optional[str] = Header(None, alias="X-Access-Code"),
) -> str:
    """Validate incoming X-Access-Code against configured server ACCESS_CODE.

    If ACCESS_CODE is non-empty in configuration:
    - Missing or non-matching header raises HTTP 401.
    If ACCESS_CODE is empty:
    - Passes through to support unauthenticated local development.
    """
    configured_code = settings.ACCESS_CODE.strip() if settings.ACCESS_CODE else ""
    if configured_code:
        if not x_access_code or x_access_code.strip() != configured_code:
            raise HTTPException(
                status_code=401,
                detail="Invalid or missing X-Access-Code",
            )
        return x_access_code.strip()
    return x_access_code or ""
