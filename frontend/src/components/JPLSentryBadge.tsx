import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { SentryDetailReport } from "../api/types";

/**
 * Cross-validation chip that surfaces the official NASA JPL CNEOS
 * Sentry-II verdict for a famous NEO. Four visual states map directly
 * to the backend SentryStatus:
 *
 *   IN_RISK_LIST  ◉ emerald/amber/red by Palermo Scale
 *   REMOVED       ◉ zinc, strike-through "removed YYYY-MM"
 *   NOT_FOUND     ◌ zinc dashed, "not in risk list"
 *   ERROR         ⚠ amber, "JPL unreachable"
 *
 * Click expands an inline detail block (VI count, sigma method, cache
 * age) instead of a modal — keeps the famous-NEO panel context intact.
 */

interface Props {
  designation: string;
}

function paletteForPS(ps: number): { dot: string; text: string; border: string; bg: string } {
  if (ps >= 0)
    return {
      dot: "bg-red-500",
      text: "text-red-200",
      border: "border-red-700/60",
      bg: "bg-red-950/40",
    };
  if (ps >= -2)
    return {
      dot: "bg-amber-400",
      text: "text-amber-200",
      border: "border-amber-700/60",
      bg: "bg-amber-950/40",
    };
  return {
    dot: "bg-emerald-400",
    text: "text-emerald-200",
    border: "border-emerald-700/60",
    bg: "bg-emerald-950/40",
  };
}

function formatIP(ip: number): string {
  if (ip <= 0) return "0";
  if (ip < 1e-3) return ip.toExponential(2).replace("e", "×10^").replace("+0", "");
  return ip.toFixed(4);
}

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function StatusPillBase({
  borderClass,
  textClass,
  bgClass,
  dotClass,
  children,
  title,
  onClick,
  expanded,
}: {
  borderClass: string;
  textClass: string;
  bgClass: string;
  dotClass: string;
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  expanded: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={[
        "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide transition",
        borderClass,
        textClass,
        bgClass,
        expanded ? "ring-1 ring-zinc-500/40" : "hover:bg-opacity-60",
      ].join(" ")}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass}`} />
      <span aria-hidden>◉</span>
      <span>JPL Sentry</span>
      <span className="text-zinc-500">·</span>
      {children}
    </button>
  );
}

export function JPLSentryBadge({ designation }: Props) {
  const [report, setReport] = useState<SentryDetailReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setReport(null);
    setExpanded(false);
    api
      .jplSentryDetail(designation)
      .then((r) => {
        if (!cancelled) setReport(r);
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

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-zinc-500">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-600 animate-pulse" />
        JPL Sentry · …
      </span>
    );
  }

  if (error) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded border border-amber-700/60 bg-amber-950/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-amber-200"
        title={`JPL Sentry unreachable: ${error}`}
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />⚠ JPL Sentry · unreachable
      </span>
    );
  }

  if (!report) return null;

  if (report.status === "IN_RISK_LIST" && report.summary) {
    const summary = report.summary;
    const ps = summary.palermo_scale_cumulative;
    const palette = paletteForPS(ps);
    const tooltip = `Official NASA JPL CNEOS Sentry-II impact monitor data. ${summary.fullname ?? summary.designation}. ${summary.n_impacts} virtual impactors over ${summary.impact_year_range}. Cached ${formatAge(report.fetched_at_utc)}.`;
    return (
      <div className="space-y-1.5">
        <StatusPillBase
          borderClass={palette.border}
          textClass={palette.text}
          bgClass={palette.bg}
          dotClass={palette.dot}
          title={tooltip}
          onClick={() => setExpanded(!expanded)}
          expanded={expanded}
        >
          <span>IP {formatIP(summary.impact_probability_cumulative)}</span>
          <span className="text-zinc-500">·</span>
          <span>PS {ps.toFixed(2)}</span>
        </StatusPillBase>
        {expanded && (
          <div className="rounded border border-zinc-800 bg-black/50 px-3 py-2 font-mono text-[10px] leading-relaxed text-zinc-300">
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <span className="text-zinc-500">Method</span>
              <span className="text-right">{summary.method}</span>
              <span className="text-zinc-500">VI count</span>
              <span className="text-right">{summary.n_impacts}</span>
              <span className="text-zinc-500">Year range</span>
              <span className="text-right">{summary.impact_year_range}</span>
              <span className="text-zinc-500">PS max</span>
              <span className="text-right">{summary.palermo_scale_max.toFixed(2)}</span>
              {summary.torino_scale_max != null && (
                <>
                  <span className="text-zinc-500">Torino max</span>
                  <span className="text-right">{summary.torino_scale_max}</span>
                </>
              )}
              {summary.velocity_infinity_km_s != null && (
                <>
                  <span className="text-zinc-500">v∞</span>
                  <span className="text-right">
                    {summary.velocity_infinity_km_s.toFixed(2)} km/s
                  </span>
                </>
              )}
              {summary.last_observed && (
                <>
                  <span className="text-zinc-500">Last obs</span>
                  <span className="text-right">{summary.last_observed}</span>
                </>
              )}
              <span className="text-zinc-500">Cache</span>
              <span className="text-right">
                {report.cache_hit ? "hit" : "fresh"} · {formatAge(report.fetched_at_utc)}
              </span>
            </div>
            <a
              href={`https://cneos.jpl.nasa.gov/sentry/details.html#?des=${encodeURIComponent(summary.designation)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300"
            >
              cneos.jpl.nasa.gov ↗
            </a>
          </div>
        )}
      </div>
    );
  }

  if (report.status === "REMOVED") {
    const removedYear = report.removed_at_utc?.slice(0, 7) ?? "earlier";
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-zinc-300"
        title={`Removed from JPL Sentry-II ${report.removed_at_utc ?? ""} after radar/orbit refinement. No longer an impact-risk candidate — exactly what production planetary defense expects to happen for well-observed NEOs.`}
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-500" />◉ JPL Sentry ·{" "}
        <span className="text-zinc-400 line-through">in risk list</span> · removed {removedYear}
      </span>
    );
  }

  if (report.status === "NOT_FOUND") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded border border-dashed border-zinc-700 bg-zinc-900/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-zinc-400"
        title="Not in JPL Sentry-II risk list — orbit determination shows no near-term impact possibility. Most catalogued NEOs land here."
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-600" />◌ JPL Sentry · not in
        risk list
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded border border-amber-700/60 bg-amber-950/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-amber-200"
      title={report.error_message ?? "JPL Sentry-II error"}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />⚠ JPL Sentry · error
    </span>
  );
}
