import { useMemo } from "react";
import type { Prediction, RankedCandidate } from "../api/types";
import type { ObserverLocation } from "../hooks/useObserverLocation";
import {
  computeVisibilityTonight,
  formatUtcTime,
} from "../lib/visibility";
import { TorinoBadge } from "./TorinoBadge";

interface Props {
  candidate: RankedCandidate;
  observerLocation: ObserverLocation;
}

function HeroProb({
  label,
  value,
  ci,
  variant,
}: {
  label: string;
  value: number;
  ci?: [number, number];
  variant: "neo" | "pha" | "neutral";
}) {
  const colorMap = {
    neo:
      value >= 0.8
        ? "text-emerald-300"
        : value >= 0.5
          ? "text-amber-300"
          : "text-zinc-300",
    pha: value >= 0.5 ? "text-red-300" : value >= 0.2 ? "text-orange-300" : "text-zinc-300",
    neutral: "text-zinc-200",
  };
  const halfWidth = ci ? ((ci[1] - ci[0]) / 2).toFixed(3) : null;

  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 font-mono text-xl font-medium ${colorMap[variant]}`}>
        {value.toFixed(3)}
      </div>
      {halfWidth && (
        <div className="mt-0.5 font-mono text-[10px] text-zinc-600">
          ±{halfWidth} (90% CI)
        </div>
      )}
    </div>
  );
}

export function PredictionCard({ candidate, observerLocation }: Props) {
  const c = candidate;
  const p: Prediction = candidate.prediction;

  const vis = useMemo(
    () =>
      computeVisibilityTonight(
        c.ra_deg,
        c.dec_deg,
        observerLocation.latitude_deg,
        observerLocation.longitude_deg,
        new Date(),
      ),
    [c.ra_deg, c.dec_deg, observerLocation],
  );

  const obsStatusColor =
    vis.status === "visible_now"
      ? "text-emerald-400"
      : vis.status === "sets_soon"
        ? "text-amber-400"
        : vis.status === "rises_later"
          ? "text-zinc-400"
          : "text-zinc-600";

  const obsStatusLabel =
    vis.status === "visible_now"
      ? `VISIBLE NOW · ${vis.altitude_deg_now.toFixed(0)}° alt`
      : vis.status === "sets_soon"
        ? `SETS SOON · ${vis.altitude_deg_now.toFixed(0)}° alt`
        : vis.status === "rises_later"
          ? "BELOW HORIZON — RISES LATER"
          : "BELOW HORIZON TONIGHT";

  return (
    <section className="border-b border-zinc-800 bg-zinc-950/40 px-4 py-3">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-medium text-zinc-100">
            {c.trksub}
          </h1>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {c.observatory_code} ·{" "}
            {new Date(c.first_obs_datetime).toISOString().slice(0, 19)}Z · arc{" "}
            {c.arc_length_minutes.toFixed(0)}min · {c.n_observations} obs
          </p>
        </div>
        <span className="rounded-sm border border-zinc-800 bg-zinc-900/60 px-2 py-1 font-mono text-[10px] text-zinc-500">
          {p.model_version}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <HeroProb
          label="P(NEO)"
          value={p.prob_neo}
          ci={p.prob_neo_ci_90}
          variant="neo"
        />
        <HeroProb label="P(PHA)" value={p.prob_pha} variant="pha" />
        <TorinoBadge
          impact_probability={c.impact_probability}
          absolute_magnitude_h={c.absolute_magnitude_h}
          variant="card"
        />
        <div className="rounded-sm border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            MAP class
          </div>
          <div className="mt-1 font-mono text-xl font-medium text-zinc-100">
            {p.map_class}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-zinc-600">
            H={p.uncertainty_entropy_bits.toFixed(2)} bits
          </div>
        </div>
        <div className="rounded-sm border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            Photometry
          </div>
          <div className="mt-1 font-mono text-xl font-medium text-zinc-100">
            V {c.mean_magnitude_v.toFixed(2)}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-zinc-600">
            d2={c.digest2_neo_noid} · {c.rate_arcsec_min.toFixed(2)}″/min
          </div>
        </div>
      </div>

      {/* Observability section */}
      <div className="mt-2 rounded-sm border border-zinc-800/60 bg-zinc-900/20 px-3 py-2">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-600">
          Observability · {observerLocation.label}
        </div>
        <div className={`font-mono text-[11px] font-medium ${obsStatusColor}`}>
          {obsStatusLabel}
        </div>
        <div className="mt-1 grid grid-cols-3 gap-x-4 font-mono text-[10px] text-zinc-500">
          <span>
            Rise{" "}
            <span className="text-zinc-400">{formatUtcTime(vis.rise_utc)}</span>
          </span>
          <span>
            Set{" "}
            <span className="text-zinc-400">{formatUtcTime(vis.set_utc)}</span>
          </span>
          <span>
            Max{" "}
            <span className="text-zinc-400">
              {vis.max_altitude_deg_tonight.toFixed(0)}°
            </span>
          </span>
        </div>
        {vis.best_observing_time_utc && (
          <div className="mt-0.5 font-mono text-[10px] text-zinc-600">
            Best window: {formatUtcTime(vis.best_observing_time_utc)}
          </div>
        )}
      </div>
    </section>
  );
}
