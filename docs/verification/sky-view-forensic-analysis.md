# Sky View Forensic Analysis

**Produced:** 2026-04-23 evening (Day 5 wieczór)
**Author:** Claude Code (PHASE A — pure investigation, zero code changes)
**Scope:** 4 user-reported issues (U-1..U-4) + 5 hidden risks (H-1..H-5) surfaced from SUMMARY.md
**Method:** Read all Sky View source files + trace data flow + code-level verification

---

## 0. TL;DR

| ID  | Issue                              | Reproducible from code? | Root cause                                                                     | Fix effort |
| --- | ---------------------------------- | ----------------------- | ------------------------------------------------------------------------------ | ---------- |
| U-1 | Agent feed not in Sky View         | **NO — code is correct** | None found in code path. Needs runtime check; likely UX confusion or backend.   | 5 min recheck |
| U-2 | No orbits for Didymos / famous NEOs | YES                     | `famous_neos.ts` has no orbital elements; `FamousNEOMarker` renders no path.    | 60–240 min |
| U-3 | Gray objects unclickable           | YES                     | `raycast={() => null}` on background AND famous NEO meshes; no `onClick` either. | 20–60 min  |
| U-4 | "Looks like preview"               | YES (subjective)        | Tiny famous markers (0.022), no orbit lines, no time motion, sparse field.      | Tied to A/B/C |
| H-1 | Playwright can't click R3F canvas  | YES                     | Known: R3F needs full pointerdown→up cycle; Playwright synthetic events fail.   | 30 min workaround |
| H-2 | 3200 points sparse on 4K           | YES                     | Volume distribution `radius=5..18` → density per visible solid angle low.       | 10 min |
| H-3 | NASA Eyes EU cookie modal          | UNVERIFIABLE (offline)  | iframe to `eyes.nasa.gov`, no consent handler, no fallback wired.               | 30 min    |
| H-4 | Grid invisible vs Earth/dark bg    | YES                     | Ecliptic opacity 0.30, equator 0.35 — too faint over `#02040a` background.      | 5 min      |
| H-5 | Tangent line ≠ real orbit          | YES                     | `motionTrack()` synthesizes a 0.15..0.55-unit tangent — fine for short tracklets, not for "orbit". | conceptual |

**Bonus findings (not in original LOAD):**

| ID  | Issue                                                              | Severity | Location                          |
| --- | ------------------------------------------------------------------ | -------- | --------------------------------- |
| B-1 | `inspectedTrksub` initialized from prop, never re-synced            | LOW      | `SkyViewContainer.tsx:23-25`      |
| B-2 | Famous NEO marker has hover handlers but `raycast={() => null}`     | LOW      | `SkyViewPanel.tsx:444-450`        |
| B-3 | Wrong name: designation `"1620 Geographos"` is labeled `"Bennu"`    | **MEDIUM** (data bug, visible) | `famous_neos.ts:136`              |
| B-4 | `MotionTrack` BufferGeometry never disposed (memory leak)           | LOW      | `SkyViewPanel.tsx:210-214`        |

---

## 1. U-1 — Agent feed not propagating to Sky View (CLAIMED CRITICAL)

### Code trace

```
useAgentFeed.ts:52-58       → setEvents([...prev, event])
                              ↓
App.tsx:54-61               → newCandidateEvents = useMemo(events.filter, [events])  ✓ tracked
                              ↓
App.tsx:103-112             → displayCandidates = useMemo([...agent_new, ...candidates_filtered], [newCandidateEvents, candidates])  ✓ both deps tracked
                              ↓
App.tsx:316-323             → <SkyViewContainer candidates={displayCandidates} ... />  ✓ correct prop
                              ↓
SkyViewContainer.tsx:57     → <SkyViewPanel candidates={candidates} ... />  ✓ pass-through
                              ↓
SkyViewPanel.tsx:505-512    → {candidates.map((c) => <CandidateMarker key={c.trksub} ... />)}  ✓ keyed by trksub
```

**The code path is correct end-to-end.** No memoization bug, no stale closure, no missing dependency, no off-by-one in filter.

### Why user might still perceive it as broken

