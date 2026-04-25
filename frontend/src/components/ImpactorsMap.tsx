import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type {
  CorridorVertex,
  ImminentImpactorCase,
  ImminentImpactorsSummary,
} from "../api/types";
import { geometryToSvgPath, type Project } from "../lib/geojson_to_svg";
import {
  VIEWBOX_H,
  VIEWBOX_W,
  corridorPathD,
  minDistanceKmToPolyline,
  projectLatLon,
} from "../lib/corridor_geo";
import { TOP_CITIES, type City } from "../lib/world_cities";

/**
 * ImpactorsMap — dedicated map for the IMPACTORS tab.
 *
 * Differs from ImpactCorridor2D (which lives inside PopulationRiskPanel
 * and renders the demo's hypothetical Manila zone): this component
 * renders the full Imminent Impactors Library — six historically
 * verified pre-impact predictions — as a single panel that is the
 * centrepiece of the new tab.
 *
 * Layers (back-to-front):
 *   1. Ocean background + lat/lon graticule
 *   2. Country outlines (Natural Earth 1:110m)
 *   3. Real published 2024 YR4 risk corridor polyline + ±200 km band
 *      (only when a corridor case is selected)
 *   4. Top-30 metros — amber if within 500 km of selected corridor,
 *      slate otherwise
 *   5. One marker per case in the 6-case catalog:
 *        IMPACTED → red ◉ at impact_lat/lon, pulse animation
 *        CLEARED  → dashed gray ⊗ at corridor centroid (YR4-only)
 *
 * Selecting a marker is the canonical interaction: it highlights the
 * marker, zooms the viewBox, and emits onCaseSelect upward to drive the
 * library panel.
 *
 * Honest disclosure: the YR4 corridor polyline reproduces ESA NEOCC's
 * February 2025 published risk band. Each impact marker carries a
 * tooltip naming the published source. No invented coordinates.
 */

const ZOOM_MIN = 1;
const ZOOM_MAX = 8;
const CITY_HIGHLIGHT_KM = 500;

interface CountriesGeoJSON {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: string; coordinates: unknown };
    properties: { NAME?: string };
  }>;
}

let cachedCountries: CountriesGeoJSON | null = null;

const project: Project = (lat, lon) => projectLatLon(lat, lon);

export interface ImpactorsMapProps {
  cases: ImminentImpactorsSummary[];
  selectedDesignation: string | null;
  /** Full case detail for the selected designation, when known.
   *  Required to render the YR4 corridor polyline. */
  selectedCase: ImminentImpactorCase | null;
  onCaseSelect: (designation: string) => void;
}

interface Tooltip {
  kind: "city" | "case";
  label: string;
  sub: string;
  x: number;
  y: number;
}

