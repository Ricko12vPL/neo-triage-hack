/**
 * Keplerian orbital mechanics for visualisation-grade precision.
 *
 * Two scenes consume this library:
 *   - OrbitGroundTrack (SkyViewPanel) — projects a NEO's path to RA/Dec
 *     as seen from Earth over a time span. Solves Option C from the
 *     forensic report.
 *   - OrbitViewPanel (Option B) — needs heliocentric XYZ positions for
 *     the Sun-centred scene with planet orbits.
 *
 * Algorithms per Meeus "Astronomical Algorithms" 2nd ed., Ch. 30 + 33.
 * Tolerances are loose: this is a demo, not Horizons. Expect ~0.5° sky
 * error for well-behaved (e < 0.7) orbits vs proper ephemerides.
 *
 * Reference frame: heliocentric ecliptic J2000 (right-handed, +X toward
 * vernal equinox, +Z toward ecliptic north pole). RA/Dec output is
 * equatorial J2000, obtained by rotating about X by the obliquity.
 */

export const J2000_JD = 2451545.0;
/** Obliquity of the ecliptic at J2000 (deg). IAU 2006 value. */
export const OBLIQUITY_DEG = 23.4392811;
/** Earth's mean orbital rate (deg/day), near-Newcomb. */
const EARTH_MEAN_MOTION_DEG_PER_DAY = 0.9856474;
/** Mean longitude of Earth at J2000 (deg). */
const EARTH_MEAN_LONGITUDE_J2000_DEG = 100.46435;
/** Longitude of perihelion of Earth (deg), roughly constant at demo precision. */
const EARTH_LON_PERIHELION_DEG = 102.94719;
/** Earth's orbital eccentricity (mean, J2000). */
const EARTH_ECCENTRICITY = 0.01671022;

export interface OrbitalElements {
  semi_major_axis_au: number;
  eccentricity: number;
  inclination_deg: number;
  longitude_ascending_node_deg: number;
  argument_periapsis_deg: number;
  /**
   * Mean anomaly (degrees) at the reference epoch. The reference epoch is
   * J2000 (JD 2451545.0) unless `epoch_jd` is passed to the propagation
   * function. Current-epoch elements give dramatically better sky
   * accuracy than hand-propagated J2000 elements for well-studied NEOs
   * with many orbital revolutions since 2000.
   */
  mean_anomaly_deg_epoch: number;
  orbital_period_years: number;
}

export interface RADec {
  ra_deg: number;
  dec_deg: number;
}

export type Vec3 = [number, number, number];

function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}
function rad2deg(r: number): number {
  return (r * 180) / Math.PI;
}

/**
 * Convert a JavaScript Date to Julian Date (UT1-approximating — good to
 * sub-second for non-astrometric purposes).
 */
export function dateToJD(date: Date): number {
  return date.getTime() / 86_400_000 + 2440587.5;
}

export function currentJD(): number {
  return dateToJD(new Date());
}

/**
 * Solve Kepler's equation M = E - e·sin(E) for E.
 *
 * Newton-Raphson with Meeus-style initial guess. Converges in ~5
 * iterations for e<0.7, ~15 for e<0.95. For e≥1 (parabolic/hyperbolic)
 * this function is undefined — callers must guard.
 *
 * @param mean_anomaly_rad Mean anomaly M (radians, any sign)
 * @param eccentricity 0 ≤ e < 1
 * @param tol Stop when |ΔE| < tol (default 1e-10)
 * @param max_iter Safety cap (default 60)
 * @returns Eccentric anomaly E (radians, in (-π, π])
 */
export function solveKeplersEquation(
  mean_anomaly_rad: number,
  eccentricity: number,
  tol: number = 1e-10,
  max_iter: number = 60,
): number {
  // Normalize M into [-π, π] for numerical hygiene.
  let M = mean_anomaly_rad % (2 * Math.PI);
  if (M > Math.PI) M -= 2 * Math.PI;
  if (M < -Math.PI) M += 2 * Math.PI;

  // Initial guess (Meeus 30.7).
  let E = M + eccentricity * Math.sin(M);

  for (let i = 0; i < max_iter; i++) {
    const f = E - eccentricity * Math.sin(E) - M;
    const fp = 1 - eccentricity * Math.cos(E);
    const dE = f / fp;
    E -= dE;
    if (Math.abs(dE) < tol) return E;
  }
  return E; // best-effort — demo-grade
}

