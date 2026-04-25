import { useMemo } from "react";

/**
 * Impact-corridor visualization on an Equirectangular Earth projection.
 *
 * Lives inside PopulationRiskPanel. Honest about what it represents:
 * for famous-NEO targets (P21YR4A demo) we draw a YR4-style equatorial
 * corridor band based on the publicly published ESA NEOCC visualisation
 * (Feb 2025). For arbitrary candidates we just render the damage circle
 * at the hypothetical impact point.
 *
 * No real continent outlines — instead we use the top-50-cities point
 * cloud + 30° lat/lon grid as the spatial backdrop. Cleaner at the 320px
 * panel size than a topojson rasterisation, and doesn't need an extra
 * client-side dependency.
 *
 * Reference (corridor shape): ESA NEOCC, "Asteroid 2024 YR4 no longer
 * poses significant impact risk", Feb 2025
 *   https://www.esa.int/Space_Safety/Planetary_Defence/Asteroid_2024_YR4_no_longer_poses_significant_impact_risk
 */

interface City {
  name: string;
  latitude_deg: number;
  longitude_deg: number;
  metro_population: number;
}

// Mirror of backend top-50 (subset — only the 30 largest fit comfortably
// at 320×160 px). Coordinates from Wikipedia 2023 figures.
const CITIES: City[] = [
  { name: "Tokyo", latitude_deg: 35.68, longitude_deg: 139.65, metro_population: 37_400_000 },
  { name: "Delhi", latitude_deg: 28.7, longitude_deg: 77.1, metro_population: 32_900_000 },
  { name: "Shanghai", latitude_deg: 31.23, longitude_deg: 121.47, metro_population: 28_500_000 },
  { name: "Dhaka", latitude_deg: 23.81, longitude_deg: 90.41, metro_population: 22_500_000 },
  { name: "Sao Paulo", latitude_deg: -23.55, longitude_deg: -46.63, metro_population: 22_600_000 },
  { name: "Mexico City", latitude_deg: 19.43, longitude_deg: -99.13, metro_population: 22_500_000 },
  { name: "Cairo", latitude_deg: 30.04, longitude_deg: 31.24, metro_population: 22_200_000 },
  { name: "Beijing", latitude_deg: 39.9, longitude_deg: 116.41, metro_population: 21_500_000 },
  { name: "Mumbai", latitude_deg: 19.08, longitude_deg: 72.88, metro_population: 21_400_000 },
  { name: "Osaka", latitude_deg: 34.69, longitude_deg: 135.5, metro_population: 19_000_000 },
  { name: "New York", latitude_deg: 40.71, longitude_deg: -74.01, metro_population: 18_800_000 },
  { name: "Karachi", latitude_deg: 24.86, longitude_deg: 67.0, metro_population: 16_900_000 },
  { name: "Buenos Aires", latitude_deg: -34.6, longitude_deg: -58.38, metro_population: 15_400_000 },
  { name: "Istanbul", latitude_deg: 41.01, longitude_deg: 28.98, metro_population: 15_500_000 },
  { name: "Manila", latitude_deg: 14.6, longitude_deg: 120.98, metro_population: 14_400_000 },
  { name: "Lagos", latitude_deg: 6.52, longitude_deg: 3.38, metro_population: 14_400_000 },
  { name: "Kinshasa", latitude_deg: -4.44, longitude_deg: 15.27, metro_population: 14_300_000 },
  { name: "Rio de Janeiro", latitude_deg: -22.91, longitude_deg: -43.17, metro_population: 13_500_000 },
  { name: "Los Angeles", latitude_deg: 34.05, longitude_deg: -118.24, metro_population: 13_200_000 },
  { name: "Moscow", latitude_deg: 55.76, longitude_deg: 37.62, metro_population: 12_500_000 },
  { name: "Bangalore", latitude_deg: 12.97, longitude_deg: 77.59, metro_population: 12_300_000 },
  { name: "Paris", latitude_deg: 48.86, longitude_deg: 2.35, metro_population: 11_000_000 },
  { name: "Lima", latitude_deg: -12.05, longitude_deg: -77.04, metro_population: 10_700_000 },
  { name: "Bangkok", latitude_deg: 13.76, longitude_deg: 100.5, metro_population: 10_500_000 },
  { name: "Jakarta", latitude_deg: -6.21, longitude_deg: 106.85, metro_population: 10_600_000 },
  { name: "Seoul", latitude_deg: 37.57, longitude_deg: 126.98, metro_population: 9_700_000 },
  { name: "London", latitude_deg: 51.51, longitude_deg: -0.13, metro_population: 9_500_000 },
  { name: "Tehran", latitude_deg: 35.69, longitude_deg: 51.39, metro_population: 9_000_000 },
  { name: "Chicago", latitude_deg: 41.88, longitude_deg: -87.63, metro_population: 8_900_000 },
  { name: "Sydney", latitude_deg: -33.87, longitude_deg: 151.21, metro_population: 5_400_000 },
];

const W = 360;
const H = 180;

interface Props {
  impactLatitudeDeg: number;
  impactLongitudeDeg: number;
  damageRadiusKm: number;
  showYR4Corridor?: boolean;
}

function project(lat: number, lon: number): [number, number] {
  // Equirectangular: x = (lon + 180) / 360 * W, y = (90 - lat) / 180 * H
  const x = ((lon + 180) / 360) * W;
  const y = ((90 - lat) / 180) * H;
  return [x, y];
}

