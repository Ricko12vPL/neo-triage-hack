"""FastAPI entrypoint for the neo-triage backend."""
from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load .env before importing modules that read environment variables
# (e.g. briefing_engine reads ANTHROPIC_API_KEY at request time).
load_dotenv()

from backend import __version__  # noqa: E402
from backend.agent.loop import agent_loop, stop_event  # noqa: E402
from backend.routers import briefing, candidates, cost, rank  # noqa: E402
from backend.routers import ws as ws_router  # noqa: E402
from backend.services.ranker import get_ranker  # noqa: E402

logger = logging.getLogger(__name__)


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
    except asyncio.TimeoutError:
        agent_task.cancel()
    logger.info("Managed Agent stopped.")


app = FastAPI(
    title="neo-triage",
    description=(
        "Bayesian NEO follow-up prioritization with Claude Opus 4.7 "
        "as the astronomy reasoning engine."
    ),
    version=__version__,
    lifespan=lifespan,
)

# Accept localhost (any port) and any Vercel preview / production URL.
# Tightened to the specific Vercel URL before submission-day demo.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=(
        r"https?://(localhost|127\.0\.0\.1)(:\d+)?"
        r"|https://[a-z0-9][a-z0-9-]*\.vercel\.app"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(candidates.router)
app.include_router(briefing.router)
app.include_router(cost.router)
app.include_router(rank.router)
app.include_router(ws_router.router)


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe for deployment platforms and monitoring."""
    return {"status": "ok", "service": "neo-triage", "version": __version__}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
