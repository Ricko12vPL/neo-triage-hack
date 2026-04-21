"""FastAPI entrypoint for the neo-triage backend."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend import __version__

app = FastAPI(
    title="neo-triage",
    description=(
        "Bayesian NEO follow-up prioritization with Claude Opus 4.7 "
        "as the astronomy reasoning engine."
    ),
    version=__version__,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tightened before production; demo only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe for deployment platforms and monitoring."""
    return {"status": "ok", "service": "neo-triage", "version": __version__}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
