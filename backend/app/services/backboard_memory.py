"""Backboard persistent assistant memory service."""

from typing import Any, Dict, List, Optional
import sentry_sdk
from backboard import BackboardClient

from app.core.config import settings
from app.services.sentry_tracing import trace_span

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
                "PotatoClaw persistent memory assistant for Rudra's C and Python lab sessions"
            ),
        )
        _cached_assistant_id = str(
            getattr(new_assistant, "assistant_id", getattr(new_assistant, "id", ""))
        )
        return _cached_assistant_id
    except Exception as exc:
        sentry_sdk.capture_exception(exc)
        return None


async def recall_memories(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """Contextually recall relevant past memories for a query.

    Gracefully degrades to an empty list on any network, authentication, or upstream failure.
    """
    with trace_span(op="tool.backboard.recall", name="Backboard Contextual Recall"):
        if not settings.BACKBOARD_API_KEY:
            return []

        try:
            async with BackboardClient(api_key=settings.BACKBOARD_API_KEY) as client:
                assistant_id = await get_or_create_assistant(client)
                if not assistant_id:
                    return []

                # Attempt semantic search if query is non-empty
                effective_query = (query or "").strip()
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
            sentry_sdk.capture_exception(exc)
            return []


async def ingest_memory(
    query: str,
    solution: str,
    context_type: str = "code_fix",
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    """Store problem-solution pair into persistent memory.

    Gracefully degrades to None on any network, authentication, or upstream failure.
    """
    with trace_span(op="tool.backboard.ingest", name="Backboard Memory Ingestion"):
        if not settings.BACKBOARD_API_KEY:
            return None

        formatted_content = f"Problem: {query.strip()}\nSolution: {solution.strip()}"
        meta = {"category": context_type, **(metadata or {})}

        try:
            async with BackboardClient(api_key=settings.BACKBOARD_API_KEY) as client:
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
            sentry_sdk.capture_exception(exc)
            return None