/** E (eccentric anomaly) → ν (true anomaly), both radians. */
export function eccentricToTrueAnomaly(
  E_rad: number,
  eccentricity: number,
): number {
  const cosE = Math.cos(E_rad);
  const sinE = Math.sin(E_rad);
  const cos_nu = (cosE - eccentricity) / (1 - eccentricity * cosE);
  const sin_nu =
    (Math.sqrt(1 - eccentricity * eccentricity) * sinE) /
    (1 - eccentricity * cosE);
  return Math.atan2(sin_nu, cos_nu);
}

/**
 * Position in the heliocentric ecliptic J2000 frame from Keplerian
 * elements at a specific true anomaly. Output in AU.
 */
export function orbitalElementsToHeliocentricXYZ(
  a_au: number,
  e: number,
  i_rad: number,
  Omega_rad: number,
  omega_rad: number,
  nu_rad: number,
): Vec3 {
  // In-plane coordinates (focus at origin, periapsis along +x_orb).
  const cos_nu = Math.cos(nu_rad);
  const sin_nu = Math.sin(nu_rad);
  const r = (a_au * (1 - e * e)) / (1 + e * cos_nu);
  const x_orb = r * cos_nu;
  const y_orb = r * sin_nu;

  const cosO = Math.cos(Omega_rad);
  const sinO = Math.sin(Omega_rad);
  const cosw = Math.cos(omega_rad);
  const sinw = Math.sin(omega_rad);
  const cosi = Math.cos(i_rad);
  const sini = Math.sin(i_rad);

  // 3-1-3 Euler rotation Rz(-Ω) · Rx(-i) · Rz(-ω) applied to (x_orb, y_orb, 0).
  const x =
    (cosO * cosw - sinO * sinw * cosi) * x_orb +
    (-cosO * sinw - sinO * cosw * cosi) * y_orb;
  const y =
    (sinO * cosw + cosO * sinw * cosi) * x_orb +
    (-sinO * sinw + cosO * cosw * cosi) * y_orb;
  const z = sinw * sini * x_orb + cosw * sini * y_orb;

  return [x, y, z];
}

/**
 * Heliocentric ecliptic position of a body with the given elements at a
 * specific Julian date.
 *
 * @param epoch_jd Epoch at which `elements.mean_anomaly_deg_epoch` is
 *   valid. Defaults to J2000 (JD 2451545.0) for historical callers, but
 *   any current-epoch source (e.g. Horizons "today") is strongly preferred
 *   when available — J2000 propagation accumulates sky error at ~0.1°/yr
 *   for typical NEOs, more for chaotic orbits.
 */
export function heliocentricPositionAtJD(
  elements: OrbitalElements,
  jd: number,
  epoch_jd: number = J2000_JD,
): Vec3 {
  const P_days = elements.orbital_period_years * 365.25;
  const n_deg_per_day = 360 / P_days;
  const dt = jd - epoch_jd;
  const M_deg = elements.mean_anomaly_deg_epoch + n_deg_per_day * dt;
  const M_rad = deg2rad(M_deg);
  const E = solveKeplersEquation(M_rad, elements.eccentricity);
  const nu = eccentricToTrueAnomaly(E, elements.eccentricity);
  return orbitalElementsToHeliocentricXYZ(
    elements.semi_major_axis_au,
    elements.eccentricity,
    deg2rad(elements.inclination_deg),
    deg2rad(elements.longitude_ascending_node_deg),
    deg2rad(elements.argument_periapsis_deg),
    nu,
  );
}

/**
 * Earth's heliocentric ecliptic position at JD. Uses a mean-elements
 * approximation good to ~0.01 AU for the range of dates demos cover.
 */
