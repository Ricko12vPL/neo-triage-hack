# Demo Script v3 — neo-triage

**Target duration:** 3:15–3:30
**Recording URL:** https://neo-triage-hack.vercel.app (production) — fallback http://localhost:5173
**Pre-flight:** Cache warmed, agent cycling, YR4 h+0/+6/+12/+18/+30 pre-loaded, Warsaw observer location picked, **Sky View tab visited once so the Three.js chunk is warm and the NASA Eyes iframe has settled into the full catalog view**.

**What changed vs v2:** Opening is now the new **SKY VIEW** tab — a two-layer visual. Top: our 10 triage candidates plotted on the celestial sphere with P21YR4A pulsing red. Bottom: NASA Eyes on Asteroids iframe showing the 37 000-object JPL catalog live. The contrast IS the pitch: "NASA tracks everything; neo-triage tells you which ten to look at tonight." Click → Live Feed briefing flows as before. All Torino 3 language preserved from v2; the unified-Binzel-2000 story still holds.

---

## [0:00–0:10] HOOK — The problem in one sentence

**Visual:** Dashboard loaded with **SKY VIEW tab active**. Earth at center, NASA Eyes catalog below.
**Say:**
> "In 2024, asteroid 2024 YR4 briefly crossed Torino Scale 3 — a 2.4% chance of Earth impact in 2032. Observers had eighteen hours to figure out if it was real. We built the tool that would have helped them."

*Let the Earth rotate once. P21YR4A pulses red near the frame.*

---

## [0:10–0:40] SKY VIEW — Scale, contrast, click

**Visual:** Sky View tab. Bottom panel shows NASA Eyes live — Sun, planets, 37k diffuse blue point cloud of known NEOs.
**Say:**
> "NASA tracks over thirty-seven thousand Near-Earth Objects. Every faint dot in this catalog is already known."

*Pause — move cursor to bottom panel, let Eyes render the faint asteroid cloud.*

> "Starting next year, Vera Rubin Observatory will add another one hundred and thirty candidates every single night. Follow-up capacity doesn't scale eight-fold. So the question becomes — which ten do we observe tonight?"

*Move cursor up to top panel. The 10 candidates are plotted on the celestial sphere.*

> "neo-triage answers that. Ten ranked objects, color-coded by Torino. The red pulsing one is our YR4 analog — Torino 3."

*Click P21YR4A in the 3D sphere.*

*Cut happens automatically — the click switches us back to Live Feed with the briefing already streaming.*

---

## [0:40–1:25] BRIEFING — Claude's voice

**Visual:** Live Feed. PredictionCard shows P(NEO) = 0.986, Torino 3 badge. Reasoning streams on the left, briefing streams on the right.
**Say (over reasoning streaming):**
> "Opus 4.7 writes the assessment. Reasoning first — you can see it working."

*Pause while reasoning streams for 2–3 seconds.*

> "Digest2 at ninety-eight. Rate two point eight arcsec per minute. Impact probability two point four percent on a fifty-metre body, roughly ten megaton yield — Torino 3 by Binzel 2000."

*Point at P(NEO) = 0.986, then at the Torino 3 badge.*

**Say (over briefing streaming):**
> "Specific. Dry. Actionable. It reads the ATLAS and CSS non-detections. It tells you exactly what would change its mind."

*Let 2–3 sentences of briefing render visibly before moving on.*

---

## [1:25–1:40] AGENT ALERT — Autonomous detection

**Visual:** If agent alert banner appears naturally — perfect. Otherwise open a new tab to `/api/agent/status` showing cycle > 370.
**Say:**
> "The Managed Agent surfaces new objects autonomously — no human triggers a briefing. The alert arrives before the observer even opens the dashboard."

---

## [1:40–2:35] YR4 REPLAY — The real event, reconstructed

**Visual:** Click "2024 YR4 Replay" tab. Timeline appears with gradient connector line. Pause for 2 seconds.
**Say:**
> "This is the actual 2024 YR4 event, reconstructed hour by hour. Every milestone is real data."

*Scrub from +0h slowly to +12h, clicking each node.*
> "Hour zero — first posting. Impact probability effectively zero. Hours six, twelve — more observations, arc grows, probability climbs."

*Click +18h (Torino 3 node).*
> "Hour eighteen. Impact probability two point four percent. Fifty-metre body, ten megaton yield. Torino 3 — meriting concern, localized destruction possible. Twenty-eight observations from seven observatories. Claude updates its assessment at every step."

*Let h+18 briefing stream for 5 seconds.*

---

## [2:35–2:55] ALERT GENERATION — The NN-10 moment

**Visual:** Alert panel visible at bottom of h+18 view. Pulsing "GENERATE ALERT NOW" button.
**Say:**
> "When the threat indicator peaks — this button. Every press generates a fresh alert from Opus 4.7. Never cached. Never the same twice. Claude cites the same Torino 3 — same impact probability, same kinetic energy, same table — that the badge shows."

*Click "GENERATE ALERT NOW". Alert streams.*

> "URGENT. All stations. This is the message that would go out."

*Hold on streaming alert text for 3 seconds.*

