# Demo Script v4 — neo-triage

**Target duration:** 3:30–3:45
**Recording URL:** https://neo-triage-hack.vercel.app (production)
**Pre-flight:** Cache warmed, agent cycling, YR4 h+0/+6/+12/+18/+30 pre-loaded, Warsaw observer location picked, **Sky View tab visited once so the Three.js chunk is warm + Orbit View toggled once so its lazy chunk is also warm**. NASA Eyes iframe left in "live" mode (or switched to "static" fallback if the recording region triggers a cookie modal — toggle is the `▶ live / ⏸ static` button in the NASA Eyes panel header).

**What changed vs v3:** Sky View now polished (12k background density, clickable famous NEOs with real data panel, visible celestial grid labels). A new **Orbit View toggle** adds a heliocentric scene: Sun at origin, Mercury–Mars orbits, 18 famous asteroid and comet orbits as Keplerian ellipses computed from J2000 elements. The new `0:40–1:05` Orbit View beat is the jury hook — one toggle and the demo reads like NASA Eyes, but ours.

**What changed vs v4-initial (2026-04-24 evening polish):**
1. **Progressive orbit reveal.** Sky View is clean by default — ground tracks render *only* when the user clicks an object. Click Bennu → Bennu's track fades in; click Apophis → Apophis's track fades in, Bennu's fades out; click empty sky → everything clears. Solves the "Geographos looks like it orbits Earth" confusion.
2. **Primary-candidate motion arcs.** Clicking a tracklet in the Live Feed reveals a 24-hour forward proper-motion arc plus a translucent uncertainty cone that widens with shorter observed arcs. The detail panel now carries honest framing: "Preliminary motion vector — not a substitute for JPL Scout/Sentry orbit determination."
3. **Torino-scale glow hierarchy.** T0 slate, T1 blue, T2 yellow (0.5 Hz pulse), T3 orange (1 Hz pulse), T4–5 red (1.4 Hz pulse), T6+ dark-red (2 Hz pulse). P21YR4A at T3 now visibly pulses.
4. **Context toggle.** `👁 Context ON / 🎯 Triage focus` pill top-right hides the famous-NEO layer + 12k background points, leaving only tonight's triage set + Earth + grid. State persists.
5. **JPL-verified orbital elements.** All 18 famous NEOs re-fetched from NASA/JPL Horizons at J2000 and patched. The previous hand-propagated mean anomalies were off by up to 170°. Re-verification is one `python scripts/verify_jpl_orbital_elements.py` away.
6. **Stable labels + markers across zoom.** Html drops distanceFactor; markers scale ∝ camDist/6.5 clamped to [0.55, 1.9] so the tonight's-triage set stays visible at any zoom level.

---

## [0:00–0:10] HOOK — The problem in one sentence

**Visual:** Dashboard loaded with **Sky View tab active, Sky View mode**. Earth at center, no orbit tracks drawn (clean default), primary candidates pulsing by Torino colour, NASA Eyes catalog below. **Context toggle on** so the jury sees the full NEO population backdrop the first time.

**Say:**
> "In 2024, asteroid 2024 YR4 briefly crossed Torino Scale 3 — a 2.4 percent chance of Earth impact in 2032. Observers had eighteen hours to figure out if it was real. We built the tool that would have helped them."

_Earth rotates once. P21YR4A pulses red. Coloured orbit arcs drape the sphere._

---

## [0:10–0:40] SKY VIEW — What's in the sky tonight

**Visual:** Sky View mode. Bottom panel shows NASA Eyes live — Sun, planets, 37k blue point cloud of known NEOs.

**Say:**
> "NASA tracks over thirty-seven thousand Near-Earth Objects. Every faint dot in this catalog is already known."

_Pause — cursor drifts to bottom panel, let Eyes render the faint asteroid cloud._

> "Starting next year, Vera Rubin Observatory will add another one hundred and thirty candidates every single night. Follow-up capacity doesn't scale eight-fold. The question becomes — which ten do we observe tonight?"

_Cursor up to top panel. The coloured arcs and white markers of the famous-NEO backdrop are visible._

> "These curves are the projected orbit paths of the asteroids you've heard of — Bennu, Apophis, Didymos. Not stylised. Computed from their Keplerian elements as ground-tracks on our sky."

