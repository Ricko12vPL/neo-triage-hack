# Submission Form — pre-filled fields

All fields ready to copy-paste when the hackathon submission form is live.

---

## Team

- **Team name:** neo-triage
- **Members:**
  - Kacper Saks — Aerospace engineer at Airbus (planetary defense + full-stack)
  - Paweł Kulak — Backend engineer

## Project

### Title
neo-triage — Bayesian NEO Follow-up Prioritization with Opus 4.7

### Tagline (≤140 chars)
Claude Opus 4.7 reads the nightly asteroid tracklets, ranks them by impact risk, and writes the alert when the threat indicator peaks.

### Short description (≤500 chars)
When the Vera C. Rubin Observatory goes live it will post ~130 NEO candidates per night — 8× today. Only ~8% are real. neo-triage combines a Bayesian classifier with Claude Opus 4.7 briefings so observers decide what to chase in real time. Opus has four voices: per-candidate recommendation, historical YR4 replay, live-written global alert at Torino peak, and the Managed Agent running continuously in the background.

### Long description (expand if form allows)
neo-triage is a planetary-defense follow-up prioritization tool. The Minor Planet Center's NEOCP posts new asteroid tracklets nightly — when the Rubin Observatory enters operations, the volume jumps 8× with roughly 8% signal purity. Human observers cannot read every tracklet.

Our solution puts Claude Opus 4.7 at four touchpoints:

1. **Per-candidate briefing.** Streams reasoning first, then a tight observational recommendation with extended thinking visible.

2. **2024 YR4 historical replay.** 7 milestones (h+0 → h+168). Opus re-assesses each as a real astronomer would have at that moment, against ground truth.

3. **Live-written global alert.** When the threat indicator peaks at h+18, Opus drafts the message to the worldwide follow-up network. Uncached — fresh every press.

4. **Managed Agent.** Async loop, every 5 minutes, pulls new candidates, scores them, broadcasts detections to the UI over WebSocket, writes JSONL decision log. Ran continuously for 24h+ during the hackathon.

Backend: FastAPI, scikit-learn GBM with isotonic calibration, content-addressable JSON cache (no pickle anywhere). Frontend: Vite + React 19 + Tailwind v4 with pure-TypeScript Meeus astronomy (no astropy in the bundle). Deployed Railway + Vercel.

### Technology stack
Python 3.12, FastAPI, Pydantic v2, scikit-learn, Anthropic SDK, Vite, React 19, TypeScript, Tailwind CSS v4, Railway, Vercel.

## Links

- **Source code:** https://github.com/Ricko12vPL/neo-triage-hack
- **Live demo (Vercel):** _TBD — Day 5 deploy_
- **API (Railway):** _TBD — Day 5 deploy_
- **Demo video:** _TBD — uploaded to YouTube unlisted (or repo-hosted)_

## Bonus prize categories — explicit selection

### Best Managed Agents ($5K)
**Evidence:**
- Managed Agent runs continuously on a 5-minute cycle
- `data/agent_log.jsonl` holds cumulative cycles across the hackathon (150+ at submission time)
- Every cycle decision is logged with trksub, prediction, and timestamp — judges can `jq` the log directly
- WebSocket broadcast pushes new candidates to all connected UIs without polling
- Agent status pill in the header shows cycle count live

### Most Creative Opus 4.7 use ($5K)
**Evidence:**
- Live-written global alert at the threat peak — fresh every time, no cache (NN-10)
- 11-iteration prompt engineering experiment (see `docs/prompt-selection.md`) selecting persona v6
- Extended thinking surfaced in the UI — judges see Claude reason before writing
- YR4 replay shows Opus assessing the same unfolding event at h+0, h+6, h+12, h+18 etc. as a domain expert would

### Keep Thinking ($5K)
**Evidence:**
- Every briefing call enables extended thinking — reasoning content stream is split from the recommendation stream and rendered in a collapsible panel
- Reasoning visible by default — users see the model's work before the conclusion
- YR4 replay demonstrates per-moment assessment with full thinking trace

## Q&A anticipation prep

- **How does this scale to Rubin's 130/night?** Ranker + agent cycle unchanged — prompt costs scale linearly, cache keeps repeat queries free, candidate list is filterable. 130 candidates × $0.07 = $9.10/night, well below any observatory's LLM budget.
- **Ranker accuracy?** On synthetic test split: accuracy 0.97, PHA recall 1.0, ECE 0.01. Real Vereš 2025 data integration is v1.1 scope.
- **Why Claude vs. open-source LLM?** Persona coherence, reasoning quality, extended thinking. Briefings read like a veteran observer, not boilerplate. Five in a row cite numbers and name what would change the recommendation.
- **Is the agent actually continuous?** Yes — `data/agent_log.jsonl` has 150+ cycles. JSONL so judges can inspect raw.
- **How is briefing quality measured?** 11-iteration prompt experiment with 7 evaluation dimensions — cites-numbers, recommendation-specificity, persona-consistency, length, refusal-behavior, hallucination rate, cache-key stability. v6 won.
- **Why scikit-learn not deep learning?** ADR-003 explicit: sklearn + isotonic is sufficient for 7-feature classification on 2000-sample synthetic data. NN would overfit.
- **Security/privacy?** No PII, public research data, NN-11 env-var secrets only.
- **First commit before kickoff?** See `docs/timeline-transparency.md` — boilerplate only (pyproject, health endpoint). Zero domain code. All logic post-kickoff.

## Pre-submission sanity checklist

- [ ] Vercel URL loads on mobile (different network)
- [ ] Railway `/health` returns 200 with `agent_running: true`
- [ ] Demo video plays end-to-end at submission URL
- [ ] GitHub repo is public
- [ ] README renders correctly on github.com
- [ ] Screenshots visible on README
- [ ] Team member names spelled correctly
- [ ] Bonus categories checked
- [ ] Confirmation page screenshotted after submit
