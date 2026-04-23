/**
 * Celestial-sphere coordinate math.
 *
 * Converts (RA, Dec) in degrees to a unit vector on a sphere of given
 * radius. The convention here is "Earth at origin, observer looking at the
 * inside of the sphere" — i.e., the sphere is a projection of the night
 * sky onto a ball surrounding Earth. Handedness chosen so the standard
 * Three.js camera (looking down -Z by default) sees RA=0 on the right.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function radec_to_xyz(
  ra_deg: number,
  dec_deg: number,
  radius: number,
): Vec3 {
  const ra_rad = (ra_deg * Math.PI) / 180;
  const dec_rad = (dec_deg * Math.PI) / 180;
  const cos_dec = Math.cos(dec_rad);
  return {
    x: radius * cos_dec * Math.cos(ra_rad),
    y: radius * Math.sin(dec_rad),
    z: -radius * cos_dec * Math.sin(ra_rad),
  };
}
