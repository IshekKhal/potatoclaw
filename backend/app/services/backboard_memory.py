"""Backboard persistent assistant memory service."""

from typing import Any, Dict, List, Optional
import sentry_sdk
from backboard import BackboardClient

from app.core.config import settings
from app.services.sentry_tracing import trace_span

BACKBOARD_TIMEOUT = 15
_cached_assistant_id: Optional[str] = None


async def get_or_create_assistant(client: BackboardClient) -> Optional[str]:
    """Retrieve existing PotatoClaw-Assistant or create a new one."""
    global _cached_assistant_id
    if _cached_assistant_id:
        return _cached_assistant_id

    try:
        assistants = await client.list_assistants(name="PotatoClaw-Assistant")
        if assistants:
            first = assistants[0]
            _cached_assistant_id = str(
                getattr(first, "assistant_id", getattr(first, "id", ""))
            )
            return _cached_assistant_id

        new_assistant = await client.create_assistant(
            name="PotatoClaw-Assistant",
            system_prompt=(
                "PotatoClaw persistent desktop companion with cross-session memory for general productivity, writing, research, analysis, and programming."
            ),
        )
        _cached_assistant_id = str(
            getattr(new_assistant, "assistant_id", getattr(new_assistant, "id", ""))
        )
        return _cached_assistant_id
    except Exception as exc:
        sentry_sdk.capture_message(
            f"Backboard get_or_create_assistant degraded: {exc}",
            level="warning",
        )
        return None


async def recall_memories(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """Contextually recall relevant past memories for a query.

    Gracefully degrades to an empty list on any network, authentication, or upstream failure.
    """
    with trace_span(op="tool.backboard.recall", name="Backboard Contextual Recall"):
        if not settings.BACKBOARD_API_KEY:
            return []

        try:
            async with BackboardClient(
                api_key=settings.BACKBOARD_API_KEY,
                timeout=BACKBOARD_TIMEOUT,
            ) as client:
                assistant_id = await get_or_create_assistant(client)
                if not assistant_id:
                    return []

                # Cap semantic search query to 500 characters
                effective_query = (query or "").strip()[:500]
                if effective_query:
                    try:
                        search_res = await client.search_memories(
                            assistant_id=assistant_id,
                            query=effective_query,
                            limit=limit,
                        )
                        raw_memories = search_res.get("memories", [])
                        if raw_memories:
                            return [
                                {
                                    "id": str(m.get("id", "")),
                                    "content": str(m.get("content", "")),
                                    "metadata": m.get("metadata", {}) or {},
                                }
                                for m in raw_memories
                            ]
                    except Exception:
                        pass

                # Fallback to get_memories pagination
                res = await client.get_memories(
                    assistant_id=assistant_id,
                    page=1,
                    page_size=limit,
                )
                return [
                    {
                        "id": str(getattr(m, "id", "")),
                        "content": str(getattr(m, "content", "")),
                        "metadata": getattr(m, "metadata", {}) or {},
                    }
                    for m in res.memories
                ]
        except Exception as exc:
            sentry_sdk.capture_message(
                f"Backboard memory recall degraded: {exc}",
                level="warning",
            )
            return []


async def ingest_memory(
    query: str,
    solution: str,
    context_type: str = "general_interaction",
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    """Store user-assistant interaction pair into persistent memory.

    Gracefully degrades to None on any network, authentication, or upstream failure.
    """
    with trace_span(op="tool.backboard.ingest", name="Backboard Memory Ingestion"):
        if not settings.BACKBOARD_API_KEY:
            return None

        # Clean and cap stored interaction to avoid exceeding Backboard embedding limits
        raw_query = (query or "").strip()
        if "[Attached Document:" in raw_query:
            parts = raw_query.split("[Attached Document:")
            clean_query = parts[0].strip() or raw_query[:1500]
        else:
            clean_query = raw_query[:1500]

        clean_solution = (solution or "").strip()[:2000]
        formatted_content = f"User: {clean_query}\nAssistant: {clean_solution}"
        meta = {"category": context_type, **(metadata or {})}

        try:
            async with BackboardClient(
                api_key=settings.BACKBOARD_API_KEY,
                timeout=BACKBOARD_TIMEOUT,
            ) as client:
                assistant_id = await get_or_create_assistant(client)
                if not assistant_id:
                    return None

                res = await client.add_memory(
                    assistant_id=assistant_id,
                    content=formatted_content,
                    metadata=meta,
                )
                if isinstance(res, dict):
                    return str(res.get("memory_id") or res.get("id") or "success")
                return str(getattr(res, "id", "success"))
        except Exception as exc:
            sentry_sdk.capture_message(
                f"Backboard memory ingestion degraded: {exc}",
                level="warning",
            )
            return None

