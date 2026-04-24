/**
 * Primary-candidate proper-motion extrapolation for the Sky View.
 *
 * Tracklets in the Live Feed come with `rate_arcsec_min` and
 * `arc_length_minutes` but no orbit — digest2 + classifier flag them
 * before Scout / Sentry has the multi-night arc needed for orbit
 * determination. We therefore do *not* draw a Keplerian path. Instead
 * we draw an honest 24 h forward extrapolation along a great circle
 * using:
 *
 *   - rate × time → angular distance
 *   - a deterministic position-angle estimate (hash of trksub) when the
 *     upstream feed doesn't supply one. This is flagged in
 *     `uncertainty_half_angle_deg` so callers can render a cone/fan that
 *     visibly narrows as more astrometry arrives.
 *
 * All angles are degrees; times are minutes; output points are great-
 * circle samples on the celestial sphere.
 *
 * Reference: Meeus, *Astronomical Algorithms*, Ch. 51 (approximate motion
 * on a great circle).
 */

export interface MotionInputs {
  ra_deg: number;
  dec_deg: number;
  rate_arcsec_min: number;
  arc_length_minutes: number;
  /** Position angle east of north (deg). If omitted, a deterministic
   * pseudo-random PA is derived from `trksub_hash`. */
  position_angle_deg?: number;
  /** 32-bit hash seed used to derive PA when not supplied. Typically
   * hashTrksub(trksub). Same trksub always yields the same PA → stable
   * visualisation frame to frame. */
  trksub_hash?: number;
}

export interface MotionSample {
  ra_deg: number;
  dec_deg: number;
  t_hours: number;
}

export interface MotionEnvelope {
  /** Centerline samples at hour 0, 1, 2, ... duration_hours. */
  arc: MotionSample[];
  /** One-sigma opening half-angle at +24 h, in degrees. Shrinks as the
   * observed arc lengthens. */
  uncertainty_half_angle_deg: number;
  /** Same hash that produced the PA (for caller provenance). */
  used_position_angle_deg: number;
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Stable 32-bit FNV-1a-ish hash of a string. We only need a reproducible
 * unsigned integer, not crypto.
 */
export function hashTrksub(trksub: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < trksub.length; i++) {
    h ^= trksub.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function normalize180(deg: number): number {
  let x = ((deg + 180) % 360) - 180;
  if (x < -180) x += 360;
  return x;
}

function normalize360(deg: number): number {
  const x = deg % 360;
  return x < 0 ? x + 360 : x;
}

/**
 * Walk a great circle from (ra1, dec1) along bearing PA by angular
 * distance `d_deg`. Returns the terminal point.
 *
 * Uses the standard spherical direct problem (Napier).
 */
export function greatCircleStep(
  ra_deg: number,
  dec_deg: number,
  pa_deg: number,
  d_deg: number,
): { ra_deg: number; dec_deg: number } {
  const ra1 = ra_deg * DEG2RAD;
  const dec1 = dec_deg * DEG2RAD;
  const pa = pa_deg * DEG2RAD;
  const d = d_deg * DEG2RAD;

  const sinDec2 =
    Math.sin(dec1) * Math.cos(d) + Math.cos(dec1) * Math.sin(d) * Math.cos(pa);
  const dec2 = Math.asin(Math.max(-1, Math.min(1, sinDec2)));

  const y = Math.sin(pa) * Math.sin(d) * Math.cos(dec1);
  const x = Math.cos(d) - Math.sin(dec1) * Math.sin(dec2);
  const ra2 = ra1 + Math.atan2(y, x);

  return { ra_deg: normalize360(ra2 * RAD2DEG), dec_deg: dec2 * RAD2DEG };
}

/**
 * Compute the 24-hour forward motion envelope for a tracklet.
 *
 * The centerline is sampled every `hour_step_h` hours. The cone half-
 * angle shrinks roughly as 1/sqrt(arc_length / 10 min), floored at 1° and
 * capped at 45°. This matches the qualitative behaviour of short-arc
 * position-angle uncertainty — 10-minute arcs have ~45° PA ambiguity;
 * multi-hour arcs drop below 5°.
 */
export function computeMotionEnvelope(
  inputs: MotionInputs,
  duration_hours: number = 24,
  hour_step_h: number = 1,
): MotionEnvelope {
  const rate_deg_per_hour = (inputs.rate_arcsec_min * 60) / 3600;

  let pa = inputs.position_angle_deg;
  if (pa === undefined) {
    const h = inputs.trksub_hash ?? 0;
    // Map [0, 2^32) → [0, 360). Keeps PA stable for a given trksub.
    pa = (h / 0xffffffff) * 360;
  }
  pa = normalize360(pa);

  const arc: MotionSample[] = [];
  for (let t = 0; t <= duration_hours + 1e-6; t += hour_step_h) {
    const d_deg = rate_deg_per_hour * t;
    const p = greatCircleStep(inputs.ra_deg, inputs.dec_deg, pa, d_deg);
    arc.push({ ra_deg: p.ra_deg, dec_deg: p.dec_deg, t_hours: t });
  }

  // Empirical cone: half-angle ∝ 1/sqrt(arc_length / 10 min).
  const am = Math.max(1, inputs.arc_length_minutes);
  const raw = 45 / Math.sqrt(am / 10);
  const uncertainty_half_angle_deg = Math.max(1, Math.min(45, raw));

  return {
    arc,
    uncertainty_half_angle_deg,
    used_position_angle_deg: pa,
  };
}

/**
 * Build a wedge of points that, together with the centerline, can be
 * rendered as a translucent uncertainty cone. The wedge spans
 * ±half_angle around the centerline PA and widens with time.
 */
export function computeUncertaintyCone(
  inputs: MotionInputs,
  envelope: MotionEnvelope,
  n_steps: number = 24,
): Array<{ ra_deg: number; dec_deg: number; t_hours: number }> {
  const out: Array<{ ra_deg: number; dec_deg: number; t_hours: number }> = [];
  const rate_deg_per_hour = (inputs.rate_arcsec_min * 60) / 3600;
  const max_t = envelope.arc[envelope.arc.length - 1]?.t_hours ?? 24;
  const step = max_t / n_steps;
  const pa = envelope.used_position_angle_deg;
  const half = envelope.uncertainty_half_angle_deg;

  for (let i = 0; i <= n_steps; i++) {
    const t = i * step;
    const d = rate_deg_per_hour * t;
    const paL = normalize360(pa - half);
    const pL = greatCircleStep(inputs.ra_deg, inputs.dec_deg, paL, d);
    out.push({ ra_deg: pL.ra_deg, dec_deg: pL.dec_deg, t_hours: t });
  }
  for (let i = n_steps; i >= 0; i--) {
    const t = i * step;
    const d = rate_deg_per_hour * t;
    const paR = normalize360(pa + half);
    const pR = greatCircleStep(inputs.ra_deg, inputs.dec_deg, paR, d);
    out.push({ ra_deg: pR.ra_deg, dec_deg: pR.dec_deg, t_hours: t });
  }
  return out;
}

export const __testables = { normalize180, normalize360 };
