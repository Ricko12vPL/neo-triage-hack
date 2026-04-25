import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { geometryToSvgPath, type Project } from "../lib/geojson_to_svg";
import { TOP_CITIES, type City } from "../lib/world_cities";

/**
 * Impact-corridor visualization on an Equirectangular Earth projection.
 *
 * Lives inside PopulationRiskPanel. Renders four layers:
 *   1. Ocean background + lat/lon graticule (always)
 *   2. Country outlines from Natural Earth 1:110m public-domain GeoJSON
 *      (loaded once on mount from /data/world-countries-110m.json)
 *   3. Optional YR4-style corridor band (showYR4Corridor=true)
 *   4. Damage circle at the impact hypothesis lat/lon
 *   5. Top-30 metro population dots (size ∝ log population)
 *
 * Operator interaction: mouse-wheel zoom (1× → 8×), click-and-drag pan,
 * reset button, scale-bar updates with zoom. Hover any city dot →
 * tooltip with name + country + metro pop + coordinates.
 *
 * Honest disclosure: the YR4-style corridor remains marked as
 * HYPOTHETICAL — Phase 2 = Find_Orb b-plane Monte Carlo. The continent
 * outlines are 110m resolution (~110 km accuracy) — not suitable for
 * deep zoom but coherent at the global scale we operate at.
 *
 * GeoJSON source: Natural Earth Public Domain
 *   https://www.naturalearthdata.com/
 *   ne_110m_admin_0_countries.json (stripped + simplified to ~55 KB gzip)
 */

interface City1 extends City {}

const VIEWBOX_W = 1000;
const VIEWBOX_H = 500;
const ZOOM_MIN = 1;
const ZOOM_MAX = 8;

interface CountriesGeoJSON {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: string; coordinates: unknown };
    properties: { NAME?: string };
  }>;
}

let cachedCountries: CountriesGeoJSON | null = null;

/** Equirectangular projection over the full 1000×500 viewBox. */
const project: Project = (lat, lon) => ({
  x: ((lon + 180) / 360) * VIEWBOX_W,
  y: ((90 - lat) / 180) * VIEWBOX_H,
});

function radiusKmToViewboxUnits(km: number): number {
  // 1° latitude ≈ 111 km. 180° latitude → VIEWBOX_H units.
  // Convert km → degrees latitude → viewBox units.
  return (km / 111.0 / 180) * VIEWBOX_H;
}

interface Props {
  impactLatitudeDeg: number;
  impactLongitudeDeg: number;
  damageRadiusKm: number;
  showYR4Corridor?: boolean;
}

