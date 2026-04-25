/**
 * Convert a GeoJSON Polygon / MultiPolygon geometry into an SVG path
 * `d` string under a caller-supplied projection.
 *
 * GeoJSON spec stores coordinates as `[lon, lat]` (longitude first).
 * The projection callback receives `(lat, lon)` in that order, matching
 * the rest of the codebase, and returns viewBox-space `{x, y}`.
 *
 * Other geometry types (LineString, Point, etc.) are not used for the
 * country-outline GeoJSON we ship and return an empty string.
 */

type LonLat = [number, number];
type Ring = LonLat[];
type Polygon = Ring[];

export type Project = (lat: number, lon: number) => { x: number; y: number };

interface Geometry {
  type: string;
  coordinates: unknown;
}

function ringToPath(ring: Ring, project: Project): string {
  if (ring.length === 0) return "";
  const first = project(ring[0][1], ring[0][0]);
  let d = `M${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
  for (let i = 1; i < ring.length; i++) {
    const p = project(ring[i][1], ring[i][0]);
    d += `L${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }
  d += "Z";
  return d;
}

function polygonToPath(polygon: Polygon, project: Project): string {
  return polygon.map((ring) => ringToPath(ring, project)).join("");
}

export function geometryToSvgPath(geometry: Geometry, project: Project): string {
  if (!geometry || typeof geometry !== "object") return "";
  if (geometry.type === "Polygon") {
    return polygonToPath(geometry.coordinates as Polygon, project);
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as Polygon[])
      .map((poly) => polygonToPath(poly, project))
      .join("");
  }
  return "";
}