export function earthHeliocentricAtJD(jd: number): Vec3 {
  const dt = jd - J2000_JD;
  const L_deg = EARTH_MEAN_LONGITUDE_J2000_DEG + EARTH_MEAN_MOTION_DEG_PER_DAY * dt;
  const M_deg = L_deg - EARTH_LON_PERIHELION_DEG;
  const M_rad = deg2rad(M_deg);
  const E = solveKeplersEquation(M_rad, EARTH_ECCENTRICITY);
  const nu = eccentricToTrueAnomaly(E, EARTH_ECCENTRICITY);
  // Earth's argument of perihelion relative to equinox (deg).
  const omega_earth_rad = deg2rad(EARTH_LON_PERIHELION_DEG);
  return orbitalElementsToHeliocentricXYZ(
    1.000_001_018, // AU
    EARTH_ECCENTRICITY,
    0, // inclination ~0 by definition of ecliptic
    0,
    omega_earth_rad,
    nu,
  );
}

/**
 * Geocentric equatorial RA/Dec from heliocentric ecliptic position.
 * Ignores parallax from Earth's ~6378 km radius (negligible for
 * visualization).
 */
export function heliocentricToGeocentricCelestialSphere(
  body_helio_ec: Vec3,
  earth_helio_ec: Vec3,
): RADec {
  // Vector from Earth to body, still in ecliptic coords.
  const dx = body_helio_ec[0] - earth_helio_ec[0];
  const dy = body_helio_ec[1] - earth_helio_ec[1];
  const dz = body_helio_ec[2] - earth_helio_ec[2];

  // Rotate from ecliptic to equatorial about X-axis by +ε.
  const eps = deg2rad(OBLIQUITY_DEG);
  const x_eq = dx;
  const y_eq = dy * Math.cos(eps) - dz * Math.sin(eps);
  const z_eq = dy * Math.sin(eps) + dz * Math.cos(eps);

  const r = Math.sqrt(x_eq * x_eq + y_eq * y_eq + z_eq * z_eq);
  const dec_rad = Math.asin(z_eq / r);
  let ra_rad = Math.atan2(y_eq, x_eq);
  if (ra_rad < 0) ra_rad += 2 * Math.PI;

  return {
    ra_deg: rad2deg(ra_rad),
    dec_deg: rad2deg(dec_rad),
  };
}

/**
 * Sample an object's apparent ground track on the geocentric celestial
 * sphere over a time span.
 *
 * @param elements Target body's Keplerian elements
 * @param samples Number of points to emit (uniform time spacing)
 * @param startJD Julian date of first sample (default = now)
 * @param spanDays Total duration (default = one orbital period, capped
 *        to 2x Earth year so very long-period bodies don't wrap too
 *        many times into a tangled curve)
 */
export function orbitGroundTrack(
  elements: OrbitalElements,
  samples: number = 64,
  startJD: number = currentJD(),
  spanDays?: number,
  epoch_jd: number = J2000_JD,
): RADec[] {
  const period_days = elements.orbital_period_years * 365.25;
  const span = spanDays ?? Math.min(period_days, 730); // ≤ 2 yr
  const track: RADec[] = [];
  for (let k = 0; k < samples; k++) {
    const jd = startJD + (span * k) / (samples - 1);
    const helio = heliocentricPositionAtJD(elements, jd, epoch_jd);
    const earth = earthHeliocentricAtJD(jd);
    track.push(heliocentricToGeocentricCelestialSphere(helio, earth));
  }
  return track;
}

/**
 * Sample an object's full heliocentric orbit (one complete period) as
 * XYZ vectors — for rendering the static ellipse in the Orbit View
 * scene.
 */
export function orbitEllipsePoints(
  elements: OrbitalElements,
  samples: number = 128,
): Vec3[] {
  const i = deg2rad(elements.inclination_deg);
  const Omega = deg2rad(elements.longitude_ascending_node_deg);
  const omega = deg2rad(elements.argument_periapsis_deg);
  const e = elements.eccentricity;
  const a = elements.semi_major_axis_au;

  const pts: Vec3[] = [];
  for (let k = 0; k < samples; k++) {
    const nu = (2 * Math.PI * k) / (samples - 1);
    pts.push(orbitalElementsToHeliocentricXYZ(a, e, i, Omega, omega, nu));
  }
  return pts;
}
