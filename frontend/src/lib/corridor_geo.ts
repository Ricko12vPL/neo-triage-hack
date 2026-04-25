/**
 * Geometry helpers for the Imminent Impactors corridor projection.
 *
 * Equirectangular projection on a 1000×500 viewBox is fine for the
 * global-scale narrative we render (whole-Earth corridor band). Distance
 * calculations use the haversine formula for accuracy at any latitude.
 */

import type { CorridorVertex } from "../api/types";

export const VIEWBOX_W = 1000;
export const VIEWBOX_H = 500;
const EARTH_RADIUS_KM = 6371.0;

export interface ProjectedPoint {
  x: number;
  y: number;
}

/** Equirectangular projection over the full 1000×500 viewBox. */
export function projectLatLon(lat_deg: number, lon_deg: number): ProjectedPoint {
  return {
    x: ((lon_deg + 180) / 360) * VIEWBOX_W,
    y: ((90 - lat_deg) / 180) * VIEWBOX_H,
  };
}

/**
 * Great-circle distance between two lat/lon points in kilometres.
 * Used to decide which cities sit "within the risk corridor" — the
 * answer is operationally a max-distance-to-any-vertex check, not a
 * point-in-polygon test (the corridor is a sampled polyline, not a
 * closed region).
 */
export function haversineKm(
  lat1_deg: number,
  lon1_deg: number,
  lat2_deg: number,
  lon2_deg: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2_deg - lat1_deg);
  const dLon = toRad(lon2_deg - lon1_deg);
  const lat1 = toRad(lat1_deg);
  const lat2 = toRad(lat2_deg);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Minimum great-circle distance (km) from a point to any vertex along
 * a polyline. Linear in vertex count, fine for the 11-vertex YR4
 * corridor. Returns Infinity for empty polylines.
 */
export function minDistanceKmToPolyline(
  lat_deg: number,
  lon_deg: number,
  polyline: CorridorVertex[],
): number {
  if (polyline.length === 0) return Number.POSITIVE_INFINITY;
  let best = Number.POSITIVE_INFINITY;
  for (const v of polyline) {
    const d = haversineKm(lat_deg, lon_deg, v.lat_deg, v.lon_deg);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Build SVG `d` for a corridor polyline. Naive line-segment join in
 * projected viewBox space — fine for our use case because none of the
 * 6 catalog cases cross the antimeridian.
 */
export function corridorPathD(polyline: CorridorVertex[]): string {
  if (polyline.length === 0) return "";
  const first = projectLatLon(polyline[0].lat_deg, polyline[0].lon_deg);
  let d = `M${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
  for (let i = 1; i < polyline.length; i++) {
    const p = projectLatLon(polyline[i].lat_deg, polyline[i].lon_deg);
    d += `L${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }
  return d;
}