_Click Didymos._

**Visual:** Its ground-track brightens, others dim. Violet-accented details panel slides in showing _real_ data: 780 m primary, DART impactor 2022, Hera arrival 2026.

> "Real astronomical data — not synthetic. Didymos is where humanity first changed the orbit of another body, with the DART impactor in 2022."

_Close panel._

---

## [0:40–1:05] ORBIT VIEW — Where these things actually live

**Visual:** Click the **Sky View / Orbit View** toggle at the top of the panel. Scene transitions to heliocentric — Sun glowing yellow, Mercury through Mars as clean circles, 18 asteroid and comet orbits rendered as Keplerian ellipses colour-coded by class.

**Say:**
> "Understanding the hazard needs more than sky positions — it needs orbital geometry. This is the same catalog in a Sun-centred view."

_Camera auto-rotates or viewer drags; Earth's orbit is visible in blue; Bennu, Apophis, Didymos ellipses cross it._

> "Apollo asteroids in red — orbits that cross Earth's. Atens in orange — Earth-crossing but mostly inside our orbit. Amors in amber — they approach but don't cross. Slate for main belt. Blue for Jupiter-family comets."

_Click Apophis ellipse._

**Visual:** Track brightens, FamousNEODetailsPanel shows Apophis — 370 m, Sq-type, 2029-04-13 close approach at 31 600 km, highest Torino ever assigned (4).

> "Apophis — closest approach 2029, thirty-one thousand six hundred kilometres. That's inside the orbit of geostationary satellites."

_Close panel, switch back to **Sky View** toggle._

> "Every follow-up decision tonight is a decision about which of those paths we care about most. neo-triage answers that question."

---

## [1:05–1:20] SKY VIEW — Click the candidate

**Visual:** Back in Sky View. Primary candidates visible (P21YR4A pulsing red, nine others in blue/amber by Torino).

**Say:**
> "Ten triage candidates tonight, colour-coded by Torino Scale. The pulsing red one is our YR4 analog — Torino 3."

_Click P21YR4A._

_Cut happens automatically — the click switches us back to Live Feed with the briefing already streaming._

---

## [1:20–2:00] BRIEFING — Claude's voice

**Visual:** Live Feed. PredictionCard shows P(NEO) = 0.986, Torino 3 badge. Reasoning streams on the left, briefing streams on the right.

**Say (over reasoning streaming):**
> "Opus 4.7 writes the assessment. Reasoning first — you can see it working."

_Pause while reasoning streams for 2–3 seconds._

> "Digest2 at ninety-eight. Rate two point eight arcsec per minute. Impact probability two point four percent on a fifty-metre body, roughly ten megaton yield — Torino 3 by Binzel 2000."

_Point at P(NEO) = 0.986, then at the Torino 3 badge._

**Say (over briefing streaming):**
> "Specific. Dry. Actionable. It reads the ATLAS and CSS non-detections. It tells you exactly what would change its mind."

_Let 2–3 sentences of briefing render visibly before moving on._

---

## [2:00–2:10] AGENT ALERT — Autonomous detection

**Visual:** If agent alert banner appears naturally — perfect. Otherwise open a new tab to `/api/agent/status` showing cycle > 370.

**Say:**
> "The Managed Agent surfaces new objects autonomously — no human triggers a briefing. The alert arrives before the observer even opens the dashboard."

---

## [2:10–3:00] YR4 REPLAY — The real event, reconstructed

**Visual:** Click "2024 YR4 Replay" tab. Timeline appears with gradient connector line. Pause for 2 seconds.

**Say:**
> "This is the actual 2024 YR4 event, reconstructed hour by hour. Every milestone is real data."

_Scrub from +0h slowly to +12h, clicking each node._
> "Hour zero — first posting. Impact probability effectively zero. Hours six, twelve — more observations, arc grows, probability climbs."

_Click +18h (Torino 3 node)._
> "Hour eighteen. Impact probability two point four percent. Fifty-metre body, ten megaton yield. Torino 3 — meriting concern, localized destruction possible. Twenty-eight observations from seven observatories. Claude updates its assessment at every step."

_Let h+18 briefing stream for 5 seconds._

---

## [3:00–3:20] ALERT GENERATION — The NN-10 moment