export function ImpactorsMap({
  cases,
  selectedDesignation,
  selectedCase,
  onCaseSelect,
}: ImpactorsMapProps) {
  const [countries, setCountries] = useState<CountriesGeoJSON | null>(
    cachedCountries,
  );
  const [countriesError, setCountriesError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
    moved: boolean;
  } | null>(null);

  // Load Natural Earth GeoJSON once per session.
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
      .catch(() => {
        if (cancelled) return;
        setCountriesError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const countryPaths = useMemo(() => {
    if (!countries) return [];
    return countries.features.map((feature) => ({
      name: feature.properties.NAME ?? "",
      d: geometryToSvgPath(feature.geometry, project),
    }));
  }, [countries]);

  const corridorPolyline: CorridorVertex[] | null =
    selectedCase?.corridor_polyline ?? null;
  const corridorD = useMemo(
    () => (corridorPolyline ? corridorPathD(corridorPolyline) : ""),
    [corridorPolyline],
  );

  const cityHighlightSet = useMemo(() => {
    if (!corridorPolyline) return new Set<string>();
    const s = new Set<string>();
    for (const c of TOP_CITIES) {
      const dKm = minDistanceKmToPolyline(
        c.latitude_deg,
        c.longitude_deg,
        corridorPolyline,
      );
      if (dKm <= CITY_HIGHLIGHT_KM) s.add(c.name);
    }
    return s;
  }, [corridorPolyline]);

  // Wheel zoom — non-passive so preventDefault works.
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!svgRef.current) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.85 : 1.15;
    setZoom((z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z * factor)));
  }, []);

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
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
    setPan({ x: drag.startPanX + dx, y: drag.startPanY + dy });
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragStateRef.current = null;
  };

  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Auto-zoom on selection: pan the marker to the centre at 2× zoom
  // for IMPACTED cases (single point), 1× for CLEARED with corridor
  // (need to see the whole band).
  useEffect(() => {
    if (!selectedCase) return;
    if (
      selectedCase.case_type === "IMPACTED" &&
      selectedCase.impact_lat_deg != null &&
      selectedCase.impact_lon_deg != null
    ) {
      const target = projectLatLon(
        selectedCase.impact_lat_deg,
        selectedCase.impact_lon_deg,
      );
      const newZoom = 2.4;
      // Centre target in the viewBox.
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;
      const sx = containerRect.width / VIEWBOX_W;
      const sy = containerRect.height / VIEWBOX_H;
      setZoom(newZoom);
      setPan({
        x: containerRect.width / 2 - target.x * sx * newZoom,
        y: containerRect.height / 2 - target.y * sy * newZoom,
      });
    } else {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDesignation]);

  const handleCaseClick = (
    designation: string,
    e: React.MouseEvent | React.PointerEvent,
  ) => {
    if (dragStateRef.current?.moved) return;
    e.stopPropagation();
    onCaseSelect(designation);
  };

  const onCityEnter = (
    c: City,
    e: React.PointerEvent<SVGCircleElement>,
  ) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      kind: "city",
      label: `${c.name} · ${c.country}`,
      sub: `${(c.metro_population / 1e6).toFixed(1)}M metro`,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const onCaseEnter = (
    summary: ImminentImpactorsSummary,
    e: React.PointerEvent<SVGGElement>,
  ) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const subParts: string[] = [];
    if (summary.case_type === "CLEARED") subParts.push("CLEARED");
    if (summary.has_meteorite_recovery) subParts.push("meteorite recovery");
    subParts.push(`${summary.diameter_m.toFixed(1)} m`);
    setTooltip({
      kind: "case",
      label: summary.designation,
      sub: subParts.join(" · "),
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const clearTooltip = () => setTooltip(null);

  const containerStyle: CSSProperties = {
    backgroundColor: "#0f172a",
    aspectRatio: `${VIEWBOX_W} / ${VIEWBOX_H}`,
    minHeight: 280,
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded border border-zinc-800"
      style={containerStyle}
      onPointerLeave={clearTooltip}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        className="h-full w-full select-none touch-none"
        style={{ cursor: dragStateRef.current ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <g
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {/* Ocean */}
          <rect width={VIEWBOX_W} height={VIEWBOX_H} fill="#0c1322" />

          {/* Graticule every 30 degrees */}
          <g stroke="#1e293b" strokeWidth={0.5}>
            {[-60, -30, 0, 30, 60].map((lat) => {
              const { y } = projectLatLon(lat, 0);
              return <line key={`p${lat}`} x1={0} x2={VIEWBOX_W} y1={y} y2={y} />;
            })}
            {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lon) => {
              const { x } = projectLatLon(0, lon);
              return <line key={`m${lon}`} x1={x} x2={x} y1={0} y2={VIEWBOX_H} />;
            })}
            {/* Equator (emphasis) */}
            <line
              x1={0}
              x2={VIEWBOX_W}
              y1={projectLatLon(0, 0).y}
              y2={projectLatLon(0, 0).y}
              stroke="#334155"
              strokeWidth={0.8}
            />
          </g>

          {/* Country outlines */}
          {countries && (
            <g
              fill="#1e293b"
              stroke="#334155"
              strokeWidth={0.4}
              vectorEffect="non-scaling-stroke"
            >
              {countryPaths.map((c) => (
                <path key={c.name} d={c.d} />
              ))}
            </g>
          )}

          {countriesError && (
            <text
              x={VIEWBOX_W / 2}
              y={VIEWBOX_H / 2}
              fill="#64748b"
              fontSize={14}
              textAnchor="middle"
            >
              [continent outlines unavailable — markers and corridor still
              shown]
            </text>
          )}

          {/* Real corridor polyline + uncertainty band */}
          {corridorPolyline && corridorD && (
            <g>
              <path
                d={corridorD}
                stroke="#fb923c"
                strokeWidth={6}
                strokeOpacity={0.18}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                vectorEffect="non-scaling-stroke"
                style={{ filter: "blur(2px)" }}
              />
              <path
                d={corridorD}
                stroke="#f87171"
                strokeWidth={2.5}
                strokeOpacity={0.85}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
              {/* Vertex labels */}
              {corridorPolyline.map((v, i) => {
                const p = projectLatLon(v.lat_deg, v.lon_deg);
                return (
                  <circle
                    key={`v${i}`}
                    cx={p.x}
                    cy={p.y}
                    r={2.5}
                    fill="#f87171"
                    fillOpacity={0.9}
                  />
                );
              })}
            </g>
          )}

          {/* Cities */}
          <g>
            {TOP_CITIES.map((c) => {
              const p = projectLatLon(c.latitude_deg, c.longitude_deg);
              const inCorridor = cityHighlightSet.has(c.name);
              return (
                <circle
                  key={c.name}
                  cx={p.x}
                  cy={p.y}
                  r={inCorridor ? 3.2 : 2.0}
                  fill={inCorridor ? "#fbbf24" : "#94a3b8"}
                  fillOpacity={inCorridor ? 0.95 : 0.55}
                  stroke={inCorridor ? "#fde68a" : "transparent"}
                  strokeWidth={inCorridor ? 0.6 : 0}
                  vectorEffect="non-scaling-stroke"
                  style={{ cursor: "pointer" }}
                  onPointerEnter={(e) => onCityEnter(c, e)}
                  onPointerMove={(e) => onCityEnter(c, e)}
                  onPointerLeave={clearTooltip}
                />
              );
            })}
          </g>

          {/* Case markers */}
          <g>
            {cases.map((summary) => {
              const isSelected = summary.designation === selectedDesignation;

              if (summary.case_type === "CLEARED") {
                // CLEARED case has no impact lat/lon — anchor marker at
                // the corridor centroid (geometric mean of polyline vertices).
                if (!summary.has_corridor_polyline || !corridorPolyline)
                  return null;
                let sx = 0;
                let sy = 0;
                for (const v of corridorPolyline) {
                  const p = projectLatLon(v.lat_deg, v.lon_deg);
                  sx += p.x;
                  sy += p.y;
                }
                const cx = sx / corridorPolyline.length;
                const cy = sy / corridorPolyline.length;
                return (
                  <g
                    key={summary.designation}
                    onPointerEnter={(e) => onCaseEnter(summary, e)}
                    onPointerLeave={clearTooltip}
                    onClick={(e) => handleCaseClick(summary.designation, e)}
                    style={{ cursor: "pointer" }}
                  >
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isSelected ? 14 : 10}
                      fill="none"
                      stroke="#34d399"
                      strokeWidth={1.5}
                      strokeDasharray="3 2"
                      vectorEffect="non-scaling-stroke"
                    />
                    <text
                      x={cx}
                      y={cy + 4}
                      fill="#a7f3d0"
                      fontSize={12}
                      fontWeight={700}
                      textAnchor="middle"
                    >
                      ✓
                    </text>
                  </g>
                );
              }

              if (
                summary.impact_lat_deg == null ||
                summary.impact_lon_deg == null
              ) {
                return null;
              }
              const p = projectLatLon(
                summary.impact_lat_deg,
                summary.impact_lon_deg,
              );
              return (
                <g
                  key={summary.designation}
                  onPointerEnter={(e) => onCaseEnter(summary, e)}
                  onPointerLeave={clearTooltip}
                  onClick={(e) => handleCaseClick(summary.designation, e)}
                  style={{ cursor: "pointer" }}
                >
                  {/* outer pulse */}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isSelected ? 11 : 7}
                    fill="#dc2626"
                    fillOpacity={0.18}
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isSelected ? 5.5 : 4}
                    fill="#ef4444"
                    stroke="#fecaca"
                    strokeWidth={isSelected ? 1 : 0.6}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {/* HUD overlay */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-2 top-2 flex items-center gap-2 rounded border border-zinc-700/50 bg-zinc-900/80 px-2 py-1 font-mono text-[10px] text-zinc-300">
          <span>ZOOM {zoom.toFixed(1)}×</span>
          <button
            type="button"
            onClick={reset}
            className="pointer-events-auto rounded border border-zinc-700 bg-zinc-800/80 px-1.5 py-0 text-[9px] uppercase tracking-wider hover:bg-zinc-700"
          >
            RESET
          </button>
        </div>

        {selectedCase?.case_type === "CLEARED" && (
          <div className="absolute right-2 top-2 max-w-[60%] rounded border border-emerald-700/50 bg-emerald-950/70 px-2 py-1 font-mono text-[10px] text-emerald-200">
            ✓ CLEARED {selectedCase.cleared_date} ·{" "}
            <span className="text-emerald-300/80">
              {selectedCase.cleared_by}
            </span>
          </div>
        )}
        {selectedCase?.case_type === "IMPACTED" && (
          <div className="absolute right-2 top-2 max-w-[60%] rounded border border-rose-700/50 bg-rose-950/70 px-2 py-1 font-mono text-[10px] text-rose-200">
            IMPACT · {selectedCase.impact_location_name ?? "—"}
          </div>
        )}

        <div className="absolute bottom-2 left-2 rounded border border-zinc-700/50 bg-zinc-900/80 px-2 py-1 font-mono text-[9px] text-zinc-400">
          continent outlines · Natural Earth (1:110m, public domain)
        </div>

        {tooltip && (
          <div
            className="pointer-events-none absolute rounded border border-zinc-700/70 bg-zinc-900/95 px-2 py-1 font-mono text-[10px] text-zinc-100 shadow-lg"
            style={{
              left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth ?? 0) - 220),
              top: Math.max(tooltip.y - 32, 4),
            }}
          >
            <div className="font-semibold">{tooltip.label}</div>
            <div className="text-[9px] text-zinc-400">{tooltip.sub}</div>
          </div>
        )}
      </div>
    </div>
  );
}
