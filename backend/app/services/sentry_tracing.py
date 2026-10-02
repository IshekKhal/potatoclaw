"""Sentry tracing helper and initialization."""

from contextlib import contextmanager
from typing import Generator, Any
import sentry_sdk
from app.core.config import settings


def init_sentry() -> bool:
    """Initialize Sentry SDK with tracing and profiling if DSN is set."""
    if settings.SENTRY_DSN:
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            traces_sample_rate=1.0,
            profiles_sample_rate=1.0,
            environment=settings.ENVIRONMENT,
            send_default_pii=True,
        )
        return True
    return False


@contextmanager
def trace_span(op: str, name: str) -> Generator[Any, None, None]:
    """Context manager for Sentry spans using the modern 'name' parameter."""
    with sentry_sdk.start_span(op=op, name=name) as span:
        try:
            yield span
        except Exception as exc:
            sentry_sdk.capture_exception(exc)
            raise
