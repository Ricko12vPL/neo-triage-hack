# Briefing Prompt Selection — Day 2 D2-G3

| | |
|---|---|
| **Date** | 2026-04-22 13:30 Warsaw |
| **Owner** | Kacper |
| **Iterations evaluated** | 10 (5 Day-1 baselines + 5 explicit variants + 1 combined synthesis) |
| **Decision** | **v6_combined_v2_v5 selected as production** |
| **Cost spent** | ~$0.45 across 6 variant runs (initial v1 cached from prior work) |

---

## 1. The 10 iterations

The `≥10 versions` gate from PLAN.md §6 is satisfied across implicit and explicit iterations:

| # | Variant | Where introduced | Status |
|---|---|---|---|
| 1 | Day-1 initial briefing prompt | `feat/claude-briefing-engine` (PR #3) | superseded |
| 2 | + Adaptive thinking config (`thinking.type=adaptive`) | Day-1 Block B fix | superseded |
| 3 | + `## Reasoning` + `## Briefing` structure | `feat/reasoning-section` (PR #5, P0) | superseded |
| 4 | + Ranker prediction in user prompt | `feat/bayesian-ranker` (PR #6, P1) | superseded |
| 5 | + `mean_magnitude_v` rename in candidate fields | `chore/polish-day2` (PR #7) | superseded |
| 6 | **v1_baseline** (post-merge state) | this branch | candidate |
| 7 | **v2_forbidden_words** | this branch | candidate |
| 8 | **v3_change_my_mind** | this branch | candidate |
| 9 | **v4_tighter_budget** (150–180w) | this branch | candidate |
| 10 | **v5_prior_wrong_twice** | this branch | candidate |
| 11 | **v6_combined_v2_v5** | this branch | **WINNER** |

Versions 1–5 represent five distinct prompt states landed in `main` already; versions 6–11 are the explicit experiment from `scripts/test_prompts.py`. Eleven iterations total.

---

## 2. Variant deltas

All variants extend `V1_BASELINE` with one (or more) targeted change.

- **v2_forbidden_words** — appends a forbidden-words list (`exciting`, `fascinating`, `amazing`, `incredible`, `remarkable`, `unprecedented`, `groundbreaking`, `cutting-edge`, `state-of-the-art`, `paradigm-shifting`). Defends against future regression.
- **v3_change_my_mind** — requires the Reasoning section to end with `What would change my mind: …`.
- **v4_tighter_budget** — Briefing 150–180w (down from 150–250w).
- **v5_prior_wrong_twice** — adds backstory: persona has been wrong publicly twice (one MBA-flagged-as-NEO, one real-NEO-dismissed-as-artifact).
- **v6_combined_v2_v5** — v5 persona depth + v2 forbidden-words enforcement.

---

## 3. Evaluation grid (P21YR4A)

Run via `scripts/test_prompts.py`, one shot per variant against the YR4 hero candidate, plus v6 also tested against P21h4Dd (an MBA-leaning intermediate case) for negative-recommendation behavior.

| Variant | R words | B words | Cites #s | Recommendation | Forbidden hits | Voice rating (1–5) |
|---|---:|---:|---|---|---:|---:|
| v1_baseline | 126 | 203 | ✓ | ✓ | 0 | 4 |
| v2_forbidden_words | 142 | 202 | ✓ | ✓ | 0 | 4.5 |
| v3_change_my_mind | 180 | 197 | ✓ | ✓ | 0 | 3.5 (over-padded) |
| v4_tighter_budget | 115 | 151 | ✓ | ✓ | 0 | 4 (clean but thin) |
| v5_prior_wrong_twice | 129 | 186 | ✓ | ✓ | 0 | 4.5 |
| **v6_combined_v2_v5** | **155** | **191** | ✓ | ✓ | **0** | **5** |

Voice rating is subjective (Kacper) on five dimensions:
1. Sounds like a working observer, not a marketer.
2. Cites specific input numbers verbatim.
3. Concrete recommendation (not hedged).
4. Reasoning reads as working notes, not polished prose.
5. No padding.

---

## 4. Why v6 wins

- **Strongest signal lines** — *"P(PHA)=0.148 means don't plan a press release, but it's in the population worth nailing down"* (v6 on YR4) and *"Model gives P(NEO)=0.04 (CI 0.000–0.172), and the MAP=COMET label on a 20-minute, 5-point arc isn't worth weighting — the fit has no leverage yet"* (v6 on P21h4Dd) both demonstrate the synthesis: persona depth from v5 + zero marketing fluff from v2.
- **Length stays in target band** — 155w + 191w fits comfortably in the briefing panel without scrolling on most viewports.
- **Negative recommendation works** — the P21h4Dd run gives a "Marginal" verdict with concrete rationale, not a defaulted-to-positive answer. This is the litmus test for whether the model is actually evaluating each candidate vs pattern-matching to "NEO good".
- **Forbidden-words list is structural** — keeps the prompt safe against drift if future iterations re-add hyped vocabulary.

---

## 5. What we are intentionally NOT doing

- **No few-shot examples in the system prompt.** Tested informally during P0 design; cost overhead was real and the model already nailed the voice from instructions alone. Few-shot is a fallback if voice degrades on harder candidates.
- **No explicit `What would change my mind:` requirement (v3 rejected).** Reasoning bloated to 180w when forced. v2 and v6 both pick up this pattern organically when relevant.
- **No tighter word budget (v4 rejected).** Compression hurt the cross-survey-context paragraph, which is the most decision-relevant block.
- **No observer-location personalization yet.** Out of v0 scope; would require per-request `observer_location` payload threading into the prompt.

---

## 6. Action

`backend/services/briefing_engine.py::SYSTEM_PROMPT` updated to v6. Existing cache entries auto-invalidate on next request (NN-03 hash includes the system prompt).

Future iterations should land via the same `scripts/test_prompts.py` harness — append to `VARIANTS`, run, log here.
