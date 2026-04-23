# Sky Viz Research — Decision for Friday 2026-04-24 morning

**Research conducted:** 2026-04-23 evening (Thu), post-deploy
**Decision deadline:** Friday 2026-04-24 08:00 Warsaw (before demo recording block)
**Purpose:** Decide whether adding a 3D sky / orbital visualization is worth 4-8h of Friday time, or whether that time is better spent on demo polish + rehearsals.

---

## TL;DR recommendation

**CUT. Go with SV-E (NASA Eyes screenshot embed in README + demo intro).**

Everything the sky viz would buy us — context framing, "this is a real field" credibility, visual wow — can be delivered by two 800px PNG screenshots and a single sentence in the demo intro: "NASA tracks ~37,000 near-Earth objects; Rubin will pour another 130 candidates per night into NEOCP; neo-triage is the prioritization layer on top." Zero integration risk, 30 minutes of work, full reusability post-hackathon.

All four build options (SV-A/B/C/D) introduce integration risk during the final 72h window, for a feature that judges will remember less than a clean demo.

If by Friday 11:00 the demo recording is done and we have a spare 3h, the fastest lift is **SV-B (iframe NASA Eyes)** — confirmed no blocking X-Frame-Options headers — as an additional tab. But only after demo is in the can.

---

## Context

- **Project state:** production-complete. Both Railway and Vercel live, smoke-tested end-to-end, cost meter working, NN-10 verified in production. All PRD features shipped.
- **Time remaining:** ~76h to internal target (Sun 2026-04-26 23:00 Warsaw), ~79h to hard deadline (Mon 2026-04-27 02:00 Warsaw).
- **Friday plan:** 07:00 wake → 07:30-09:00 demo recording → 09:00-12:00 edit → 13:00+ submission package + rehearsals. Sky viz would steal 4-8h from that block.
- **Original plan note:** sky viz is NOT in PRD or PLAN.md. This is pure "wow factor" scope creep. Judges evaluate on: (1) Opus 4.7 integration depth, (2) Managed Agent longevity, (3) problem fit. Not orbital viz polish.

---

## Original plan dead

The Techiral/OrreryWeb repository referenced in the original JSON plan is **no longer available** on GitHub (404 at time of research). Pivoted to evaluating alternatives from the broader orrery/asteroid-viz ecosystem.

---

## Five options evaluated

### SV-A: Fork + embed a React orrery project

Two viable candidates found via GitHub search:

**Option A1 — `gordonhart/atlasof.space`**
- **Stars / activity:** 106★, updated 2026-04-09 (active)
- **Language:** TypeScript — matches our stack
- **License:** Apache-2.0 — permissive, compatible with our project
- **Approach:** Fork repo, extract `<OrbitScene />` component, wire our ranked-candidate list to highlight positions.
- **Effort:** 6–10h. Integration with Tailwind v4, routing, state — non-trivial.
- **Risk:** HIGH. Three.js + React 19 + TS + our Tailwind v4 + Vite 8 matrix is uncharted. Likely build issues. Could break production for hours while debugging.

**Option A2 — `jshor/tycho`**
- **Stars / activity:** 110★, updated 2026-03-31 (active)
- **Language:** JavaScript (not TS)
- **License:** MIT — permissive
- **Size:** 54MB repo
- **Approach:** Similar to A1 but needs JS→TS adaptation for our codebase.
- **Effort:** 8–12h. JS dependency on jQuery-era patterns possible.
- **Risk:** HIGH. Same as A1 plus language mismatch.

### SV-B: iframe embed of NASA Eyes on Asteroids

- **URL:** `https://eyes.nasa.gov/apps/asteroids/`
- **HTTP response:** 200, no `X-Frame-Options` header, no CSP `frame-ancestors` directive, no frame-blocking `<meta>` tags in HTML.
- **Preliminary verdict:** iframe-embedding is NOT server-blocked.
- **Approach:** Add a "Sky View" tab next to "Live Feed" and "2024 YR4 Replay". `<iframe src="https://eyes.nasa.gov/apps/asteroids/#/asteroids/2024_YR4" ...>` — NASA Eyes has URL-param deep links.
- **Effort:** 1–2h. Single component, no data wiring.
- **Risk:** LOW. If iframe fails to render, we hide the tab — no production breakage. Fallback is easy.
- **Cons:** (1) External service — if NASA Eyes goes down during judging, tab is blank. (2) Bandwidth hit on page load. (3) Doesn't visualize OUR candidates — just shows NASA's view of known NEOs.

### SV-C: Custom minimal Three.js orbital viz from scratch

- **Approach:** Build a simple `<OrbitalView />` component using `three` npm package. Render sun at origin, Earth orbit circle, plot each candidate's ecliptic latitude/RA as a point on a sphere. No full 3D orbit solve — just "where in the sky" visualization.
- **Effort:** 4–6h.
- **Risk:** MEDIUM. Scope is bounded but astronomy math for ecliptic→screen projection is non-trivial to get right. Adds ~150KB to bundle.
- **Cons:** "Custom" means we own maintenance. Judge impression might be "looks amateur next to NASA Eyes".

