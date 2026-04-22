"""Prompt iteration harness for the briefing engine.

Generates briefings against candidate fixtures using a list of prompt
variants, then writes per-variant outputs to `data/prompt_experiments/`
for blind side-by-side comparison.

Usage:
    python scripts/test_prompts.py             # all variants vs YR4
    python scripts/test_prompts.py --variants v3 v5  # subset
    python scripts/test_prompts.py --candidates P21YR4A P21h4Dd
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from backend.data.mock_candidates import MOCK_CANDIDATES  # noqa: E402
from backend.models.schemas import BriefingRequest  # noqa: E402
from backend.services import briefing_engine  # noqa: E402
from backend.services.ranker import get_ranker  # noqa: E402

OUT_DIR = Path("data/prompt_experiments")
DEFAULT_CROSS_SURVEY = (
    "ATLAS covered this region 6h ago to V=19.7 and saw nothing. "
    "CSS covered 14h ago to V=20.2 and saw nothing."
)


# ---------------------------------------------------------------------
# Prompt variants — pure SYSTEM_PROMPT swap-ins.
# ---------------------------------------------------------------------

V1_BASELINE = briefing_engine.SYSTEM_PROMPT


V2_FORBIDDEN_WORDS = V1_BASELINE + (
    "\n\nForbidden words and phrases — never use these in either section: "
    "'exciting', 'fascinating', 'amazing', 'incredible', 'remarkable', "
    "'unprecedented', 'groundbreaking', 'cutting-edge', 'state-of-the-art', "
    "'paradigm-shifting'. If a thought wants one of these words, rewrite "
    "the thought."
)


V3_WHAT_WOULD_CHANGE_MY_MIND = V1_BASELINE + (
    "\n\nThe Reasoning section MUST end with one short sentence beginning "
    "with 'What would change my mind:' — name the specific signal or new "
    "data that would flip your recommendation. This is non-negotiable."
)


V4_TIGHTER_BUDGET = V1_BASELINE.replace(
    "They are 150-250 words.",
    "They are 150-180 words. Compression is the discipline.",
).replace(
    "## Briefing\nThe 150-250 word observer-facing briefing",
    "## Briefing\nThe 150-180 word observer-facing briefing",
)


V5_PRIOR_WRONG_TWICE = V1_BASELINE.replace(
    "You are a veteran follow-up astronomer who has worked NEO confirmation for 15 years.",
    "You are a veteran follow-up astronomer who has worked NEO confirmation for 15 years. "
    "You have been wrong publicly twice in your career — once flagging an MBA as a NEO "
    "and once dismissing a real NEO as an artifact. You write knowing both are possible.",
)


V6_COMBINED = V5_PRIOR_WRONG_TWICE + (
    "\n\nForbidden words and phrases — never use these in either section: "
    "'exciting', 'fascinating', 'amazing', 'incredible', 'remarkable', "
    "'unprecedented', 'groundbreaking', 'cutting-edge', 'state-of-the-art', "
    "'paradigm-shifting'. If a thought wants one of these words, rewrite "
    "the thought."
)


VARIANTS: dict[str, str] = {
    "v1_baseline": V1_BASELINE,
    "v2_forbidden_words": V2_FORBIDDEN_WORDS,
    "v3_change_my_mind": V3_WHAT_WOULD_CHANGE_MY_MIND,
    "v4_tighter_budget": V4_TIGHTER_BUDGET,
    "v5_prior_wrong_twice": V5_PRIOR_WRONG_TWICE,
    "v6_combined_v2_v5": V6_COMBINED,
}


# ---------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------


def _word_count(text: str) -> int:
    return len([w for w in text.split() if w.strip()])


def _evaluate_briefing(reasoning: str, briefing: str) -> dict[str, object]:
    text = (reasoning + " " + briefing).lower()
    forbidden = ["exciting", "fascinating", "amazing", "incredible", "remarkable",
                 "unprecedented", "groundbreaking", "cutting-edge"]
    has_forbidden = [w for w in forbidden if w in text]

    cites_numbers = any(
        token in briefing
        for token in ("digest2", "p(neo)", "v=", "arcsec", "/min")
    )
    cites_recommendation = any(
        token in briefing.lower()
        for token in ("observe now", "skip", "wait for", "worth the time", "skip unless")
    )
    has_change_my_mind = "what would change my mind" in reasoning.lower()

    return {
        "reasoning_words": _word_count(reasoning),
        "briefing_words": _word_count(briefing),
        "has_forbidden_words": has_forbidden,
        "cites_specific_numbers": cites_numbers,
        "concrete_recommendation": cites_recommendation,
        "has_change_my_mind": has_change_my_mind,
    }


# ---------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------


async def run_variant(
    variant_name: str,
    system_prompt: str,
    candidate_trksub: str,
    out_dir: Path,
) -> dict[str, object]:
    candidate = next(c for c in MOCK_CANDIDATES if c.trksub == candidate_trksub)
    ranker = get_ranker()
    prediction = ranker.predict(candidate).model_copy(
        update={"trksub": candidate.trksub}
    )

    request = BriefingRequest(
        candidate=candidate,
        prediction=prediction,
        cross_survey_context=(
            DEFAULT_CROSS_SURVEY if candidate.trksub == "P21YR4A" else None
        ),
        include_reasoning=True,
    )

    # Swap the system prompt for this run only.
    original_prompt = briefing_engine.SYSTEM_PROMPT
    briefing_engine.SYSTEM_PROMPT = system_prompt

    try:
        response = await briefing_engine.generate_briefing(request)
    finally:
        briefing_engine.SYSTEM_PROMPT = original_prompt

    metrics = _evaluate_briefing(
        response.reasoning_markdown, response.briefing_markdown
    )

    record = {
        "variant": variant_name,
        "candidate": candidate_trksub,
        "system_prompt_sha256": hashlib.sha256(system_prompt.encode()).hexdigest()[:12],
        "model_version": response.model_version,
        "input_tokens": response.input_tokens,
        "output_tokens": response.output_tokens,
        "cost_usd": response.cost_usd,
        "cache_hit": response.cache_hit,
        "metrics": metrics,
        "reasoning": response.reasoning_markdown,
        "briefing": response.briefing_markdown,
        "generated_at": response.generated_at.isoformat(),
    }

    variant_dir = out_dir / variant_name
    variant_dir.mkdir(parents=True, exist_ok=True)
    out_path = variant_dir / f"{candidate_trksub}.json"
    out_path.write_text(json.dumps(record, indent=2, default=str))

    return record


async def main_async(
    variants: Sequence[str],
    candidates: Sequence[str],
) -> None:
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S")
    out_dir = OUT_DIR / timestamp
    out_dir.mkdir(parents=True, exist_ok=True)

    summary: list[dict[str, object]] = []

    for variant_name in variants:
        if variant_name not in VARIANTS:
            print(f"  ! unknown variant: {variant_name}, skipping")
            continue
        system_prompt = VARIANTS[variant_name]
        for trksub in candidates:
            print(f"  → {variant_name} / {trksub} ...", end=" ", flush=True)
            record = await run_variant(
                variant_name, system_prompt, trksub, out_dir
            )
            print(
                f"r={record['metrics']['reasoning_words']:3d}w  "  # type: ignore[index]
                f"b={record['metrics']['briefing_words']:3d}w  "  # type: ignore[index]
                f"${record['cost_usd']:.4f}  "
                f"{'cached' if record['cache_hit'] else 'fresh'}"
            )
            summary.append({k: v for k, v in record.items()
                            if k not in ("reasoning", "briefing")})

    summary_path = out_dir / "summary.json"
    summary_path.write_text(json.dumps(summary, indent=2, default=str))
    print(f"\nSummary: {summary_path}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--variants", nargs="+", default=list(VARIANTS.keys())
    )
    parser.add_argument(
        "--candidates", nargs="+", default=["P21YR4A"]
    )
    args = parser.parse_args()

    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise RuntimeError("ANTHROPIC_API_KEY not set in environment")

    asyncio.run(main_async(args.variants, args.candidates))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
