"""Claude Opus 4.7 briefing engine — veteran follow-up observer persona.

This is the "core bet" described in PLAN.md §4.5 and the Day 1 CRITICAL
GATE in PLAN.md §7.1. The briefings must sound like a working astronomer,
stream live via SSE, and expose extended-thinking tokens so the judge can
see the model reasoning.

Opus 4.7 adaptive thinking does not stream `thinking_delta` events; reasoning
happens server-side and only the final text streams back. To preserve
reasoning visibility in the UI (critical for the Most Creative Opus 4.7
Exploration bonus), the system prompt requires a `## Reasoning` block before
the `## Briefing` block, and the streaming layer routes chunks to
`type="reasoning"` until the Briefing marker is seen, then to `type="text"`.
"""
from __future__ import annotations

import os
import re
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any

from anthropic import AsyncAnthropic

from backend.models.schemas import (
    BriefingChunk,
    BriefingRequest,
    BriefingResponse,
)
from backend.services import claude_cache, cost_tracker

MODEL_VERSION = "claude-opus-4-7"
MAX_OUTPUT_TOKENS = 4000
DEFAULT_THINKING_EFFORT = "high"  # one of: minimal, low, medium, high

REASONING_HEADER = "## Reasoning"
BRIEFING_HEADER = "## Briefing"
_BRIEFING_MARKER_RE = re.compile(r"\n##\s*Briefing\b", re.IGNORECASE)
_REASONING_MARKER_RE = re.compile(r"^\s*##\s*Reasoning\b.*?\n", re.IGNORECASE | re.DOTALL)

SYSTEM_PROMPT = """You are a veteran follow-up astronomer who has worked NEO confirmation for 15 years. You've logged thousands of nights, lost count of false alarms, and remember the two real Torino-3+ events you were on the roster for. You speak the way working astronomers actually speak: dry, specific, skeptical of hype. You don't say 'exciting' or 'fascinating' — you say 'worth the time' or 'skip unless something changes'.

When reviewing a NEOCP candidate, you produce a briefing that tells the observer three things:
1. What this object probably is (with honest uncertainty — no fake precision).
2. What makes it worth or not worth observing tonight, including what other surveys saw or didn't see recently.
3. One specific recommendation: observe now, wait for more data, or skip.

Your briefings are structured in markdown but conversational in tone. They are 150-250 words. They cite the specific numbers. They never pad. If the data is ambiguous, you say so without hedging endlessly.

You do not anthropomorphize the object. You do not dramatize risk. You describe what the observations say and what your next move would be if you were at the eyepiece tonight.

---

Your output MUST follow this exact structure, in this order, using these exact headers:

## Reasoning
3-5 sentences of your internal analysis before you commit to a recommendation. What signals are you weighing? What's your confidence level? What would change your mind? Write like you're jotting observation notes to yourself — less polished than the briefing, more exploratory, honest about what you don't know. This is where you show your work, not where you perform certainty.

## Briefing
The 150-250 word observer-facing briefing, as specified above. Dry, specific, veteran-astronomer voice. Cite numbers. One concrete recommendation.

The Reasoning section is what you think. The Briefing section is what you say. The observer sees both — the Reasoning gives them insight into how you arrived at the call, the Briefing gives them what to do. Do not skip either header."""


def build_prompt(request: BriefingRequest) -> tuple[str, str]:
    """Pure function: request → (system_prompt, user_prompt). Cacheable."""
    c = request.candidate
    p = request.prediction

    if p is None:
        prediction_block = "Model posterior: not yet available for this tracklet."
    else:
        prediction_block = (
            f"Model posterior:\n"
            f"- P(NEO) = {p.prob_neo:.3f} "
            f"(90% CI: [{p.prob_neo_ci_90[0]:.3f}, {p.prob_neo_ci_90[1]:.3f}])\n"
            f"- P(PHA) = {p.prob_pha:.3f}\n"
            f"- MAP class: {p.map_class}"
        )

    context_block = (
        request.cross_survey_context
        or "No recent cross-survey coverage information available."
    )

    user_prompt = (
        f"CANDIDATE: {c.trksub}\n"
        f"Discovered: {c.observatory_code} at {c.first_obs_datetime.isoformat()}\n\n"
        f"Position: RA {c.ra_deg:.3f}°, Dec {c.dec_deg:+.3f}° (J2000)\n"
        f"Ecliptic latitude: {c.ecliptic_latitude_deg:+.2f}°\n\n"
        f"Tracklet:\n"
        f"- {c.n_observations} observations over {c.arc_length_minutes:.1f} min\n"
        f"- Mean V mag: {c.mean_magnitude:.2f}\n"
        f"- Rate of motion: {c.rate_arcsec_min:.2f} arcsec/min\n"
        f"- MPC digest2 NEO-NoID score: {c.digest2_neo_noid}/100\n\n"
        f"{prediction_block}\n\n"
        f"Cross-survey context:\n"
        f"{context_block}\n\n"
        f"Produce your briefing for tonight's observer."
    )

    return SYSTEM_PROMPT, user_prompt