**Visual:** Alert panel visible at bottom of h+18 view. Pulsing "GENERATE ALERT NOW" button.

**Say:**
> "When the threat indicator peaks — this button. Every press generates a fresh alert from Opus 4.7. Never cached. Never the same twice. Claude cites the same Torino 3 — same impact probability, same kinetic energy, same table — that the badge shows."

_Click "GENERATE ALERT NOW". Alert streams._

> "URGENT. All stations. This is the message that would go out."

_Hold on streaming alert text for 3 seconds._

---

## [3:20–3:40] CLOSE

**Visual:** Flip back to Sky View. Orbit arcs still visible. Toggle to Orbit View for the final frame — full heliocentric scene, our ten triage points overlaid across the known-population orbits.

**Say:**
> "neo-triage. Bayesian classifier, Claude Opus 4.7 briefings, Managed Agent running continuously. Thirty-seven thousand asteroids in the catalog; neo-triage tells you which ten matter tonight."
>
> "MIT. Built with Opus 4.7."

---

## Anticipated Q&A (judging call)

### New for v4 (Orbit View + ground-tracks)

**Q: The heliocentric view — did you compute those orbits or pull them from somewhere?**
A: Computed client-side from Keplerian elements in `frontend/src/lib/kepler.ts`. We stored the elements (a, e, i, Ω, ω, M at J2000) for eighteen well-known bodies sourced from JPL SBDB. At render time we solve Kepler's equation with Newton-Raphson per Meeus, convert eccentric to true anomaly, rotate from the orbital plane to heliocentric ecliptic, and for the Sky View ground-tracks subtract Earth's position and project to RA/Dec. Demo-grade precision, not astrometric — we're inside ~0.5° for e<0.7 vs Horizons. Fine for visualization, not fine for an actual ephemeris service.

**Q: Why two views — Sky View and Orbit View?**
A: Different questions. Sky View answers "what can my telescope point at tonight" — that's a geocentric celestial-sphere problem. Orbit View answers "what does the orbital geometry say about encounter geometry and risk" — that's a heliocentric ellipse problem. NASA Eyes is primarily the second; the TriCCS observer's nightly plan is primarily the first. We show both and let the user switch. Same famous-NEO catalog feeds both views, same click → same detail panel.

**Q: What happens if I click an asteroid in Orbit View?**
A: Same Famous NEO details panel opens as in Sky View — real astronomical data, not synthetic P(NEO) or Torino. Selection state is shared across mode toggles, so the object you inspect in orbit view stays inspected when you flip back to sky view.

**Q: Why don't the primary candidates (P21YR4A etc.) show orbit ellipses in the heliocentric view?**
A: Because they're minutes-old tracklets — seven to twenty observations spanning less than an hour. You cannot fit a Keplerian orbit to an arc that short; the `Candidate` schema doesn't even have orbital elements. In Sky View we render them as short tangent motion indicators, which is the honest visualization of what we know. In Orbit View they're simply absent — the scene is for objects with full orbit determination.

### Carried from v3

**Q: You show both NASA Eyes and your own 3D view. Why both?**
A: Contrast. NASA Eyes shows the population — thirty-seven thousand bodies, Rubin adding hundreds per week. Our top panels (Sky + Orbit) show the triage — the ten we're working on tonight plus the known catalog for context. neo-triage exists to turn "everything" into "what matters now" via Claude-powered reasoning, and the dual-view makes the gap visible.

**Q: The UI badge and Claude's alert both say "Torino 3". Are those the same calculation?**
A: Yes — unified. Both derive from impact_probability × kinetic_energy per Binzel 2000. During production smoke-testing on Thursday we caught a mismatch — the UI was using a P(PHA) proxy that overstated severity, while Claude correctly cited the real table. We aligned the UI calculation with the science and with Claude before recording. The orbit-enrichment block in the milestone card shows you both axes: 2.4% impact probability, H=24 (≈50m, ≈10 MT), which lands Torino 3 on the canonical table.

**Q: Where do impact_probability and H come from in a production pipeline?**
A: They're enrichments from orbit determination — JPL HORIZONS, NEODyS close-approach tables, Sentry. Our schema marks both fields optional on Candidate; the Bayesian classifier outputs P(NEO)/P(PHA) from tracklet features alone. When orbit solutions arrive, the Torino axes light up.