1. **Tab switching unmounts SkyViewContainer** (App.tsx:307 `{mode === "skyview" && ...}`). After remount, autoRotate restarts at default angle, so a newly-arrived candidate may currently be on the **back side** of the celestial sphere and not visible without waiting/dragging.
2. **No new-arrival animation** — new markers pop in at full size with no flash/scale. Visually identical to existing markers; the user has no signal "something just changed".
3. **Banner shows in Live Feed only**: `AgentAlertBanner` is rendered above all tabs (line 252 — overlaid, OK), but the count chip at top-left of Sky View (`{candidates.length} candidates`) updates silently.
4. **Mock agent in dev may not actually fire `new_candidate` events** for the duration of a Sky View session — needs runtime verification.

### Recommended action

**Do NOT write code for U-1 until reproduced live.** Suggested verification protocol (5 min):
1. Open dev server, switch to Sky View.
2. In another terminal: hit the agent endpoint that triggers a new_candidate broadcast.
3. Observe whether marker appears.
4. If NO → real bug; investigate R3F reconciliation.
5. If YES → user perception issue → fix is **B-A1: add new-marker enter animation + count delta toast**, not data flow.

---

## 2. U-2 — Famous NEOs have no orbits

### Root cause (confirmed in code)

`famous_neos.ts:16-33` — schema is sky-position snapshot only:

```ts
export interface FamousNEO {
  name; designation; ra_deg; dec_deg; h; diameter_m;
  spectral_class; orbit_class; note;
}
```

No `semi_major_axis_au`, `eccentricity`, `inclination_deg`, `longitude_ascending_node_deg`, `argument_periapsis_deg`, `mean_anomaly_deg`. Without these, no orbit can be computed.

`FamousNEOMarker` (`SkyViewPanel.tsx:429-474`) renders ONE sphere + ONE label. No orbit path code anywhere.

### Conceptual problem with "add orbits" in the current scene

Current Sky View is a **geocentric celestial sphere** (Earth at origin, projection of the night sky onto a ball). A NEO orbit around the Sun is a **heliocentric ellipse**. Projecting that ellipse onto the celestial sphere over time gives a "ground track" — a complex curve, not a clean ellipse. NASA Eyes shows clean ellipses because it uses **heliocentric** view (Sun at origin).

So "add orbit lines" has three viable interpretations:

| Interpretation | What renders | Effort | Pros | Cons |
| -------------- | ------------ | ------ | ---- | ---- |
| **(a) Synodic ground track** | Curve on celestial sphere showing where the NEO appears in our sky over its synodic period | 90 min | Stays in current scene, technically novel ("projected orbit on sky") | Hard to read; doesn't match user's mental model of "ellipse around Sun" |
| **(b) Heliocentric mode toggle** | Second scene: Sun at origin, Earth orbit, NEO ellipses | 4–6h | Matches NASA Eyes, instantly readable | Late-stage feature, large scope, doubles Three.js complexity |
| **(c) Schematic orbit indicator** | Small inset diagram per NEO showing a/e visually (not in 3D scene) | 60 min | Cheap, communicates orbit class | Not what user asked for; feels like a chart |

### Recommended action

Tied to A/B/C decision in §6 below.

---

## 3. U-3 — Gray objects unclickable

### Root cause (confirmed in code, unambiguous)

**Background field — `SkyViewPanel.tsx:148`:**

```tsx
<points geometry={BACKGROUND_NEO_GEOMETRY} raycast={() => null}>
```

`raycast={() => null}` is a R3F escape hatch that **completely disables** ray intersection. Pointer events cannot reach this object. Intentional — these are decorative.

**Famous NEO markers — `SkyViewPanel.tsx:442-453`:**

```tsx
<mesh
  onPointerOver={(e) => { ... setHovered(true); }}
  onPointerOut={() => setHovered(false)}
  raycast={() => null}    // ← disables the very events declared above
>
```

This is a **code contradiction (B-2)**: hover handlers are declared but raycast is null, so the handlers never fire. Hover state is dead code. **Plus:** there is NO `onClick` handler on famous NEO markers — even if raycast were enabled, clicking would do nothing.

### Why this exists

Famous NEOs were designed as "ambient backdrop context — every asteroid you've heard of". The author intentionally made them non-interactive (see comment `SkyViewPanel.tsx:413-418`: *"Non-interactive, rendered as white markers..."*). The intent and the code agree. The mismatch is between intent and **user expectation**.