export function ImpactCorridor2D({
  impactLatitudeDeg,
  impactLongitudeDeg,
  damageRadiusKm,
  showYR4Corridor = false,
}: Props) {
  const [countries, setCountries] = useState<CountriesGeoJSON | null>(
    cachedCountries,
  );
  const [countriesError, setCountriesError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [tooltip, setTooltip] = useState<
    { city: City1; x: number; y: number } | null
  >(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);

  // Load GeoJSON once per browser session.
  useEffect(() => {
    if (cachedCountries) {
      setCountries(cachedCountries);
      return;
    }
    let cancelled = false;
    fetch("/data/world-countries-110m.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: CountriesGeoJSON) => {
        if (cancelled) return;
        cachedCountries = data;
        setCountries(data);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.warn("[ImpactCorridor2D] world GeoJSON load failed:", err);
        setCountriesError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [impactX, impactY] = useMemo(() => {
    const p = project(impactLatitudeDeg, impactLongitudeDeg);
    return [p.x, p.y];
  }, [impactLatitudeDeg, impactLongitudeDeg]);

  const damageRadiusUnits = useMemo(
    () => Math.max(radiusKmToViewboxUnits(damageRadiusKm), 4),
    [damageRadiusKm],
  );

  // Country paths memoised over the GeoJSON load — pure function of input.
  const countryPaths = useMemo(() => {
    if (!countries) return [];
    return countries.features.map((feature) => ({
      name: feature.properties.NAME ?? "",
      d: geometryToSvgPath(feature.geometry, project),
    }));
  }, [countries]);

  const handleWheel = useCallback((e: WheelEvent) => {
    if (!svgRef.current) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.85 : 1.15;
    setZoom((z) => {
      const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z * factor));
      return next;
    });
  }, []);

  // Native non-passive wheel listener so preventDefault works.
  useEffect(() => {
    const node = svgRef.current;
    if (!node) return;
    node.addEventListener("wheel", handleWheel, { passive: false });
    return () => node.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
    setTooltip(null);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    // Pan is in viewBox units. Convert client pixels → viewBox units via
    // SVG bounding rect.
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scaleX = VIEWBOX_W / rect.width;
    const scaleY = VIEWBOX_H / rect.height;
    setPan({
      x: drag.startPanX + dx * scaleX,
      y: drag.startPanY + dy * scaleY,
    });
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragStateRef.current?.pointerId !== e.pointerId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragStateRef.current = null;
  };

  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleCityEnter = (city: City1, e: React.PointerEvent<SVGCircleElement>) => {
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    setTooltip({
      city,
      x: e.clientX - containerRect.left,
      y: e.clientY - containerRect.top,
    });
  };

  const handleCityLeave = () => setTooltip(null);

  const gridLatLines = [-60, -30, 0, 30, 60];
  const gridLonLines = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];

  // Scale bar: at zoom=1, 1000 viewBox units span 360° at equator ≈ 40000 km.
  // 100 viewBox units → 4000 km / zoom.
  const scaleKmPer100 = 4000 / zoom;
  const scaleLabel =
    scaleKmPer100 >= 1000
      ? `${(scaleKmPer100 / 1000).toFixed(1)}k km`
      : `${Math.round(scaleKmPer100)} km`;

  return (
    <div ref={containerRef} className="relative">
      {/* Banner stays at top — replaced by per-corridor banner in BLOCK_2/3. */}
      <div className="rounded border border-orange-900/40 bg-amber-950/15 px-2 py-1 text-[9px] uppercase tracking-wider text-amber-300/90">
        ⚠ Hypothetical corridor — actual computation requires full orbit determination (Phase 2)
      </div>

      <div className="relative mt-1.5">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
          className="w-full select-none rounded border border-zinc-800 bg-slate-950"
          role="img"
          aria-label="Impact corridor on Earth — Equirectangular projection"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            cursor: dragStateRef.current ? "grabbing" : "grab",
          }}
        >
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
            <clipPath id="mapClip">
              <rect width={VIEWBOX_W} height={VIEWBOX_H} />
            </clipPath>
          </defs>

          {/* Ocean background — never transformed. */}
          <rect width={VIEWBOX_W} height={VIEWBOX_H} fill="url(#oceanGradient)" />

          {/* Pan/zoom group (graticule + countries + corridor + cities + damage). */}
          <g
            clipPath="url(#mapClip)"
            transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}
          >
            {/* Graticule */}
            {gridLatLines.map((lat) => {
              const y = project(lat, 0).y;
              return (
                <line
                  key={`lat${lat}`}
                  x1={0}
                  x2={VIEWBOX_W}
                  y1={y}
                  y2={y}
                  stroke="#1e293b"
                  strokeWidth={lat === 0 ? 1.6 : 0.8}
                  strokeDasharray={lat === 0 ? "0" : "4 4"}
                />
              );
            })}
            {gridLonLines.map((lon) => {
              const x = project(0, lon).x;
              return (
                <line
                  key={`lon${lon}`}
                  x1={x}
                  x2={x}
                  y1={0}
                  y2={VIEWBOX_H}
                  stroke="#1e293b"
                  strokeWidth={lon === 0 ? 1.6 : 0.8}
                  strokeDasharray={lon === 0 ? "0" : "4 4"}
                />
              );
            })}

            {/* Country polygons */}
            {countryPaths.map((c) => (
              <path
                key={c.name}
                d={c.d}
                fill="#1e293b"
                stroke="#334155"
                strokeWidth={0.6 / zoom}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {/* YR4-style equatorial corridor band */}
            {showYR4Corridor && (
              <g opacity={0.6}>
                <ellipse
                  cx={VIEWBOX_W / 2}
                  cy={VIEWBOX_H / 2}
                  rx={VIEWBOX_W * 0.45}
                  ry={VIEWBOX_H * 0.13}
                  fill="url(#corridorFade)"
                  stroke="#f97316"
                  strokeOpacity={0.45}
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )}

            {/* Damage circle at impact hypothesis */}
            <circle
              cx={impactX}
              cy={impactY}
              r={damageRadiusUnits}
              fill="#dc2626"
              fillOpacity={0.25}
              stroke="#fca5a5"
              strokeWidth={2}
              strokeDasharray="6 3"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={impactX}
              cy={impactY}
              r={3.5}
              fill="#fca5a5"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={impactX + 8}
              y={impactY - 6}
              className="fill-red-300 font-mono uppercase tracking-wider"
              fontSize={14}
              style={{ fontSize: 14 / zoom + "px" }}
            >
              impact
            </text>

            {/* City dots */}
            {TOP_CITIES.map((c) => {
              const { x, y } = project(c.latitude_deg, c.longitude_deg);
              const r = Math.max(
                2,
                1.2 + Math.log10(c.metro_population / 1_000_000) * 2.4,
              );
              return (
                <circle
                  key={c.name}
                  cx={x}
                  cy={y}
                  r={r}
                  fill="#94a3b8"
                  opacity={0.75}
                  stroke="#cbd5e1"
                  strokeWidth={0.5 / zoom}
                  vectorEffect="non-scaling-stroke"
                  onPointerEnter={(e) => handleCityEnter(c, e)}
                  onPointerLeave={handleCityLeave}
                  onPointerMove={(e) => handleCityEnter(c, e)}
                  style={{ cursor: "pointer" }}
                />
              );
            })}
          </g>

          {/* HUD layer — never transformed */}
          <g aria-hidden>
            {/* Compass — top-right */}
            <g transform={`translate(${VIEWBOX_W - 30} 24)`}>
              <circle r={11} fill="#0f172a" stroke="#334155" strokeWidth={1} />
              <text
                x={0}
                y={3}
                textAnchor="middle"
                className="fill-zinc-300 font-mono"
                fontSize={11}
                fontWeight={600}
              >
                N
              </text>
              <line x1={0} y1={-7} x2={0} y2={-13} stroke="#fca5a5" strokeWidth={1.2} />
            </g>

            {/* Equator + prime meridian labels */}
            <text
              x={4}
              y={VIEWBOX_H / 2 - 4}
              className="fill-zinc-500 font-mono uppercase"
              fontSize={11}
            >
              eq
            </text>
            <text
              x={VIEWBOX_W / 2 + 4}
              y={14}
              className="fill-zinc-500 font-mono uppercase"
              fontSize={11}
            >
              0°
            </text>

            {/* Scale bar — bottom-left */}
            <g transform={`translate(20 ${VIEWBOX_H - 24})`}>
              <line x1={0} y1={0} x2={100} y2={0} stroke="#cbd5e1" strokeWidth={2} />
              <line x1={0} y1={-4} x2={0} y2={4} stroke="#cbd5e1" strokeWidth={2} />
              <line x1={100} y1={-4} x2={100} y2={4} stroke="#cbd5e1" strokeWidth={2} />
              <text
                x={0}
                y={-7}
                className="fill-zinc-300 font-mono"
                fontSize={11}
              >
                {scaleLabel}
              </text>
            </g>
          </g>
        </svg>

        {/* HUD overlay (HTML — for crisp text + clickable reset) */}
        <div className="pointer-events-none absolute inset-0 flex items-start justify-start p-2">
          <div className="pointer-events-auto flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-950/85 px-1.5 py-1 font-mono text-[9px] uppercase tracking-wider text-zinc-400">
            <span>zoom</span>
            <span className="text-zinc-200">{zoom.toFixed(1)}×</span>
            <button
              type="button"
              onClick={reset}
              disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
              className="ml-1 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Reset map view"
            >
              reset
            </button>
          </div>
        </div>

        {/* City tooltip (sibling DOM, positioned via mouse coordinates). */}
        {tooltip && (
          <CityTooltip
            city={tooltip.city}
            x={tooltip.x}
            y={tooltip.y}
            container={containerRef.current}
          />
        )}
      </div>

      <p className="mt-1.5 text-[9px] leading-relaxed text-zinc-500">
        Equirectangular projection · continent outlines from{" "}
        <a
          href="https://www.naturalearthdata.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-400 underline-offset-2 hover:text-zinc-300 hover:underline"
        >
          Natural Earth (1:110m, public domain)
        </a>
        {countriesError && (
          <span className="ml-1 text-rose-400">(continent data unavailable)</span>
        )}{" "}
        · top-30 metro markers (size ∝ log population). Damage circle from
        Collins et al. 2017 5-psi scaling.{" "}
        {showYR4Corridor && (
          <>
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

interface CityTooltipProps {
  city: City1;
  x: number;
  y: number;
  container: HTMLDivElement | null;
}

/** Simple absolute-positioned tooltip — keeps inside container bounds. */
function CityTooltip({ city, x, y, container }: CityTooltipProps) {
  const containerWidth = container?.clientWidth ?? 320;
  const TOOLTIP_W = 180;
  const TOOLTIP_H = 60;
  const left =
    x + TOOLTIP_W + 12 > containerWidth ? Math.max(0, x - TOOLTIP_W - 12) : x + 12;
  const top = Math.max(0, y - TOOLTIP_H - 6);
  const style: CSSProperties = { left, top };
  return (
    <div
      className="pointer-events-none absolute z-10 w-[180px] rounded border border-zinc-700 bg-zinc-950/95 px-2 py-1 font-mono text-[10px] leading-snug shadow-lg"
      style={style}
      role="tooltip"
    >
      <div className="text-zinc-100">
        {city.name}
        <span className="ml-1 text-zinc-400">· {city.country}</span>
      </div>
      <div className="text-zinc-400">
        {(city.metro_population / 1e6).toFixed(1)}M metro population
      </div>
      <div className="text-zinc-500">
        {city.latitude_deg.toFixed(1)}°, {city.longitude_deg.toFixed(1)}°
      </div>
    </div>
  );
}
