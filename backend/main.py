"""FastAPI entrypoint for the neo-triage backend."""
from __future__ import annotations

import asyncio
import logging
import os
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load .env before importing modules that read environment variables
# (e.g. briefing_engine reads ANTHROPIC_API_KEY at request time).
load_dotenv()

from backend import __version__  # noqa: E402
from backend.agent.loop import agent_loop, stop_event  # noqa: E402
from backend.agent.state import load_state  # noqa: E402
from backend.routers import (  # noqa: E402
    briefing,
    candidates,
    cost,
    external,
    imminent_impactors,
    meta,
    population_risk,
    rank,
    replay,
)
from backend.routers import ws as ws_router  # noqa: E402
from backend.services.ranker import get_ranker  # noqa: E402

logger = logging.getLogger(__name__)

_SERVER_START_TIME = time.monotonic()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Preload ranker, then start the Managed Agent background loop.

    Ranker training takes ~25s on 2000 synthetic samples; skippable
    via NEO_TRIAGE_SKIP_RANKER_PRELOAD=1 for fast test boots.
    The agent loop runs for the lifetime of the server process.
    """
    if os.environ.get("NEO_TRIAGE_SKIP_RANKER_PRELOAD") != "1":
        logger.info("Preloading Bayesian ranker (this takes ~25s)...")
        get_ranker()
        logger.info("Ranker ready.")

    agent_task = asyncio.create_task(agent_loop(), name="managed-agent")
    logger.info("Managed Agent started.")

    yield

    stop_event.set()
    try:
        await asyncio.wait_for(agent_task, timeout=10.0)
    except TimeoutError:
        agent_task.cancel()
    logger.info("Managed Agent stopped.")


def _build_cors_regex() -> str:
    """Build CORS origin regex from env var or defaults.

    CORS_ORIGINS env var accepts comma-separated exact origins to allow
    in addition to localhost and *.vercel.app patterns.
    """
    base = (
        r"https?://(localhost|127\.0\.0\.1)(:\d+)?"
        r"|https://[a-z0-9][a-z0-9-]*\.vercel\.app"
    )
    extra = os.environ.get("CORS_ORIGINS", "")
    if extra:
        import re
        escaped = "|".join(re.escape(o.strip()) for o in extra.split(",") if o.strip())
        return f"{base}|{escaped}"
    return base


app = FastAPI(
    title="neo-triage",
    description=(
        "Bayesian NEO follow-up prioritization with Claude Opus 4.7 "
        "as the astronomy reasoning engine."
    ),
    version=__version__,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=_build_cors_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(candidates.router)
app.include_router(briefing.router)
app.include_router(cost.router)
app.include_router(external.router)
app.include_router(imminent_impactors.router)
app.include_router(meta.router)
app.include_router(population_risk.router)
app.include_router(rank.router)
app.include_router(replay.router)
app.include_router(ws_router.router)


@app.get("/health")
async def health() -> dict[str, Any]:
    """Liveness probe for Railway health checks and monitoring."""
    state = load_state()
    return {
        "status": "ok",
        "service": "neo-triage",
        "version": __version__,
        "agent_running": True,
        "agent_cycle": state.cycle_count,
        "uptime_seconds": int(time.monotonic() - _SERVER_START_TIME),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