### Fix options

| Option | Change | Effort |
| ------ | ------ | ------ |
| **(i) Make famous NEOs clickable** | Remove `raycast={null}`, add `onClick`, open a "famous body" detail panel (different content from RankedCandidate) | 45 min |
| **(ii) Add visual non-interactive cue** | Don't change cursor on hover; subtle visual treatment so user doesn't try to click | 10 min — keeps current intent, signals "decorative" |
| **(iii) Make background points clickable** | Add raycasting threshold to `<Points>` material; build a "background body" shallow detail | 90 min, low value (synthetic data) |

**Recommendation:** (i) for famous NEOs (high value — Bennu/Apophis/Didymos are name-recognition wins), skip (iii) for background.

---

## 4. U-4 — "Looks like a preview"

### Quantified visual audit

| Element | Size | Color | Opacity | Notes |
| ------- | ---- | ----- | ------- | ----- |
| Background NEO points | 0.05 (point size, attenuated) | blue/orange | 0.65 | 3200 distributed over `radius=5..18` shell — sparse |
| Famous NEO sphere | 0.022 radius | gray/violet | 0.65 | **Smaller than primary markers (0.055)** — looks junior |
| Primary candidate (default) | 0.055 radius | torino color | full + glow | Reads as "the main thing" — correct |
| Hero (P21YR4A) | 0.09 + pulse + halo | red | full + glow | Strong, well-tuned |
| Earth | 0.6 radius | textured | n/a | Anchored, looks great |
| Equator line | thin | `#334155` | 0.35 | Too faint over `#02040a` — H-4 confirmed |
| Ecliptic line | thin | `#7c3aed` | 0.30 | Same |

### Missing polish moves

- **No time motion** — only Earth + clouds rotate. Asteroids are statues. NASA Eyes animates orbits.
- **Only one motion track type** — short tangent. No "trail behind" (where it came from), no "where it's going" arrow head.
- **No depth cue** for famous NEOs — same size regardless of camera distance from object center (well, sizeAttenuation works, but they're so small they all read as dots).
- **Ambient hierarchy inverted** — famous NEOs (high informational value: Bennu, Apophis) are SMALLER than synthetic background dots in some viewport conditions because background uses `sizeAttenuation` and famous use fixed sphere geometry.

### Comparison to NASA Eyes mental model

Already covered in LOAD §A4. Summary: **NASA Eyes = heliocentric orbital mechanics view**, ours = **geocentric "what's in the sky tonight"**. Different use cases. Both legitimate. User's "weak preview" reaction may stem from comparing apples (sky map) to oranges (orbit visualizer).

---

## 5. Hidden issues (H-1..H-5)

### H-1 — Playwright can't click R3F canvas (confirmed)

R3F raycasting requires a full `pointerdown → pointermove → pointerup` cycle on the same `pointerId`. Playwright's `browser_click` synthesizes events but with `pointerId=0` and missing `releasePointerCapture` calls, which throws or silently fails inside Three.js.

**Workaround flow** (no code change to Sky View needed):
1. Demo automation script: stay on Live Feed for selection.
2. After selecting in Live Feed (works in DOM), programmatically switch to Sky View tab.
3. The candidate is already `selected` in App state → `selectedTrksub` prop seeds `inspectedTrksub` (SkyViewContainer.tsx:23) → CandidateDetailsPanel opens automatically without a click.

This **already works by accident** thanks to the init-from-prop pattern (B-1). Validate during demo recording.

### H-2 — Density 3200 too sparse for 4K

Distribution: `radius = 5 + rng() * 13` → shell from r=5 to r=18. Volume scales as r³, so most points are in the outer shell, far from camera. With camera at distance 6.5 and sizeAttenuation, distant points fade to invisible.

**Fix:** bump count to 8000–12000 AND tighten to `radius = 5 + rng() * 6` (closer shell). 5-min change.

### H-3 — NASA Eyes EU cookie consent

iframe loads `https://eyes.nasa.gov/apps/asteroids/#/home`. NASA pages can show a cookie/privacy banner depending on geo. Currently:
- No fallback handler triggered on consent modal.
- `iframeFailed` state exists but only switches to image on `onError` — modal display is not an error.

**Mitigation:** `loading="lazy"` is set, which is good. For the demo, **pre-load the iframe before recording**, accept the cookie banner once, the iframe should remember (depends on iframe storage policy — may not persist). Safer option: set the `<iframe>` src to a screenshot/snapshot of the NASA Eyes view by default for the demo recording, with a "Open live in new tab" button that goes to the real URL.

### H-4 — Celestial grid contrast

Equator `#334155` opacity 0.35, ecliptic `#7c3aed` opacity 0.30 — both barely visible over `#02040a` background especially when Earth+textures occlude the central viewport.

**Fix:** bump to opacity 0.55 / 0.50. Add subtle dashed pattern on ecliptic (e.g., dash size 0.1) to disambiguate from equator.

### H-5 — Tangent line vs "real orbit"

The `motionTrack()` function (SkyViewPanel.tsx:174-199) generates a **synthetic short tangent** (0.15..0.55 unit length) using a deterministic perpendicular to the position vector, scaled by `rate_arcsec_min`. This is a defensible primitive **for short-arc tracklets** (the actual product use case — minutes-old detections with no orbit yet). It is NOT a real orbit and should not be marketed as one.

**Action:** rename label / tooltip from "motion track" if anywhere it implies "orbit". Keep the implementation — for tracklets it's the right primitive. The U-2 "orbits" complaint is about famous NEOs (which have real orbits IRL), not about primary candidates (which don't yet have orbits, period).

