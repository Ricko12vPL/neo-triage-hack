import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { CloseApproach } from "../api/types";

/**
 * Horizontal close-approach timeline. Each Earth close approach for an
 * object is rendered as a dot positioned by year, sized inversely by
 * miss distance, and colored by closeness band:
 *
 *   < 0.0001 au (≤ 1.5 LD) red    — Apophis 2029 lives here
 *   < 0.001  au (≤ 15  LD) amber
 *   < 0.01   au (≤ 150 LD) yellow
 *   ≥ 0.01   au            sky
 *
 * "Today" is a vertical line. Apophis 2029 (the most famous close
 * approach of this generation) is intentionally readable at a glance —
 * the panel feels familiar to anyone who has used cneos.jpl.nasa.gov.
 */

interface Props {
  designation: string;
}

const AU_KM = 149_597_870.7;
const LD_KM = 384_400; // mean lunar distance

function bandColor(distAu: number): { fill: string; stroke: string } {
  if (distAu < 0.0001) return { fill: "fill-red-500", stroke: "stroke-red-300" };
  if (distAu < 0.001) return { fill: "fill-amber-400", stroke: "stroke-amber-200" };
  if (distAu < 0.01) return { fill: "fill-yellow-300", stroke: "stroke-yellow-200" };
  return { fill: "fill-sky-400", stroke: "stroke-sky-200" };
}

function formatDistance(distAu: number): string {
  const km = distAu * AU_KM;
  const ld = km / LD_KM;
  if (ld < 5) return `${distAu.toFixed(6)} au · ${(km / 1000).toFixed(0)}k km · ${ld.toFixed(2)} LD`;
  if (distAu < 0.01)
    return `${distAu.toFixed(5)} au · ${(km / 1e6).toFixed(2)}M km · ${ld.toFixed(1)} LD`;
  return `${distAu.toFixed(3)} au · ${(km / 1e6).toFixed(1)}M km · ${ld.toFixed(0)} LD`;
}

function calendarYear(cd: string): number {
  // 'YYYY-MMM-DD HH:MM' → number
  const m = cd.match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : 2000;
}

