"""WebSocket feed + agent status endpoints."""
from __future__ import annotations

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from backend.agent import logger as agent_logger
from backend.agent import notifier
from backend.agent.state import load_state

_log = logging.getLogger(__name__)

router = APIRouter(tags=["agent"])


class AgentStatus(BaseModel):
    cycle_count: int
    last_cycle_at: str | None
    session_cost_usd: float
    prev_trksubs_count: int
    connection_count: int
    status: str


@router.websocket("/ws/feed")
async def websocket_feed(ws: WebSocket) -> None:
    """Live agent event feed.

    Emits JSON events:
    - {"type": "new_candidate", "candidate": {...}, "briefing_preview": "..."}
    - {"type": "cycle_complete", "cycle": N, "candidates_seen": N, "new_count": N}
    - {"type": "error", "message": "..."}
    """
    await ws.accept()
    notifier.register(ws)
    _log.info("WS client connected (%d total)", notifier.connection_count())
    try:
        while True:
            # Keep-alive: accept ping frames, ignore payload.
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        notifier.unregister(ws)
        _log.info("WS client disconnected (%d remaining)", notifier.connection_count())


@router.get("/api/agent/status", response_model=AgentStatus)
async def agent_status() -> AgentStatus:
    """Current agent health snapshot for dashboard status indicator."""
    state = load_state()
    return AgentStatus(
        cycle_count=state.cycle_count,
        last_cycle_at=state.last_cycle_at.isoformat() if state.last_cycle_at else None,
        session_cost_usd=state.session_cost_usd,
        prev_trksubs_count=len(state.prev_trksubs),
        connection_count=notifier.connection_count(),
        status="running",
    )


@router.get("/api/agent/log")
async def agent_log(n: int = 50) -> list[dict]:
    """Return the last `n` agent cycle log entries."""
    return agent_logger.read_recent(n)