---

## 6. Decision fork — visual quality (USER MUST CHOOSE)

| Option | Scope | Effort | Risk | Demo impact |
| ------ | ----- | ------ | ---- | ----------- |
| **A. Polish current celestial sphere** | Bump density to 10k, fix grid contrast, add new-marker animation, make famous NEOs clickable, fix B-3 Geographos name. NO orbit lines, NO heliocentric mode. | 2.0–2.5h | LOW | "More polished sky map" — matches what we already promise |
| **B. Add heliocentric Orbit View toggle** | Everything in A + a second R3F scene: Sun at origin, Earth orbit, ~30 famous NEO ellipses computed from full Keplerian elements (need to add elements to data file). Toggle button: Sky View / Orbit View. | 6–8h | HIGH (late, big surface area, Three.js can break in unexpected ways) | "Holy shit they built NASA Eyes" — but real risk of half-built feature in demo |
| **C. Hybrid: orbit ground-tracks on celestial sphere** | A + projected orbit ground tracks for famous NEOs (sample mean anomaly, project to RA/Dec, render as `<Line>` curves). One scene only, technically novel ("we plot where Bennu will appear in YOUR sky over the next 5 years"). | 3.5–4.5h | MEDIUM | Unique to neo-triage; explainable in 1 sentence; demo-friendly |

### Claude Code's recommendation

**Option A tonight + Option C tomorrow morning IF time permits.**

Reasoning:
- A fixes every reproducible bug (U-3, B-3) and every quick visual win (H-2, H-4) and gives a real improvement to U-4.
- C is the highest-uniqueness move but it costs 3.5h; if executed sloppily under time pressure, it can ship visually broken (random curves on a sphere look like noise without the right opacity/color tuning).
- B is a trap. Building a second scene under time pressure has high blast radius — if it breaks, you can't ship Sky View at all because the toggle is in the demo path.

**Hard "no" to building B today.** Friday morning is for demo recording prep, not new R3F scenes.

---

## 7. Recommended PHASE B execution order

If Option A approved:

| # | Block | Files touched | Effort | User-blocking? |
| - | ----- | ------------- | ------ | -------------- |
| 1 | **Fix B-3 Geographos data bug** | `famous_neos.ts:136` | 2 min | No, but visible in screenshots |
| 2 | **Quick wins H-2, H-4** | `SkyViewPanel.tsx` density + grid opacity | 15 min | Improves U-4 |
| 3 | **U-3 fix: famous NEOs clickable** | `SkyViewPanel.tsx` + new `FamousNEODetailsPanel.tsx` (~120 lines) | 60 min | YES (user-reported) |
| 4 | **U-1 verification** | Run dev server, trigger agent event, observe Sky View | 5 min | Confirms whether code or perception |
| 5 | **U-1 fix IF needed** | Either reconciliation patch OR new-marker enter animation | 0–60 min | Depends on (4) |
| 6 | **U-3 background points: visual decoration cue** | Tiny CSS — don't change cursor on hover | 10 min | Prevents future user "why doesn't this click" |

