# Demo Script v1 — neo-triage

**Target duration:** 2:45–3:00  
**Recording URL:** http://localhost:5173 (or Vercel URL once deployed)  
**Pre-flight:** Backend running, agent at 100+ cycles, YR4 cache warm (click through once before recording)

---

## [0:00–0:10] HOOK — The problem in one sentence

**Visual:** Black screen OR dashboard loading  
**Say:**
> "In 2024, asteroid 2024 YR4 briefly crossed Torino Scale 3 — possible impact 2032. Observers had 18 hours to figure out if it was real. We built the tool that would have helped them."

*Cut immediately to dashboard.*

---

## [0:10–0:35] LIVE FEED — The scale problem

**Visual:** Dashboard Live Feed, candidates list loaded, AGENT pill showing cycle count  
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
> "Digest2 at 98. Rate 2.80 arcsec per minute. P(NEO) point-nine-eight-six."

*Point at P(NEO) hero number.*

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
> "Hour zero — first posting. P(PHA) zero-point-one. Hours six, twelve — more observations, arc grows, probability climbs."

*Click +18h (Torino 3 node).*
> "Hour eighteen. P(PHA) zero-point-nine-one. Torino Scale 3. Twenty-eight observations from seven observatories. Claude updates its assessment at every step."

*Let h+18 briefing stream for 5 seconds.*

---

## [2:30–2:50] ALERT GENERATION — The NN-10 moment

**Visual:** Alert panel visible at bottom of h+18 view. Pulsing "GENERATE ALERT NOW" button.  
**Say:**
> "When Torino 3 is crossed — this button. Every press generates a fresh alert from Opus 4.7. Never cached. Never the same twice."

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

## Notes for recording

- **Slow down at reasoning streams** — let text appear, don't rush past it.
- **P21YR4A is the demo star** — it's the 2024 YR4 analog. Pause on its P(NEO)=0.986 and the briefing.
- **The alert moment is the peak** — hold 3 seconds after "URGENT" line appears.
- **Do NOT show cost meter closely** — $1.37 signals shallow usage; zoom out before any budget close-up.
- **Agent cycle count is evidence** — if 100+, point to it explicitly. "One hundred cycles, 8 days, autonomous."
- **YR4 cache is warm** — milestone briefings load instantly (cache_hit). That's fine for demo — shows the system works.

## Pre-recording checklist

- [ ] Browser: new incognito window, no extensions
- [ ] Dock hidden: `defaults write com.apple.dock autohide -bool true && killall Dock`
- [ ] Fullscreen browser
- [ ] Screen recording: OBS or `Cmd+Shift+5` → record entire screen
- [ ] Microphone test: 5-second clip, listen back
- [ ] Backend: `curl localhost:8000/health` → should show agent_cycle ≥ 100
- [ ] YR4 cache warm: click h+0, h+6, h+12, h+18, h+30 once each before recording
- [ ] Agent alert: keep dashboard open 5 min before recording — if new alert fires, even better
