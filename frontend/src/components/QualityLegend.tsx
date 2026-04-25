import { useEffect, useState } from "react";
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
    label: "High-confidence",
    thresholds: "≥10 obs · ≥60 min · V<20 · digest2≥50",
    context: "rare for live NEOCP",
  },
  {
    grade: "B",
    color: "amber",
    label: "Solid",
    thresholds: "≥6 obs · ≥30 min · V<22",
    context: "most live MPC tracklets",
  },
  {
    grade: "C",
    color: "orange",
    label: "Marginal",
    thresholds: "≥3 obs · ≥10 min",
    context: "short tracklets, urgent follow-up",
  },
  {
    grade: "F",
    color: "rose",
    label: "Insufficient",
    thresholds: "below all thresholds",
    context: "pursue immediately or accept loss",
  },
];

const DOT_COLOR: Record<GradeColor, string> = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-400",
  orange: "bg-orange-400",
  rose: "bg-rose-500",
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
    <div className="border-t border-zinc-900 bg-zinc-950/60 px-4 py-1.5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded text-left text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2">
          <span className="text-zinc-500">Astrometric Quality</span>
          <span className="flex items-center gap-1.5 font-mono text-[10px] normal-case tracking-normal">
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
                <span className={TEXT_COLOR[r.color]}>{r.grade}</span>
              </span>
            ))}
          </span>
        </span>
        <span aria-hidden className="font-mono text-[11px] text-zinc-500">
          {expanded ? "▴" : "▾"}
        </span>
      </button>

      {expanded && (
        <ul className="mt-2 space-y-1 font-mono text-[10px] leading-snug">
          {ROWS.map((r) => (
            <li key={r.grade} className="grid grid-cols-[18px_64px_1fr] gap-2">
              <span
                aria-hidden
                className={`mt-1 inline-block h-2 w-2 rounded-full ${DOT_COLOR[r.color]}`}
              />
              <span className={`uppercase tracking-wide ${TEXT_COLOR[r.color]}`}>
                {r.grade} {r.label}
              </span>
              <span className="text-zinc-500">
                <span className="text-zinc-400">{r.thresholds}</span>
                <span className="ml-2 text-zinc-600">· {r.context}</span>
              </span>
            </li>
          ))}
          <li className="pt-1 text-[9px] uppercase tracking-wide text-zinc-600">
            Find_Orb-style ·{" "}
            <a
              href="https://www.projectpluto.com/find_orb.htm"
              target="_blank"
              rel="noreferrer noopener"
              className="text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Bill Gray, projectpluto.com
            </a>{" "}
            · simplified · Phase 2 = full residual analysis
          </li>
        </ul>
      )}
    </div>
  );
}
