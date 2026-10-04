"""Test suite for Backboard persistent assistant memory service."""

import pytest

import app.services.backboard_memory as backboard_module
from app.core.config import settings
from app.services.backboard_memory import ingest_memory, recall_memories


@pytest.mark.asyncio
async def test_backboard_assistant_and_memory_live():
    """Verify live assistant resolution, memory ingestion, and contextual recall."""
    test_query = "int *p = NULL; *p = 42;"
    test_fix = "p must point to allocated memory before dereference"

    ingest_result = await ingest_memory(
        query=test_query,
        solution=test_fix,
        context_type="code_fix",
        metadata={"language": "c", "source": "pytest_live"},
    )
    assert ingest_result is not None
    assert isinstance(ingest_result, str)
    assert len(ingest_result) > 0

    recalled = await recall_memories(query="segfault pointer", limit=5)
    assert isinstance(recalled, list)
    assert len(recalled) > 0
    first_item = recalled[0]
    assert "content" in first_item
    assert "id" in first_item


@pytest.mark.asyncio
async def test_backboard_graceful_fallback(monkeypatch):
    """Verify that network or authentication errors degrade gracefully without raising."""
    monkeypatch.setattr(settings, "BACKBOARD_API_KEY", "invalid_dummy_key")
    monkeypatch.setattr(backboard_module, "_cached_assistant_id", None)

    # Must return empty list silently
    recalled = await recall_memories(query="segfault pointer")
    assert recalled == []

    # Must return None silently
    ingested = await ingest_memory(
        query="int *p = NULL;",
        solution="allocate buffer",
    )
    assert ingested is None