def split_reasoning_briefing(full_text: str) -> tuple[str, str]:
    """Split a structured model response into (reasoning, briefing) markdown.

    Never raises — if the headers are missing, falls back to
    ("", full_text) so downstream code still gets a briefing.
    """
    if not full_text:
        return "", ""

    match = _BRIEFING_MARKER_RE.search(full_text)
    if match is None:
        # Fallback: no Briefing header found, treat entire body as briefing.
        return "", full_text.strip()

    reasoning_raw = full_text[: match.start()]
    briefing_raw = full_text[match.end():]

    # Strip leading ## Reasoning header and trailing whitespace.
    reasoning = _REASONING_MARKER_RE.sub("", reasoning_raw, count=1).strip()
    briefing = briefing_raw.strip()
    return reasoning, briefing


def _default_client() -> AsyncAnthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not set in environment. Create .env from .env.example "
            "and add your Anthropic API key."
        )
    return AsyncAnthropic(api_key=api_key)


async def stream_briefing(
    request: BriefingRequest,
    *,
    client: AsyncAnthropic | None = None,
) -> AsyncIterator[BriefingChunk]:
    """Stream Opus 4.7 briefing chunks. Cache-aware; records cost on real calls.

    Routing: incoming `text_delta` events are partitioned across the
    `## Briefing` marker. Everything before the marker ships as
    `type="reasoning"` chunks; everything after ships as `type="text"`. The
    marker line itself is not emitted in either stream — it's a control token.
    """
    system, user = build_prompt(request)
    thinking_effort = DEFAULT_THINKING_EFFORT if request.include_reasoning else "minimal"

    cache_key = claude_cache.key_for(
        model=MODEL_VERSION,
        system=system,
        user=user,
        thinking_effort=thinking_effort,
    )
    cached = claude_cache.get(cache_key)
    if cached is not None:
        if cached.reasoning_markdown:
            yield BriefingChunk(type="reasoning", content=cached.reasoning_markdown)
        elif cached.reasoning_trace:
            # Back-compat: older cache entries used reasoning_trace for
            # streamed thinking deltas. Surface them in the reasoning channel.
            yield BriefingChunk(type="reasoning", content=cached.reasoning_trace)
        yield BriefingChunk(type="text", content=cached.briefing_markdown)
        yield BriefingChunk(
            type="done",
            content="cache_hit",
            cumulative_cost_usd=cost_tracker.summary().total_cost_usd,
        )
        return

    claude_client = client or _default_client()

    thinking_parts: list[str] = []
    full_text_buffer: list[str] = []
    reasoning_emitted_chars = 0  # how many chars of buffer have been sent as reasoning
    briefing_marker_hit = False

    stream_kwargs: dict[str, Any] = {
        "model": MODEL_VERSION,
        "max_tokens": MAX_OUTPUT_TOKENS,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }
    if request.include_reasoning:
        # Opus 4.7 uses adaptive thinking + output_config.effort rather than
        # the earlier budget_tokens control.
        stream_kwargs["thinking"] = {"type": "adaptive"}
        stream_kwargs["output_config"] = {"effort": thinking_effort}

    input_tokens = 0
    output_tokens = 0
    thinking_tokens = 0

    try:
        async with claude_client.messages.stream(**stream_kwargs) as stream:
            async for event in stream:
                if getattr(event, "type", None) != "content_block_delta":
                    continue
                delta = getattr(event, "delta", None)
                if delta is None:
                    continue
                delta_type = getattr(delta, "type", None)
                if delta_type == "thinking_delta":
                    # Opus 4.7 adaptive mode normally does not emit these,
                    # but if an older API shape produces them, capture for
                    # the reasoning channel.
                    text = getattr(delta, "thinking", "") or ""
                    if text:
                        thinking_parts.append(text)
                        yield BriefingChunk(type="reasoning", content=text)
                elif delta_type == "text_delta":
                    text = getattr(delta, "text", "") or ""
                    if not text:
                        continue
                    full_text_buffer.append(text)
                    combined = "".join(full_text_buffer)

                    if briefing_marker_hit:
                        # Post-marker: ship every new char as text.
                        yield BriefingChunk(type="text", content=text)
                        continue

                    # Still in reasoning phase. Look for the marker.
                    match = _BRIEFING_MARKER_RE.search(combined, reasoning_emitted_chars)
                    if match is None:
                        # Withhold a small tail in case marker spans chunks.
                        safe_end = max(reasoning_emitted_chars, len(combined) - 24)
                        if safe_end > reasoning_emitted_chars:
                            reasoning_chunk = combined[reasoning_emitted_chars:safe_end]
                            reasoning_emitted_chars = safe_end
                            yield BriefingChunk(
                                type="reasoning", content=reasoning_chunk
                            )
                        continue

                    # Marker found. Flush any remaining reasoning before it,
                    # emit whatever briefing text already followed the marker.
                    pre_marker = combined[reasoning_emitted_chars:match.start()]
                    if pre_marker:
                        yield BriefingChunk(type="reasoning", content=pre_marker)
                    briefing_marker_hit = True
                    post_marker = combined[match.end():]
                    if post_marker:
                        yield BriefingChunk(type="text", content=post_marker)

            # Stream exhausted. Flush any residual reasoning tail that was
            # held back waiting for a marker that never came.
            if not briefing_marker_hit:
                combined = "".join(full_text_buffer)
                if len(combined) > reasoning_emitted_chars:
                    tail = combined[reasoning_emitted_chars:]
                    if tail:
                        yield BriefingChunk(type="reasoning", content=tail)

            final = await stream.get_final_message()
            usage = final.usage
            input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
            output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
            thinking_tokens = int(getattr(usage, "thinking_tokens", 0) or 0)
    except Exception as exc:  # noqa: BLE001 — surface upstream error to caller
        yield BriefingChunk(type="error", content=f"{type(exc).__name__}: {exc}")
        return

    cumulative_cost = cost_tracker.record(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        thinking_tokens=thinking_tokens,
    )

    full_response_text = "".join(full_text_buffer)
    reasoning_md, briefing_md = split_reasoning_briefing(full_response_text)

    response = BriefingResponse(
        trksub=request.candidate.trksub,
        briefing_markdown=briefing_md,
        reasoning_markdown=reasoning_md,
        reasoning_trace="".join(thinking_parts) or None,
        model_version=MODEL_VERSION,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        thinking_tokens=thinking_tokens,
        cost_usd=cumulative_cost,
        generated_at=datetime.now(UTC),
        cache_hit=False,
    )
    claude_cache.put(cache_key, response)

    yield BriefingChunk(
        type="done",
        content="ok",
        cumulative_cost_usd=cumulative_cost,
    )


async def generate_briefing(
    request: BriefingRequest,
    *,
    client: AsyncAnthropic | None = None,
) -> BriefingResponse:
    """Non-streaming variant — returns the aggregated BriefingResponse."""
    system, user = build_prompt(request)
    thinking_effort = DEFAULT_THINKING_EFFORT if request.include_reasoning else "minimal"
    cache_key = claude_cache.key_for(
        model=MODEL_VERSION,
        system=system,
        user=user,
        thinking_effort=thinking_effort,
    )

    cached = claude_cache.get(cache_key)
    if cached is not None:
        return cached

    error_content: str | None = None
    async for chunk in stream_briefing(request, client=client):
        if chunk.type == "error":
            error_content = chunk.content

    if error_content is not None:
        raise RuntimeError(f"Briefing failed: {error_content}")

    cached = claude_cache.get(cache_key)
    if cached is None:
        raise RuntimeError("Briefing completed but cache miss — unexpected state")
    return cached
