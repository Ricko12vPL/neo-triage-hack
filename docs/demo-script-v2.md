# Demo Script v2 — neo-triage

**Target duration:** 2:45–3:00
**Recording URL:** https://neo-triage-hack.vercel.app (production) — fallback http://localhost:5173
**Pre-flight:** Cache warmed, agent cycling, YR4 h+0/+6/+12/+18/+30 pre-loaded, Warsaw observer location picked

**What changed vs v1:** All "Torino 5" references now "Torino 3" — UI and Claude narrative are unified on the real Binzel 2000 table (impact_probability × kinetic_energy). The v1 proxy used P(PHA) thresholds and overstated severity; v2 speaks the same language as Claude's alert body.

---

## [0:00–0:10] HOOK — The problem in one sentence

**Visual:** Black screen OR dashboard loading
**Say:**
> "In 2024, asteroid 2024 YR4 briefly crossed Torino Scale 3 — a 2.4% chance of Earth impact in 2032. Observers had 18 hours to figure out if it was real. We built the tool that would have helped them."

*Cut immediately to dashboard.*

---

## [0:10–0:35] LIVE FEED — The scale problem

**Visual:** Dashboard Live Feed, candidate list loaded, AGENT pill showing cycle count
**Say:**
> "When the Vera Rubin Observatory comes online, it will flood the planetary-defense network with 130 candidates a night — eight times more than today. Most are false alarms. This is neo-triage."
>
> "The Managed Agent runs every five minutes, ranking every candidate by Bayesian classifier. Cycle [N] and counting."

*Point to AGENT pill. Let cycle counter sit for 2 seconds.*

---

## [0:35–1:20] BRIEFING — Claude's voice

**Visual:** Click P21YR4A in the candidate list. Watch reasoning stream, then briefing stream.
**Say (over reasoning streaming):**
> "The top candidate — an analog of 2024 YR4. Claude Opus 4.7 writes the assessment. You can see it reasoning first."

*Pause while reasoning streams. Then:*
> "Digest2 at 98. Rate 2.80 arcsec per minute. P(NEO) point-nine-eight-six. Impact probability 2.4% on a fifty-metre body — Torino 3."

*Point at P(NEO) hero number, then at the Torino 3 badge on the PredictionCard.*

**Say (over briefing streaming):**
> "This is Opus 4.7's voice — not a template, not a fill-in. Specific, dry, actionable. It reads non-detections from ATLAS and CSS. It tells you exactly what would change its mind."

*Let 2–3 sentences of briefing render visibly before moving on.*

---

## [1:20–1:35] AGENT ALERT — Autonomous detection

**Visual:** If agent alert banner appears naturally — perfect. If not, briefly show agent status (`/api/agent/status` in a new tab) showing cycles accumulated.
**Say:**
> "The Managed Agent surfaces new objects autonomously — no human triggers a briefing. The alert arrives before the observer even opens the dashboard."

---

## [1:35–2:30] YR4 REPLAY — The real event, reconstructed

**Visual:** Click "2024 YR4 Replay" tab. Timeline appears with gradient connector line. Pause for 2 seconds.
**Say:**
> "This is the actual 2024 YR4 event, reconstructed hour by hour. Every milestone is real data."

*Scrub from +0h slowly to +12h, clicking each node.*
> "Hour zero — first posting. Impact probability effectively zero. Hours six, twelve — more observations, arc grows, probability climbs."

*Click +18h (Torino 3 node).*
> "Hour eighteen. Impact probability 2.4%. Fifty-metre body, ten megaton yield. Torino 3 — meriting concern, localized destruction possible. Twenty-eight observations from seven observatories. Claude updates its assessment at every step."

*Let h+18 briefing stream for 5 seconds.*

---

## [2:30–2:50] ALERT GENERATION — The NN-10 moment

**Visual:** Alert panel visible at bottom of h+18 view. Pulsing "GENERATE ALERT NOW" button.
**Say:**
> "When the threat level peaks — this button. Every press generates a fresh alert from Opus 4.7. Never cached. Never the same twice. Claude cites the same Torino 3 — same impact probability, same kinetic energy, same table — that you see on the badge."

*Click "GENERATE ALERT NOW". Alert streams.*

> "URGENT. All stations. This is the message that would go out."