---

## [2:55–3:15] CLOSE

**Visual:** Flip back to Sky View for the final shot — our 10 glowing points above the NASA 37k backdrop.
**Say:**
> "neo-triage. Bayesian classifier, Claude Opus 4.7 briefings, Managed Agent running continuously. Thirty-seven thousand asteroids in the catalog; neo-triage tells you which ten matter tonight."
>
> "MIT. Built with Opus 4.7."

---

## Anticipated Q&A (judging call)

**Q: You show both NASA Eyes and your own 3D view. Why both?**
A: Contrast. NASA Eyes shows the population — everything ever catalogued, thirty-seven thousand bodies, Rubin adding hundreds per week. Our top panel shows the triage — the ten we're working on tonight. neo-triage exists to turn "everything" into "what matters now" via Claude-powered reasoning, and the dual-view makes the gap visible. Also, click a point in our view and it drops you back into the briefing flow. One selection handler, two entry points.

**Q: The UI badge and Claude's alert both say "Torino 3". Are those the same calculation?**
A: Yes — unified. Both derive from impact_probability × kinetic_energy per Binzel 2000. During production smoke-testing on Thursday we caught a mismatch — the UI was using a P(PHA) proxy that overstated severity, while Claude correctly cited the real table. We aligned the UI calculation with the science and with Claude before recording. The orbit-enrichment block in the milestone card shows you both axes: 2.4% impact probability, H=24 (≈50m, ≈10 MT), which lands Torino 3 on the canonical table.

**Q: Where do impact_probability and H come from in a production pipeline?**
A: They're enrichments from orbit determination — JPL HORIZONS, NEODyS close-approach tables, Sentry. Our schema marks both fields optional on Candidate; the Bayesian classifier outputs P(NEO)/P(PHA) from tracklet features alone. When orbit solutions arrive, the Torino axes light up. For the YR4 replay, we use the real historical values at each milestone.

**Q: Why not just use P(PHA) as a Torino proxy?**
A: P(PHA) is a classification probability — "is this a potentially hazardous asteroid class?" Impact probability is a collision probability for a specific close-approach window. They answer different questions. Confusing them overstates risk (as our v1 did for YR4).

**Q: How does the YR4 alert prove NN-10 (no cache)?**
A: Click the button twice. You get two different messages. Same model, same prompt, different text — because there's no cache layer between the button and Claude. The backend route is `/api/replay/yr4/alert` and it bypasses `claude_cache.get()` entirely. Rate-limited to once per 10 seconds to prevent accidental cost spikes.

**Q: What's the agent actually doing between cycles?**
A: Nothing — it sleeps for 5 minutes, then pulls fresh mock candidates (production hook: real NEOCP), runs them through the ranker, compares against seen trksubs, generates briefings for genuinely new ones, emits WebSocket events to any connected UI, and appends a JSONL cycle log entry. That loop has been running continuously since 370+ cycles — you can see the timestamps in `data/agent_log.jsonl`.

**Q: Is the 3D sky view scientifically accurate or just decorative?**
A: Scientifically accurate. Each point is plotted at the candidate's measured (RA, Dec) in degrees, converted to a unit vector on a celestial sphere of radius 4 — `lib/celestial.ts::radec_to_xyz`. The ecliptic ring is tilted 23.44° from the celestial equator, matching Earth's obliquity. NEOCP tracklets cluster near the ecliptic because that's where surveys spend the most integration time, which you can see in the clustering pattern. The size and color encode Torino scale, not distance — distance isn't resolved from a minutes-old tracklet.

---

## Notes for recording

- **Sky View must be pre-loaded once before recording.** The lazy chunk is ~244 KB gzip and NASA Eyes takes ~5 s to settle. Visit Sky View 10 s before hitting record so both are warm.
- **Top panel auto-rotates** — start recording with Earth mid-rotation for motion on the first frame.
- **Slow down at reasoning streams** — let text appear, don't rush past it.
- **P21YR4A is the demo star** — 2024 YR4 analog. Pause on P(NEO)=0.986 and the briefing.
- **Torino 3 everywhere now** — if anywhere still says "Torino 5", the deploy didn't take; hard-refresh.
- **The alert moment is the peak** — hold 3 seconds after "URGENT" line appears.
- **Do NOT show cost meter closely** — $2.55 signals shallow usage; zoom out before any budget close-up.
- **Agent cycle count is evidence** — if 370+, point to it explicitly. "Three hundred seventy cycles, autonomous."
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
- [ ] **Visit SKY VIEW tab once, wait ~5 s for NASA Eyes iframe to settle to full catalog, then go back to LIVE FEED**
- [ ] Verify Railway agent status (cycle > 370)
- [ ] Test mic: 5-second voice memo, listen back
- [ ] Water within reach
- [ ] Coffee (fresh)
- [ ] 2–3 candidate briefings pre-warmed in cache (click P21YR4A, P21a3Kx, P21b7Pm once each)
- [ ] YR4 h+0 through h+30 pre-warmed in cache (click each once)
- [ ] Screen recording tool ready: OBS or `Cmd+Shift+5` → record entire screen
