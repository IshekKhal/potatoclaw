"""API v1 router aggregator."""

from fastapi import APIRouter
from app.api.v1.endpoints import auth, process, speak, transcribe

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(transcribe.router, tags=["Audio Transcription"])
api_router.include_router(process.router, tags=["Deterministic Processing"])
api_router.include_router(speak.router, tags=["Speech Synthesis"])