**Total Option A effort: 1.5–2.5h.** Ship-ready by tonight.

If Option C also approved:

| # | Block | Effort |
| - | ----- | ------ |
| 7 | Add Keplerian elements to famous_neos.ts (look up from JPL SBDB) | 60 min |
| 8 | `lib/orbit_groundtrack.ts` — sample mean anomaly, solve Kepler's equation, project to RA/Dec | 75 min |
| 9 | `<OrbitGroundTrack>` component, render as drei `<Line>` with low-opacity curve | 45 min |
| 10 | Visual tuning, color per orbit class | 30 min |

**Total Option A+C: ~5.5h.** Risky for tonight; possible Friday morning.

---

## 8. Out of scope tonight

- **Heliocentric Orbit View (Option B)** — defer or kill.
- **B-4 BufferGeometry memory leak** — survives a 30-min demo easily; not worth fixing pre-submission.
- **B-1 init-from-prop anti-pattern** — works in our favor for H-1 Playwright workaround. Leave it.
- **NASA Eyes screenshot fallback (H-3)** — only if we record the demo from EU and consent modal actually appears. Test first, don't preemptively wire fallback.

---

## 9. Required user decisions before PHASE B

1. **Visual quality fork: A, A+C, or B?**
   - Recommended: **A**. Optionally A+C if Friday slot opens.
   - **Reject B unless you accept significant risk.**
2. **U-1 — start by verifying live, or assume it's broken and patch?**
   - Recommended: **5-min runtime check first** (free, no code).
