const DEG = Math.PI / 180;
const MIN_ALT_DEG = 20; // practical observing floor

export interface VisibilityResult {
  status: "visible_now" | "rises_later" | "sets_soon" | "below_horizon";
  altitude_deg_now: number;
  rise_utc: Date | null;
  set_utc: Date | null;
  max_altitude_deg_tonight: number;
  best_observing_time_utc: Date | null;
}

// Meeus Ch.12 — Julian Day Number from UTC Date
function julianDay(date: Date): number {
  let y = date.getUTCFullYear();
  let m = date.getUTCMonth() + 1;
  const d =
    date.getUTCDate() +
    (date.getUTCHours() +
      date.getUTCMinutes() / 60 +
      date.getUTCSeconds() / 3600) /
      24;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

// GMST in degrees at given Julian Day (Meeus simplified)
function gmstDeg(jd: number): number {
  const T = (jd - 2451545.0) / 36525.0;
  const gmst =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * T * T -
    (T * T * T) / 38710000.0;
  return ((gmst % 360) + 360) % 360;
}

export function computeAltitude_deg(
  ra_deg: number,
  dec_deg: number,
  latitude_deg: number,
  longitude_deg: number,
  date: Date,
): number {
  const jd = julianDay(date);
  const lst_deg = ((gmstDeg(jd) + longitude_deg) % 360 + 360) % 360;
  let ha_deg = ((lst_deg - ra_deg) % 360 + 360) % 360;
  if (ha_deg > 180) ha_deg -= 360; // map to -180..180
  const ha_rad = ha_deg * DEG;
  const lat_rad = latitude_deg * DEG;
  const dec_rad = dec_deg * DEG;
  const alt_rad = Math.asin(
    Math.sin(dec_rad) * Math.sin(lat_rad) +
      Math.cos(dec_rad) * Math.cos(lat_rad) * Math.cos(ha_rad),
  );
  return alt_rad / DEG;
}

export function computeVisibilityTonight(
  ra_deg: number,
  dec_deg: number,
  latitude_deg: number,
  longitude_deg: number,
  now_utc: Date,
): VisibilityResult {
  const STEP_MS = 15 * 60 * 1000; // 15 min
  const WINDOW_MS = 12 * 60 * 60 * 1000; // 12 h
  const SETS_SOON_MS = 2 * 60 * 60 * 1000; // 2 h warning

  const altNow = computeAltitude_deg(ra_deg, dec_deg, latitude_deg, longitude_deg, now_utc);

  let rise_utc: Date | null = null;
  let set_utc: Date | null = null;
  let maxAlt = altNow;
  let bestTime: Date | null = altNow >= MIN_ALT_DEG ? now_utc : null;

  let prevAlt = altNow;
  for (let dt = STEP_MS; dt <= WINDOW_MS; dt += STEP_MS) {
    const t = new Date(now_utc.getTime() + dt);
    const alt = computeAltitude_deg(ra_deg, dec_deg, latitude_deg, longitude_deg, t);

    if (alt > maxAlt) {
      maxAlt = alt;
      bestTime = t;
    }

    // Interpolate crossing
    if (prevAlt < MIN_ALT_DEG && alt >= MIN_ALT_DEG && rise_utc === null) {
      // linear interp
      const frac = (MIN_ALT_DEG - prevAlt) / (alt - prevAlt);
      rise_utc = new Date(now_utc.getTime() + dt - STEP_MS + frac * STEP_MS);
    }
    if (prevAlt >= MIN_ALT_DEG && alt < MIN_ALT_DEG && set_utc === null) {
      const frac = (MIN_ALT_DEG - prevAlt) / (alt - prevAlt);
      set_utc = new Date(now_utc.getTime() + dt - STEP_MS + frac * STEP_MS);
    }

    prevAlt = alt;
  }

  let status: VisibilityResult["status"];
  if (altNow >= MIN_ALT_DEG) {
    if (set_utc !== null && set_utc.getTime() - now_utc.getTime() < SETS_SOON_MS) {
      status = "sets_soon";
    } else {
      status = "visible_now";
    }
  } else if (rise_utc !== null) {
    status = "rises_later";
  } else {
    status = "below_horizon";
  }

  return {
    status,
    altitude_deg_now: altNow,
    rise_utc,
    set_utc,
    max_altitude_deg_tonight: maxAlt,
    best_observing_time_utc: bestTime,
  };
}

export function formatUtcTime(date: Date | null): string {
  if (!date) return "—";
  return date.toUTCString().slice(17, 22) + " UTC";
}
