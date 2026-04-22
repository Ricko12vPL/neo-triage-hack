"""Content-addressable cache for Claude briefing responses.

Key = sha256 over canonical-JSON(prompt inputs). Value = BriefingResponse
as JSON on disk (never pickle — NN-01). Existing cache entries survive
server restarts so hackathon demo runs never re-pay for identical prompts.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from backend.models.schemas import BriefingResponse

CACHE_DIR = Path("claude_cache")


def key_for(
    *,
    model: str,
    system: str,
    user: str,
    thinking_effort: str,
    temperature: float = 1.0,
) -> str:
    """Derive a stable cache key from the prompt inputs.

    `thinking_effort` is the Opus 4.7 extended-thinking effort level
    ("minimal" / "low" / "medium" / "high") — different effort levels
    produce different responses and therefore different cache entries.
    """
    payload = {
        "model": model,
        "system": system,
        "user": user,
        "thinking_effort": thinking_effort,
        "temperature": temperature,
    }
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _path_for(key: str) -> Path:
    return CACHE_DIR / f"{key}.json"


def get(key: str) -> BriefingResponse | None:
    path = _path_for(key)
    if not path.exists():
        return None
    with path.open() as f:
        response = BriefingResponse.model_validate_json(f.read())
    response.cache_hit = True
    return response


def put(key: str, response: BriefingResponse) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = _path_for(key)
    tmp = path.with_suffix(".tmp")
    with tmp.open("w") as f:
        f.write(response.model_dump_json(indent=2))
    tmp.replace(path)


def stats() -> dict[str, int]:
    if not CACHE_DIR.exists():
        return {"n_entries": 0, "disk_bytes": 0}
    entries = list(CACHE_DIR.glob("*.json"))
    return {
        "n_entries": len(entries),
        "disk_bytes": sum(p.stat().st_size for p in entries),
    }