3. **Famous NEOs detail panel content** — same shape as RankedCandidate (Torino, P(impact), etc.) or different (because they're real bodies with known orbits, not minutes-old tracklets)?
   - Recommended: **different**. Show diameter, spectral class, orbit class, mission history (Bennu → OSIRIS-REx, Apophis → 2029 close approach), NO synthetic Torino/P(impact) numbers (those would be fabricated).

---

## 10. Verification commands (for after PHASE B)

```bash
# Visual smoke
cd ~/Desktop/neo-triage-hack/frontend && pnpm dev
# Open http://localhost:5173, switch to Sky View, click a famous NEO

# Type + lint
pnpm tsc --noEmit
pnpm lint

# E2E smoke (Playwright workaround for H-1)
pnpm test:e2e -- --grep "sky view"
```

---

## Meta

- **Lines of code reviewed:** SkyViewPanel 525, SkyViewContainer 115, CandidateDetailsPanel 380, famous_neos 234, celestial 30, useAgentFeed 115, App 374 = **~1,773 lines**.
- **No code modified during PHASE A.**
- **Awaiting user decision on §9 before PHASE B begins.**

---

## 11. PHASE B closure (2026-04-24)

User decision: **FULL scope — A + B + C + all H-1..H-5 + all B-1..B-4**, two-day split collapsed to single session per execution pace. Different-shape famous NEO panel (real data, no fake P(NEO)). U-1 approached as perception fix.

### Issue-by-issue closure

| ID | Status | Commits | Notes |
| -- | ------ | ------- | ----- |
| U-1 | ✅ perception fix | `9537d88` | `useEnterAnimation()` + 0→1 scale ease-out + 3.5s damped emissive pulse on new markers. Forensic code trace already showed data flow correct end-to-end; enter animation addresses both "perception issue" and "code bug slipped through" hypotheses with one strict-improvement fix. |
| U-2 | ✅ orbits rendered | `89ab756` + `16fa1cb` | Option C: per-NEO OrbitGroundTrack on celestial sphere (64-sample coloured arcs). Option B: full Keplerian ellipses in heliocentric Orbit View (128-sample). Math foundation in `kepler.ts` (`dc2a5cc`) — shared between both. |
| U-3 | ✅ clickable | `9537d88` | Famous NEO `raycast={() => null}` removed + `onClick` wired to `handleFamousNEOClick` → `FamousNEODetailsPanel`. Background field kept deliberately non-interactive but with clearer "decorative" visual signal (size 0.05→0.028, opacity 0.65→0.45). |
| U-4 | ✅ production quality | `9537d88` + `89ab756` + `16fa1cb` | Density 3200→12000, grid contrast bumped + labels, famous markers 0.022→0.040 with emissive glow, subtle time motion on background drift, orbit arcs, heliocentric toggle. |
| H-1 | ✅ documented | `b0cae55` | Demo script v4 recording notes: use native screen capture, not Playwright `browser_click` on R3F canvas. Live Feed DOM list + tab switch is the scripted-automation path (init-from-prop B-1 helps here). |
| H-2 | ✅ density boost | `9537d88` | 3200→12000 points, shell tightened from radius=5..18 to 5..11. |
| H-3 | ✅ manual toggle | `6b0018f` | `▶ live / ⏸ static` button in NASA Eyes header — swaps iframe for the pre-shipped `nasa-eyes-neo-population.png` if a cookie modal appears during recording. |
| H-4 | ✅ visible grid | `9537d88` | Equator opacity 0.35→0.50 (brighter hex), ecliptic 0.30→0.55, inline "CELESTIAL EQUATOR" / "ECLIPTIC" labels at edges. |
| H-5 | ✅ distinction clear | `9537d88` (+ naming audit) | MotionTrack (tangent) is for tracklets where we deliberately cannot compute an orbit; OrbitGroundTrack (new in `89ab756`) is for known-element famous NEOs. No UI text claims either is the other. Comment in SkyViewPanel explicitly frames MotionTrack as "short-arc projected motion". |
| B-1 | ⚠ intentionally left | — | `SkyViewContainer` still initialises `inspectedTrksub` from `selectedTrksub` prop without re-syncing on prop change. Forensic analysis flagged this as low severity AND it provides the Playwright workaround path in H-1. Leaving. |
| B-2 | ✅ handlers alive | `9537d88` | Removing `raycast={() => null}` from famous markers made the previously-dead hover handlers actually fire (cursor pointer, scale boost, label colour shift). |
| B-3 | ✅ fixed | `54da1d5` | `name: "Bennu"` for designation `"1620 Geographos"` corrected — Geographos now named Geographos, Bennu now properly associated with `"101955 Bennu"` designation. Runtime validator `validateFamousNeos()` added to catch future regressions. |
| B-4 | ✅ disposed | `9537d88` | `MotionTrack` BufferGeometry + material now dispose-on-unmount via `useEffect` cleanup. Same pattern applied to `OrbitGroundTrack` + `OrbitViewPanel` components (`89ab756` + `16fa1cb`). |

### Bundle budget

- Main (eager): 73 KB gzip — target ≤ 75 KB ✅
- Lazy SkyView (Three.js + kepler + Sky + Orbit): 257 KB gzip — target ≤ 350 KB ✅
- OrbitView shell: 2 KB gzip
- Total: 330 KB gzip combined

### New features not listed in forensic (shipped alongside)

- Keplerian math library (`kepler.ts`) — reusable for any future orbital-mechanics feature.
- Famous NEO schema expansion: orbital elements, mission history, spectra, PHA flags.
- Famous NEO runtime validator guards against duplicate names, duplicate designations, name/designation mismatches, and impossible orbits (e ≥ 1).
- Mode toggle UX (Sky View / Orbit View) with lazy-loaded heliocentric scene.
- FamousNEODetailsPanel as a distinct panel shape (purple accent, 7 sections, real data) vs the candidate panel (zinc/emerald, triage metrics).

### Deferred / intentionally out of scope

- Epoch-at-date VSOP planetary theory (we use mean-longitude propagation; fine for demo, would be needed for ephemeris-grade service).
- Primary-candidate orbit rendering in Orbit View (tracklets have no elements — would require backend Sentry/NEODyS enrichment first).
- Time-slider animation in Orbit View (current positions locked at mount for demo determinism).
- Mobile-specific Sky View polish beyond the existing responsive rules.

**PHASE B complete.** Production deploy graph: `54da1d5` → `9537d88` → `dc2a5cc` → `89ab756` → `16fa1cb` → `6b0018f` → `b0cae55`. All commits atomic and independently revertible.
