# Demo Script v5 — Hybrid Classifier Climax

**Target length:** 3:30–3:45.
**Hero moment:** P21LOWRT — ranker says COMET P(NEO)=0.000, Opus 4.7
DISSENT pushes back with rate-magnitude analysis, suggests deprioritise
+ second-night recovery instead of dismiss-and-forget.

This script supersedes v4.1 (`docs/demo-script-v4.md`) — the v5 changes
are concentrated at 2:15–2:50 where the hybrid classifier becomes the
centerpiece.

---

## Stage assets to pre-warm

Before recording, browse:

1. https://neo-triage-hack.vercel.app/  → wait 10 s for top-K expert reviews to stream
2. Click on `P21LOWRT` once → confirms the Opus DISSENT panel is cached
3. Click on `P21YR4A` once → confirms the briefing is cached
4. Click `Sky View` tab → confirms Three.js bundle is loaded
5. Click `Orbit View` toggle → confirms the heliocentric scene compiles
6. Click `2024 YR4 Replay` once → confirms the replay timeline is loaded

These warm caches keep every interaction in the demo at <300 ms.

---

## Outline

| Time | Beat | What's on screen |
|---|---|---|
| 0:00–0:15 | Hook — *37k known NEOs, Rubin adds 130/night from 2027, follow-up doesn't scale 8×.* | Sky View with NASA Eyes context below |
| 0:15–0:40 | Sky View reveal — clean default, click Bennu → progressive orbit reveal | Sky View, Bennu marker glowing, ground track fading in |
| 0:40–1:05 | Orbit View toggle — *"and here's where it actually lives in the solar system"* | Orbit View heliocentric, planets + 18 NEO ellipses |
| 1:05–1:30 | Switch to Live Feed — header reads "47 live · 10 demo · click to brief" | Live Feed list, scroll once to show full population |
| 1:30–2:10 | Click P21YR4A → briefing streams in with thinking visible | BriefingPanel, ThinkingDrawer expanded |
| **2:10–2:55** | **CLIMAX — P21LOWRT click → ranker COMET vs Opus DISSENT** | **CandidateDetailsPanel + ExpertReviewPanel** |
| 2:55–3:20 | Managed Agent tab — cycle counter, JSONL log scroll, expert events | AgentStatusIndicator + log tail |
| 3:20–3:45 | Closing — *"Two classifiers, one operator. Bulk plus expert. The system flags disagreement, not just consensus."* | Hero shot of Sky View with P21LOWRT pulsing purple ring |

---

## CLIMAX (2:10–2:55) — the hybrid classifier moment

### Voiceover

> *"Most of the queue is straightforward — the ranker triages 47 live
> NEOCP tracklets in milliseconds. But triage is exactly where you want
> a second opinion on the high-stakes calls."*
>
> *(click P21LOWRT)*
>
> *"This is P21LOWRT. The ranker classified it as a comet, P(NEO) zero —
> the calibrated GBM looked at digest2 sixty-eight, rate zero-point-one-
> eight arcsec per minute, and said 'low-confidence, parking it under
> COMET'. Opus 4.7 disagrees."*
>
> *(scroll to ExpertReviewPanel — DISSENT badge visible)*
>
> *"DISSENT. Endorsed class: MBA. Confidence match: low. Why?"*
>
> *(read first caveat aloud — point with cursor)*
>
> *"Critical: V equals eighteen-point-four with a rate of zero-point-one-
> eight arcsec per minute near opposition implies a geocentric distance
> of five-to-six AU. That's a Hilda or a Trojan, not a NEO or an active
> comet."*
>
> *"Opus is reading rate-magnitude geometry the ranker can't see — it
> has the features, not the physical model. The system flags this for
> the operator, who would otherwise move on."*
>
> *(scroll to suggested action)*
>
> *"Suggested action: deprioritise tonight, request a second epoch.
> Cheap to settle. The triage decision changes from 'ignore' to 'don't
> spend telescope time tonight, but don't lose track of it either'."*
>
> *(click Sky View)*
>
> *"And there's the visual signal — purple pulsing ring around P21LOWRT.
> Anywhere the two classifiers disagree, the operator's eye is drawn to
> that exact spot on the celestial sphere."*

