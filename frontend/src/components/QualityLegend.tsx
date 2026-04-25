import { Fragment, useEffect, useState } from "react";
import type { AstrometricGrade, GradeColor } from "../api/types";

/**
 * Persistent strip in Live Feed header decoding A/B/C/F at a glance.
 *
 * Default state: collapsed (just colored dots).
 * First-time viewers (localStorage flag absent) get expanded form for
 * the first ~3 sessions so they can learn the system without hunting
 * for tooltips.
 */

const SEEN_KEY = "neo-triage:quality-legend-seen-count";
const SEEN_MAX = 3;

interface GradeRow {
  grade: AstrometricGrade;
  color: GradeColor;
  label: string;
  thresholds: string;
  context: string;
}

const ROWS: GradeRow[] = [
  {
    grade: "A",
    color: "emerald",
    label: "High confidence",
    thresholds: "≥10 obs · ≥60 min · V<20 · digest2≥50",
    context: "Rare on live NEOCP — orbit fits cleanly",
  },
  {
    grade: "B",
    color: "amber",
    label: "Solid",
    thresholds: "≥6 obs · ≥30 min · V<22",
    context: "Most live MPC tracklets — adequate for fit",
  },
  {
    grade: "C",
    color: "orange",
    label: "Marginal",
    thresholds: "≥3 obs · ≥10 min",
    context: "Short tracklets — pursue before they go stale",
  },
  {
    grade: "F",
    color: "rose",
    label: "Insufficient",
    thresholds: "below all thresholds",
    context: "Pursue immediately or accept loss",
  },
];

const DOT_COLOR: Record<GradeColor, string> = {
  emerald: "bg-emerald-400",
  amber: "bg-amber-400",
  orange: "bg-orange-400",
  rose: "bg-rose-400",
};

const TEXT_COLOR: Record<GradeColor, string> = {
  emerald: "text-emerald-300",
  amber: "text-amber-300",
  orange: "text-orange-300",
  rose: "text-rose-300",
};

export function QualityLegend() {
  // First-time viewer detection: track visit count in localStorage.
  const [seenCount, setSeenCount] = useState<number>(() => {
    if (typeof window === "undefined") return SEEN_MAX;
    const raw = window.localStorage.getItem(SEEN_KEY);
    return raw ? Number.parseInt(raw, 10) || 0 : 0;
  });
  const [expanded, setExpanded] = useState(seenCount < SEEN_MAX);

  // Bump seen count once per mount so default flips to collapsed after
  // the user has seen it expanded a handful of times.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const next = Math.min(seenCount + 1, SEEN_MAX + 1);
    window.localStorage.setItem(SEEN_KEY, String(next));
    setSeenCount(next);
    // intentional one-shot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="border-t border-zinc-900 bg-zinc-950/60 px-4 py-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded text-left hover:text-zinc-300"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2.5">
          <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-400">
            Astrometric Quality
          </span>
          <span className="flex items-center gap-1.5">
            {ROWS.map((r) => (
              <span
                key={r.grade}
                className="flex items-center gap-1"
                title={`${r.grade} · ${r.label}`}
              >
                <span
                  aria-hidden
                  className={`inline-block h-1.5 w-1.5 rounded-full ${DOT_COLOR[r.color]}`}
                />
                <span className={`font-mono text-[10px] font-semibold ${TEXT_COLOR[r.color]}`}>
                  {r.grade}
                </span>
              </span>
            ))}
          </span>
        </span>
        <span aria-hidden className="font-mono text-[11px] text-zinc-500">
          {expanded ? "▴" : "▾"}
        </span>
      </button>

      {expanded && (
        <div className="mt-2.5 grid grid-cols-[14px_1fr] gap-x-3 gap-y-2">
          {ROWS.map((r) => (
            <Fragment
              key={r.grade}
            >
              <div className="flex items-start pt-1">
                <span
                  aria-hidden
                  className={`inline-block h-2 w-2 rounded-full ${DOT_COLOR[r.color]}`}
                />
              </div>
              <div className="group min-w-0 rounded px-1 py-0.5 transition-colors hover:bg-zinc-900/40">
                <div className="flex items-baseline gap-2">
                  <span
                    className={`font-mono text-[12px] font-bold ${TEXT_COLOR[r.color]}`}
                  >
                    {r.grade}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-200">
                    {r.label}
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-[10px] tabular-nums text-zinc-400 group-hover:text-zinc-300">
                  {r.thresholds}
                </div>
                <div className="text-[10px] leading-snug text-zinc-500 group-hover:text-zinc-400">
                  {r.context}
                </div>
              </div>
            </Fragment>
          ))}
          <div className="col-span-2 mt-1 border-t border-zinc-900 pt-2 text-[9px] leading-snug text-zinc-500">
            <p className="italic">
              Find_Orb-style A/B/C/F grading ·{" "}
              <a
                href="https://www.projectpluto.com/find_orb.htm"
                target="_blank"
                rel="noreferrer noopener"
                className="not-italic text-zinc-400 underline-offset-2 hover:text-zinc-300 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Bill Gray · projectpluto.com
              </a>
            </p>
            <p className="mt-0.5 italic">
              Simplified — Phase 2 = full residual analysis
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