**Q: How does the YR4 alert prove NN-10 (no cache)?**
A: Click the button twice. You get two different messages. Same model, same prompt, different text — because there's no cache layer between the button and Claude. The backend route is `/api/replay/yr4/alert` and it bypasses `claude_cache.get()` entirely. Rate-limited to once per 10 seconds to prevent accidental cost spikes.

**Q: What's the agent actually doing between cycles?**
A: It sleeps for 5 minutes, then pulls fresh mock candidates (production hook: real NEOCP), runs them through the ranker, compares against seen trksubs, generates briefings for genuinely new ones, emits WebSocket events to any connected UI, and appends a JSONL cycle log entry. That loop has been running continuously since 370+ cycles.

**Q: Is the 3D sky view scientifically accurate or just decorative?**
A: Scientifically accurate. Each candidate is plotted at its measured (RA, Dec) converted to a unit vector on a celestial sphere of radius 4 — `lib/celestial.ts::radec_to_xyz`. The ecliptic ring is tilted 23.44° from the celestial equator, matching Earth's obliquity. NEOCP tracklets cluster near the ecliptic because that's where surveys spend the most integration time. Famous NEOs get their current RA/Dec computed from orbital elements at session JD — drift in real time would require periodic recomputation but we lock at mount for demo determinism.

---

## Notes for recording

- **Both Sky View AND Orbit View must be pre-warmed before recording.** Sky View chunk ~254 KB gzip, Orbit View chunk ~2 KB (but pulls the shared Three.js chunk if not already loaded). Toggle both at least once ten seconds before hitting record.
- **The Sky View ↔ Orbit View transition is the money shot.** Practice the toggle timing — you want camera mid-drift when clicked so the scene change feels alive.
- **NASA Eyes cookie modals:** if the recording region triggers a consent overlay inside the iframe, hit the `▶ live / ⏸ static` toggle in the NASA Eyes header to swap to the pre-shipped static image. The button is styled to blend with the chrome and is fine to be on screen.
- **Top panel auto-rotates in Sky View** — Orbit View does not (deliberate, it's a geometry-reading view).
- **Slow down at reasoning streams** — let text appear, don't rush past it.
- **P21YR4A is still the demo star** — 2024 YR4 analog. Pause on P(NEO)=0.986 and the briefing.
- **Torino 3 everywhere** — if anywhere still says "Torino 5", the deploy didn't take; hard-refresh.
- **The alert moment is the peak** — hold 3 seconds after "URGENT" line appears.
- **Do NOT show cost meter closely** — signals shallow usage; zoom out before any budget close-up.
- **Agent cycle count is evidence** — if 370+, point to it explicitly.
- **Playwright note (H-1):** R3F canvas click from automated browser tests is unreliable (pointerdown→up cycle on same pointerId fails from synthetic events). For demo recording use native screen capture (macOS `Cmd+Shift+5`, OBS, or QuickTime). Do not attempt Playwright clicks on the 3D scene — use the Live Feed DOM list + "return to 3D view" flow if scripted automation is required. The details panel can be seeded from Live Feed selection and survives tab switches.

## Pre-recording checklist (use Friday 07:30)

- [ ] Close Slack, Discord, email
- [ ] Silence phone
- [ ] Chrome DevTools CLOSED
- [ ] Hide dock: `defaults write com.apple.dock autohide -bool true && killall Dock`
- [ ] Browser zoom 100%
- [ ] Fullscreen browser, new incognito window
- [ ] Verify Vercel URL loads cleanly
- [ ] **Visit SKY VIEW tab once, click the ORBIT VIEW toggle once, wait ~5 s for both scenes to warm, return to SKY VIEW**
- [ ] Click Bennu (or Didymos) once to warm the FamousNEODetailsPanel component
- [ ] Verify Railway agent status (cycle > 370)
- [ ] Test mic: 5-second voice memo, listen back
- [ ] Water within reach
- [ ] Coffee (fresh)
- [ ] 2–3 candidate briefings pre-warmed in cache (click P21YR4A, P21a3Kx, P21b7Pm once each)
- [ ] YR4 h+0 through h+30 pre-warmed in cache (click each once)
- [ ] Screen recording tool ready: OBS or `Cmd+Shift+5` → record entire screen