function radiusKmToDegLat(km: number): number {
  return km / 111.0;
}

export function ImpactCorridor2D({
  impactLatitudeDeg,
  impactLongitudeDeg,
  damageRadiusKm,
  showYR4Corridor = false,
}: Props) {
  const [impactX, impactY] = useMemo(
    () => project(impactLatitudeDeg, impactLongitudeDeg),
    [impactLatitudeDeg, impactLongitudeDeg],
  );
  const damageRadiusPx = useMemo(() => {
    // Convert km → degrees of latitude → pixel y-units.
    const degLat = radiusKmToDegLat(damageRadiusKm);
    return (degLat / 180) * H;
  }, [damageRadiusKm]);

  const gridLatLines = [-60, -30, 0, 30, 60];
  const gridLonLines = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];

  return (
    <div>
      <div className="rounded border border-orange-900/40 bg-amber-950/15 px-2 py-1 text-[9px] uppercase tracking-wider text-amber-300/90">
        ⚠ Hypothetical corridor — actual computation requires full orbit determination (Phase 2)
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1.5 w-full overflow-visible rounded border border-zinc-800 bg-slate-950"
        role="img"
        aria-label="Impact corridor on Earth"
      >
        {/* Ocean background gradient */}
        <defs>
          <linearGradient id="oceanGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#020617" />
          </linearGradient>
          <radialGradient id="corridorFade">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.65" />
            <stop offset="60%" stopColor="#f97316" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#oceanGradient)" />

        {/* Lat/lon grid */}
        {gridLatLines.map((lat) => {
          const [, y] = project(lat, 0);
          return (
            <line
              key={`lat${lat}`}
              x1={0}
              x2={W}
              y1={y}
              y2={y}
              stroke="#1e293b"
              strokeWidth={lat === 0 ? 0.6 : 0.3}
              strokeDasharray={lat === 0 ? "0" : "1.5 1.5"}
            />
          );
        })}
        {gridLonLines.map((lon) => {
          const [x] = project(0, lon);
          return (
            <line
              key={`lon${lon}`}
              x1={x}
              x2={x}
              y1={0}
              y2={H}
              stroke="#1e293b"
              strokeWidth={lon === 0 ? 0.6 : 0.3}
              strokeDasharray={lon === 0 ? "0" : "1.5 1.5"}
            />
          );
        })}

        {/* YR4-style equatorial corridor band (when showYR4Corridor=true).
            Based on ESA NEOCC publication: corridor stretched ~300° in
            longitude across the equatorial belt (S America → Africa →
            S Asia → Pacific). Rendered as a translucent rectangle that
            we soften with the radial fade gradient. */}
        {showYR4Corridor && (
          <g opacity={0.6}>
            <ellipse
              cx={W / 2}
              cy={H / 2}
              rx={W * 0.45}
              ry={H * 0.13}
              fill="url(#corridorFade)"
              stroke="#f97316"
              strokeOpacity={0.45}
              strokeWidth={0.6}
              strokeDasharray="2 1.5"
            />
          </g>
        )}

        {/* City dots — size by log10(population) */}
        {CITIES.map((c) => {
          const [x, y] = project(c.latitude_deg, c.longitude_deg);
          const size = 0.4 + Math.log10(c.metro_population / 1_000_000) * 1.2;
          return (
            <circle
              key={c.name}
              cx={x}
              cy={y}
              r={Math.max(size, 0.6)}
              fill="#94a3b8"
              opacity={0.65}
            >
              <title>
                {c.name} · {(c.metro_population / 1e6).toFixed(1)}M
              </title>
            </circle>
          );
        })}

        {/* Damage circle at impact point */}
        <circle
          cx={impactX}
          cy={impactY}
          r={Math.max(damageRadiusPx, 1.5)}
          fill="#dc2626"
          fillOpacity={0.25}
          stroke="#fca5a5"
          strokeWidth={0.8}
          strokeDasharray="2 1"
        />
        <circle cx={impactX} cy={impactY} r={1.2} fill="#fca5a5" />
        <text
          x={impactX + 4}
          y={impactY - 3}
          className="fill-red-300 font-mono text-[6px] uppercase tracking-wider"
        >
          impact
        </text>

        {/* Equator + prime meridian labels */}
        <text
          x={2}
          y={H / 2 - 1}
          className="fill-zinc-500 font-mono text-[5px] uppercase"
        >
          eq
        </text>
        <text
          x={W / 2 + 2}
          y={6}
          className="fill-zinc-500 font-mono text-[5px] uppercase"
        >
          0°
        </text>
      </svg>
      <p className="mt-1.5 text-[9px] leading-relaxed text-zinc-500">
        Equirectangular projection · top-30 metro markers (size ∝ log
        population). Damage circle from Collins et al. 2017 5-psi scaling.
        {showYR4Corridor && (
          <>
            {" "}
            Corridor band based on{" "}
            <a
              href="https://www.esa.int/Space_Safety/Planetary_Defence/Asteroid_2024_YR4_no_longer_poses_significant_impact_risk"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:text-emerald-300"
            >
              ESA NEOCC YR4 publication ↗
            </a>
            ; production = Find_Orb b-plane Monte Carlo.
          </>
        )}
      </p>
    </div>
  );
}