### SV-D: Static matplotlib image of asteroid field (eleanorlutz inspiration)

- **Source repo:** `eleanorlutz/asteroids_atlas_of_space` (1296★) — but GPL-3.0 licensed so we cannot fork code. Inspiration only.
- **Approach:** Build a Python script using `astropy.coordinates` + `matplotlib` to query JPL HORIZONS for ~50 known NEOs + our top-10 ranked candidates, render a sky-projection PNG. Embed in README + show in demo intro.
- **Effort:** 2–4h. Python side, no frontend integration.
- **Risk:** LOW. It's just a PNG in the end.
- **Cons:** Static. Doesn't feel "live". Good for README storytelling, not for demo wow.

### SV-E: NASA Eyes screenshot embed (no build)

- **Approach:** Visit `https://eyes.nasa.gov/apps/asteroids/`, capture two high-res screenshots: (1) full NEO cloud around Earth, (2) zoomed on inner solar system with 2024 YR4 highlighted. Embed in README "Context" section + reference in demo narration ("NASA tracks 37,000+ NEOs — Rubin will 8× the candidate flood — neo-triage is the prioritization layer").
- **Effort:** 30 min.
- **Risk:** NONE.
- **Cons:** No interactivity. Static images in README only.

---

## Scoring matrix

Criteria scored 1–5 (5 = best):

| Option | Time saved | Zero-risk | Demo impact | Judge wow | Post-hack reuse | **Total** |
|---|---|---|---|---|---|---|
| SV-A1 (atlasof.space fork) | 1 | 1 | 4 | 4 | 3 | **13** |
| SV-A2 (tycho fork) | 1 | 1 | 4 | 4 | 2 | **12** |
| SV-B (NASA Eyes iframe) | 4 | 4 | 3 | 3 | 4 | **18** |
| SV-C (custom Three.js) | 2 | 3 | 3 | 3 | 3 | **14** |
| SV-D (Python static PNG) | 3 | 5 | 2 | 2 | 3 | **15** |
| SV-E (NASA Eyes screenshot) | 5 | 5 | 3 | 3 | 4 | **20** |

**Winner on scoring: SV-E.**

---

## Recommendation

### Primary: SV-E (static NASA Eyes screenshots)
1. Take 2 high-res NASA Eyes screenshots Friday morning during demo prep (15 min).
2. Add a "Context" or "Why this matters" section to README with one screenshot.
3. In demo intro, narrate over the screenshot: "NASA currently tracks ~37,000 near-Earth objects. When Rubin comes online in mid-2025, that number grows — and the nightly NEOCP candidate queue grows 8× with it. neo-triage is the prioritization layer on top of that queue."

Time cost: **30 min total.** Value delivered: credibility framing + visual context.

### Secondary (only if Friday demo is in the can by 11:00): SV-B (NASA Eyes iframe tab)
- Add third tab "Sky View" next to "Live Feed" and "2024 YR4 Replay".
- Content: `<iframe src="https://eyes.nasa.gov/apps/asteroids/" style="width:100%; height:100vh; border:0" />`
- Pre-flight: open `https://eyes.nasa.gov/apps/asteroids/` in browser DevTools from our Vercel URL, verify no CSP breakage.
- If the iframe loads cleanly, it's 30 min of work. If it fails, hide the tab, revert, move on.

### What NOT to do
- **Don't** attempt SV-A (fork) — 6–12h sink with real risk of breaking production during the final 48h window. Our deployed product is solid; don't touch it.
- **Don't** attempt SV-C (custom Three.js) — astronomy projection edge cases will eat hours.
- **Don't** ship SV-D unless we get Mike Brown feedback Friday 17:00 that judges will specifically care about orbit diagrams (unlikely per past hackathon feedback).

---

## If Friday morning decision = BUILD (SV-B iframe path)

Steps, max 90 min:

1. Branch off main: `git checkout -b feat/sky-view-iframe`
2. Add third tab state + button in `App.tsx` header.
3. Create `frontend/src/components/SkyView.tsx` with iframe.
4. Test locally — confirm NASA Eyes loads inside iframe, no CSP errors in console.
5. If OK: commit, `vercel --prod`, verify on production URL.
6. If iframe blocked at runtime: `git checkout main`, move on, no harm done.

## If Friday morning decision = CUT

1. Take 2 NASA Eyes screenshots (15 min).
2. Add "Context" section to README with screenshot + one paragraph framing (10 min).
3. Update demo script to reference screenshot in intro (5 min).
4. Done. Full 3h block frees up for demo recording.

---

## What Mike Brown session (Friday 17:00 Warsaw) might change

If Mike specifically says "judges liked interactive visuals" → reconsider SV-B post-session (2h available Fri evening).
If Mike says "strong Opus 4.7 story wins" → stay on CUT path, focus on tightening demo narration of the 4 Opus touchpoints.

---

**Decision ownership:** Kacper, Friday 2026-04-24 ~07:30 Warsaw, during coffee. No later than 08:00 to preserve demo recording window.
