"""FastAPI entrypoint for the neo-triage backend."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend import __version__
from backend.routers import candidates

app = FastAPI(
    title="neo-triage",
    description=(
        "Bayesian NEO follow-up prioritization with Claude Opus 4.7 "
        "as the astronomy reasoning engine."
    ),
    version=__version__,
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


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe for deployment platforms and monitoring."""
    return {"status": "ok", "service": "neo-triage", "version": __version__}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
