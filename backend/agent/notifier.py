"""WebSocket connection manager — broadcast agent events to dashboard."""
from __future__ import annotations

import contextlib
import json
import logging

from fastapi import WebSocket

_log = logging.getLogger(__name__)

_connections: list[WebSocket] = []


def register(ws: WebSocket) -> None:
    _connections.append(ws)


def unregister(ws: WebSocket) -> None:
    with contextlib.suppress(ValueError):
        _connections.remove(ws)


def connection_count() -> int:
    return len(_connections)


async def broadcast(event: dict) -> None:
    """Send event JSON to all active WebSocket connections.

    Stale connections are silently removed — a dropped client
    never propagates an exception into the agent loop.
    """
    if not _connections:
        return
    payload = json.dumps(event, default=str)
    dead: list[WebSocket] = []
    for ws in list(_connections):
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        unregister(ws)
        _log.debug("Removed stale WS connection after failed send")