### What the viewer sees

1. CandidateDetailsPanel scrolls down to ExpertReviewPanel.
2. ExpertReviewPanel header reads `OPUS 4.7 EXPERT REVIEW · DISSENT`.
3. Endorsed class `MBA` next to confidence `LOW`.
4. Reasoning trace visible (3 paragraphs of plain-English physical reasoning).
5. Caveats list — the CRITICAL `MAGNITUDE_RATE_MISMATCH` is the visual anchor.
6. Suggested-action button reads `Request a second epoch` in violet tone.
7. Footer shows `claude-opus-4-7 · $0.21 · fresh` (or `cache hit` on subsequent runs).
8. Sky View flyover: P21LOWRT marker has the purple pulsing ring; nearby
   CONCUR-state markers have subtle green static rings.

### Q&A pre-answers

> **Q: Why hybrid instead of just Opus?**
>
> A: Calibration. Opus isn't natively calibrated to bin-frequency
> probability. The ranker's `P(NEO)=0.78` means 78% of objects with this
> feature combination are actually NEOs in the training set. Opus gives
> reasoning, not statistics. You need both.

> **Q: Cost analysis?**
>
> A: Ranker is ~zero per candidate. Opus is ~$0.005 per cached review,
> ~$0.05–0.21 fresh. Top 5 every 15 min ≈ $5–15/day. Full Opus over 47
> would be 10× the spend and less calibrated.

> **Q: What if they disagree often?**
>
> A: That's a feature, not a bug. Disagreement = operator attention
> required. Logged to `data/agent_log.jsonl` as `expert_review_completed`
> events. The disagreement pattern reveals where the ranker's training
> distribution misses edge cases — it's the next iteration's signal.

> **Q: Latency budget?**
>
> A: Ranker stays in milliseconds. Opus runs ~3–8 s with adaptive
> thinking, ~150–200 ms cache hit. The agent loop fans out top-K
> reviews in parallel via `asyncio.gather`, so the cycle wall time is
> Opus latency, not 5× Opus latency.

> **Q: Cost circuit breaker?**
>
> A: Sliding 1-hour window. If expert review cost in the last hour
> exceeds $5, the agent skips review for that cycle and logs
> `expert_circuit_breaker_open`. Briefing path keeps running. Engineering
> maturity prerequisite for any LLM-in-the-loop production system.

---

## Closing line (3:30–3:45)

> *"Two classifiers, one operator. The Bayesian GBM gives you a
> calibrated probability across all 47 candidates. Opus 4.7 gives you
> reasoning where it matters — the top-K — and tells you when it
> disagrees with the ranker. That's not redundancy. That's how you
> allocate scarce telescope time when Rubin starts adding a hundred
> tracklets a night and you can't read them all yourself."*
>
> *(close on Sky View hero shot, P21YR4A pulsing red, P21LOWRT pulsing
> purple, both visible at once.)*

---

## Recording checklist

- [ ] Pre-warm caches (open every tab once)
- [ ] Confirm `data · Demo candidates · updated …s ago` shows in header
- [ ] Confirm 5 top-K rows have `opus` chip (CONCUR or DISSENT)
- [ ] Confirm P21LOWRT chip reads `opus !` (DISSENT) — if not, force
      refresh: `curl https://.../api/rank/expert-review/P21LOWRT`
- [ ] Confirm Sky View ring on P21LOWRT pulses purple
- [ ] Confirm Managed Agent cycle counter increments during demo
- [ ] Run cost meter sanity: $5–25 cumulative, not $0 (signals deep
      Opus integration to jurors)

---

*Last edited 2026-04-25 alongside the BLOCK_6 step of the
`neo-triage-hack-opus-expert-classifier-hybrid-full-integration` JSON
load.*