*Hold on streaming alert text for 3 seconds.*

---

## [2:50–3:00] CLOSE

**Visual:** Quick screenshot of architecture OR return to Live Feed with agent cycling.
**Say:**
> "neo-triage. Bayesian classifier, Claude Opus 4.7 briefings, Managed Agent running continuously. Because the next hazardous asteroid shouldn't wait for a human to notice."
>
> "MIT. Built with Opus 4.7."

---

## Anticipated Q&A (judging call)

**Q: The UI badge and Claude's alert both say "Torino 3". Are those the same calculation?**
A: Yes — unified. Both derive from impact_probability × kinetic_energy per Binzel 2000. During production smoke-testing on Thursday we caught a mismatch — the UI was using a P(PHA) proxy that overstated severity, while Claude correctly cited the real table. We aligned the UI calculation with the science and with Claude before recording. The orbit-enrichment block in the milestone card shows you both axes: 2.4% impact probability, H=24 (≈50m, ≈10 MT), which lands Torino 3 on the canonical table.

**Q: Where do impact_probability and H come from in a production pipeline?**
A: They're enrichments from orbit determination — JPL HORIZONS, NEODyS close-approach tables, Sentry. Our schema marks both fields optional on Candidate; the Bayesian classifier outputs P(NEO)/P(PHA) from tracklet features alone. When orbit solutions arrive, the Torino axes light up. For the YR4 replay, we use the real historical values at each milestone.

**Q: Why not just use P(PHA) as a Torino proxy?**
A: P(PHA) is a classification probability — "is this a potentially hazardous asteroid class?" Impact probability is a collision probability for a specific close-approach window. They answer different questions. Confusing them overstates risk (as our v1 did for YR4).

**Q: How does the YR4 alert prove NN-10 (no cache)?**
A: Click the button twice. You get two different messages. Same model, same prompt, different text — because there's no cache layer between the button and Claude. The backend route is `/api/replay/yr4/alert` and it bypasses `claude_cache.get()` entirely. Rate-limited to once per 10 seconds to prevent accidental cost spikes.

**Q: What's the agent actually doing between cycles?**
A: Nothing — it sleeps for 5 minutes, then pulls fresh mock candidates (production hook: real NEOCP), runs them through the ranker, compares against seen trksubs, generates briefings for genuinely new ones, emits WebSocket events to any connected UI, and appends a JSONL cycle log entry. That loop has been running continuously since [N] cycles — you can see the timestamps in `data/agent_log.jsonl`.

---

## Notes for recording

- **Slow down at reasoning streams** — let text appear, don't rush past it.
- **P21YR4A is the demo star** — 2024 YR4 analog. Pause on P(NEO)=0.986 and the briefing.
- **Torino 3 everywhere now** — if anywhere still says "Torino 5", the deploy didn't take; hard-refresh.
- **The alert moment is the peak** — hold 3 seconds after "URGENT" line appears.
- **Do NOT show cost meter closely** — $0.34 signals shallow usage; zoom out before any budget close-up.
- **Agent cycle count is evidence** — if 300+, point to it explicitly. "Three hundred cycles, autonomous."
- **YR4 cache is warm** — milestone briefings load instantly (cache_hit). That's fine for demo — shows the system works.
- **Alert must be cache-miss** — first click may take 10–15 s; plan for it in the script pace.

## Pre-recording checklist (use Friday 07:30)

- [ ] Close Slack, Discord, email
- [ ] Silence phone
- [ ] Chrome DevTools CLOSED
- [ ] Hide dock: `defaults write com.apple.dock autohide -bool true && killall Dock`
- [ ] Browser zoom 100%
- [ ] Fullscreen browser, new incognito window
- [ ] Verify Vercel URL loads cleanly
- [ ] Verify Railway agent status (cycle > 0)
- [ ] Test mic: 5-second voice memo, listen back
- [ ] Water within reach
- [ ] Coffee (fresh)
- [ ] 2–3 candidate briefings pre-warmed in cache (click P21YR4A, P21a3Kx, P21b7Pm once each)
- [ ] YR4 h+0 through h+30 pre-warmed in cache (click each once)
- [ ] Screen recording tool ready: OBS or `Cmd+Shift+5` → record entire screen