export function CloseApproachTimeline({ designation }: Props) {
  const [approaches, setApproaches] = useState<CloseApproach[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CloseApproach | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setApproaches(null);
    setSelected(null);
    api
      .jplCadApproaches(designation, 100)
      .then((rows) => {
        if (!cancelled) setApproaches(rows);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [designation]);

  const { yearMin, yearMax, todayYear } = useMemo(() => {
    const today = new Date();
    const todayY = today.getUTCFullYear() + (today.getUTCMonth() + 1) / 12;
    const years = (approaches ?? []).map((a) => calendarYear(a.calendar_date));
    const min = years.length ? Math.min(todayY - 50, ...years) : todayY - 50;
    const max = years.length ? Math.max(todayY + 50, ...years) : todayY + 50;
    return { yearMin: min, yearMax: max, todayYear: todayY };
  }, [approaches]);

  if (loading) {
    return (
      <div className="rounded border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[10px] text-zinc-500">
        <span className="animate-pulse">Pulling JPL CAD close-approach history…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-200">
        ⚠ JPL CAD unreachable: {error}
      </div>
    );
  }

  if (!approaches || approaches.length === 0) {
    return (
      <div className="rounded border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[10px] text-zinc-500">
        No Earth close approaches in JPL CAD for ±50 years (dist&nbsp;&lt;&nbsp;0.2 au).
      </div>
    );
  }

  const padX = 18;
  const w = 320;
  const h = 70;
  const trackY = 38;
  const span = Math.max(yearMax - yearMin, 1);

  const xForYear = (y: number) => padX + ((y - yearMin) / span) * (w - 2 * padX);
  const radiusForDist = (d: number) => {
    if (d < 0.0001) return 6;
    if (d < 0.001) return 4.5;
    if (d < 0.01) return 3.5;
    return 2.5;
  };

  const ticks: number[] = [];
  const tickStride = span >= 80 ? 25 : 10;
  const startTick = Math.ceil(yearMin / tickStride) * tickStride;
  for (let y = startTick; y <= yearMax; y += tickStride) ticks.push(y);

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full overflow-visible"
        role="img"
        aria-label={`Close approach timeline for ${designation}`}
      >
        {/* Track line */}
        <line
          x1={padX}
          x2={w - padX}
          y1={trackY}
          y2={trackY}
          className="stroke-zinc-700"
          strokeWidth={1}
        />
        {/* Tick marks */}
        {ticks.map((y) => (
          <g key={y}>
            <line
              x1={xForYear(y)}
              x2={xForYear(y)}
              y1={trackY - 3}
              y2={trackY + 3}
              className="stroke-zinc-600"
              strokeWidth={0.75}
            />
            <text
              x={xForYear(y)}
              y={trackY + 14}
              textAnchor="middle"
              className="fill-zinc-500 font-mono text-[7px]"
            >
              {y}
            </text>
          </g>
        ))}
        {/* Today marker */}
        <line
          x1={xForYear(todayYear)}
          x2={xForYear(todayYear)}
          y1={trackY - 18}
          y2={trackY + 6}
          className="stroke-emerald-500"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
        <text
          x={xForYear(todayYear)}
          y={trackY - 21}
          textAnchor="middle"
          className="fill-emerald-400 font-mono text-[7px] uppercase"
        >
          today
        </text>
        {/* Dots */}
        {approaches.map((a) => {
          const yr = calendarYear(a.calendar_date);
          const cx = xForYear(yr);
          const r = radiusForDist(a.miss_distance_au);
          const palette = bandColor(a.miss_distance_au);
          const isSelected = selected?.julian_date === a.julian_date;
          return (
            <g
              key={a.julian_date}
              className="cursor-pointer"
              onClick={() => setSelected(a)}
            >
              <circle
                cx={cx}
                cy={trackY}
                r={r}
                className={`${palette.fill} ${isSelected ? "stroke-zinc-100" : palette.stroke} transition`}
                strokeWidth={isSelected ? 1.5 : 0.5}
                opacity={a.miss_distance_au < 0.001 ? 1 : 0.85}
              >
                <title>
                  {a.calendar_date} · {formatDistance(a.miss_distance_au)} ·{" "}
                  {a.relative_velocity_km_s.toFixed(2)} km/s
                </title>
              </circle>
            </g>
          );
        })}
      </svg>
      {selected && (
        <div className="rounded border border-zinc-800 bg-black/50 px-3 py-2 font-mono text-[10px] leading-relaxed text-zinc-300">
          <div className="flex items-baseline justify-between">
            <span className="text-zinc-100">{selected.calendar_date}</span>
            <span className="text-zinc-500">
              ±{selected.time_uncertainty_3sigma} (3σ)
            </span>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5">
            <span className="text-zinc-500">Miss distance</span>
            <span className="text-right">{formatDistance(selected.miss_distance_au)}</span>
            <span className="text-zinc-500">v_rel</span>
            <span className="text-right">{selected.relative_velocity_km_s.toFixed(2)} km/s</span>
            <span className="text-zinc-500">v∞</span>
            <span className="text-right">{selected.velocity_infinity_km_s.toFixed(2)} km/s</span>
            {selected.h != null && (
              <>
                <span className="text-zinc-500">H</span>
                <span className="text-right">{selected.h.toFixed(2)}</span>
              </>
            )}
          </div>
          <a
            href={`https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(selected.designation)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-emerald-400 hover:text-emerald-300"
          >
            JPL SBDB ↗
          </a>
        </div>
      )}
      <div className="flex items-center gap-3 text-[9px] uppercase tracking-wider text-zinc-500">
        <Legend color="bg-red-500" label="≤ 1.5 LD" />
        <Legend color="bg-amber-400" label="≤ 15 LD" />
        <Legend color="bg-yellow-300" label="≤ 150 LD" />
        <Legend color="bg-sky-400" label="far" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />
      <span>{label}</span>
    </span>
  );
}
