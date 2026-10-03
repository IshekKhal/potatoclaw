"""Core configuration settings for PotatoClaw backend."""

from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


# Resolve root .env path
BASE_DIR = Path(__file__).resolve().parent.parent.parent
ROOT_ENV = BASE_DIR.parent / ".env"
LOCAL_ENV = BASE_DIR / ".env"


class Settings(BaseSettings):
    """Application settings loaded from environment or .env file."""

    # API Keys
    GEMINI_API_KEY: str = ""
    TABPFN_API_KEY: str = ""
    SENTRY_DSN: str = ""
    GROQ_API_KEY: str = ""
    ELEVENLABS_API_KEY: str = ""
    BACKBOARD_API_KEY: str = ""
    ACCESS_CODE: str = ""
    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    ENVIRONMENT: str = "development"

    # Model identifiers
    GEMMA_MODEL_ID: str = "gemma-4-26b-a4b-it"
    GROQ_STT_MODEL_ID: str = "whisper-large-v3-turbo"
    ELEVENLABS_VOICE_ID: str = "JBFqnCBsd6RMkjVDRZzb"  # George (premade voice supported on free tier)
    ELEVENLABS_MODEL_ID: str = "eleven_turbo_v2_5"

    model_config = SettingsConfigDict(
        env_file=(str(ROOT_ENV), str(LOCAL_ENV), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
