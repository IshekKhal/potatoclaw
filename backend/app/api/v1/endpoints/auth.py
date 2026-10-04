"""Access Code authentication verification probe endpoint."""

from typing import Dict
from fastapi import APIRouter, Depends

from app.core.auth import verify_access_code

router = APIRouter()


@router.post(
    "/verify",
    summary="Verify client access code connection",
    dependencies=[Depends(verify_access_code)],
)
def verify_access_code_connection() -> Dict[str, str]:
    """Return authorization confirmation if access code is valid."""
    return {"status": "authorized"}
