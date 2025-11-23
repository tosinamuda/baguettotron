import asyncio
from collections import defaultdict, deque
from typing import Any

# Simple in-memory pub/sub for document status events.
_subscribers: dict[str, set[asyncio.Queue]] = defaultdict(set)
# Keep a small history so late subscribers can replay recent stages.
_history: dict[str, deque] = defaultdict(lambda: deque(maxlen=50))


async def subscribe(document_id: str) -> asyncio.Queue:
    """Subscribe to document events; returns an asyncio.Queue of event dicts."""
    queue: asyncio.Queue = asyncio.Queue()
    _subscribers[document_id].add(queue)
    return queue


def unsubscribe(document_id: str, queue: asyncio.Queue) -> None:
    """Unsubscribe a previously registered queue."""
    queues = _subscribers.get(document_id)
    if not queues:
        return
    queues.discard(queue)
    if not queues:
        _subscribers.pop(document_id, None)
        _history.pop(document_id, None)


async def broadcast(document_id: str, event: dict[str, Any]) -> None:
    """Broadcast an event to all subscribers for a document."""
    _history[document_id].append(event)
    queues = list(_subscribers.get(document_id, []))
    for q in queues:
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            # Drop if the consumer is too slow.
            continue


def get_history(document_id: str) -> list[dict[str, Any]]:
    """Return a copy of recent events for a document."""
    return list(_history.get(document_id, []))
