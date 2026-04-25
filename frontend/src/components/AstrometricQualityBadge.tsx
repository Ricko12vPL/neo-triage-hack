import { useState } from "react";
import type {
  AstrometricGrade,
  AstrometricQualityBreakdown,
} from "../api/types";

/**
 * Letter pill A/B/C/F mirroring Find_Orb's astrometric quality buckets.
 *
 * Layered disclosure:
 *  - Always: colored letter pill in tag-strip.
 *  - Hover: tooltip with grade meaning + thresholds + actual tracklet values.
 *  - Click: inline mini-panel with checks summary + jump-to-details link.
 *  - F grade: pulses to draw operator's eye to weak data.
 */

interface Props {
  grade: AstrometricGrade;
  breakdown?: AstrometricQualityBreakdown | null;
  /** Slightly larger pill when used inside a panel header. */
  variant?: "inline" | "panel";
  /** Called when user clicks "see details" link in expanded mini-panel. */
  onJumpToDetails?: () => void;
}

const STYLE: Record<
  AstrometricGrade,
  {
    bg: string;
    text: string;
    border: string;
    label: string;
    methodology: string;
  }
> = {
  A: {
    bg: "bg-emerald-900/40",
    text: "text-emerald-200",
    border: "border-emerald-700/60",
    label:
      "High-confidence: ≥10 obs, ≥60 min arc, V<20. Orbit will converge tightly.",
    methodology: "Safe to commit telescope time.",
  },
  B: {
    bg: "bg-amber-900/40",
    text: "text-amber-200",
    border: "border-amber-700/60",
    label: "Solid: ≥6 obs, ≥30 min arc, V<22. Adequate for short-arc fit.",
    methodology: "Worth observing to extend arc.",
  },
  C: {
    bg: "bg-orange-900/40",
    text: "text-orange-200",
    border: "border-orange-700/60",
    label: "Marginal: ≥3 obs, ≥10 min arc. Risk of going stale on NEOCP.",
    methodology: "High risk if no follow-up tonight.",
  },
  F: {
    bg: "bg-rose-900/40",
    text: "text-rose-200",
    border: "border-rose-700/60",
    label: "Insufficient: below thresholds. Urgent confirmation or accept loss.",
    methodology: "Likely needs urgent confirmation or will be lost.",
  },
};

function actualValuesLine(b: AstrometricQualityBreakdown): string {
  const obs = b.checks.find((c) => c.name === "observations")?.value;
  const arc = b.checks.find((c) => c.name === "arc_length")?.value;
  const mag = b.checks.find((c) => c.name === "magnitude")?.value;
  const parts: string[] = [];
  if (typeof obs === "number") parts.push(`${obs} obs`);
  if (typeof arc === "number") parts.push(`${Math.round(arc)} min arc`);
  if (typeof mag === "number") parts.push(`V=${mag.toFixed(1)}`);
  return parts.join(" · ");
}

export function AstrometricQualityBadge({
  grade,
  breakdown,
  variant = "inline",
  onJumpToDetails,
}: Props) {
  const s = STYLE[grade];
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const sizing =
    variant === "panel"
      ? "px-2 py-0.5 text-[11px]"
      : "px-1 py-0.5 text-[9px]";
  const pulse = grade === "F" ? "animate-pulse" : "";
  const actualValues = breakdown ? actualValuesLine(breakdown) : "";

  // Tooltip text combines static methodology + this tracklet's values.
  const tooltipBody = breakdown
    ? `Astrometric Quality ${grade} — ${s.label}${
        actualValues ? `\n(this object: ${actualValues})` : ""
      }`
    : `Find_Orb-style astrometry grade ${grade} — ${s.label}`;

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded((prev) => !prev);
        }}
        className={[
          "inline-flex items-center gap-1 rounded-sm border font-mono uppercase tracking-wide",
          "transition-colors hover:brightness-125",
          s.bg,
          s.text,
          s.border,
          sizing,
          pulse,
          "cursor-pointer",
        ].join(" ")}
        title={tooltipBody}
        aria-label={`Astrometric quality ${grade}. Click for details.`}
        aria-expanded={expanded}
      >
        <span aria-hidden>★</span>
        <span>q{grade}</span>
      </button>

      {/* Hover tooltip — only when not expanded so we don't double-render. */}
      {hovered && !expanded && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-0 top-full z-50 mt-1 w-72 rounded border border-zinc-700 bg-zinc-950/97 px-3 py-2 text-[10px] leading-snug text-zinc-200 shadow-xl"
        >
          <span className="block font-semibold text-zinc-100">
            Astrometric Quality {grade}
          </span>
          <span className="mt-1 block text-zinc-300">{s.label}</span>
          {breakdown ? (
            <span className="mt-1 block font-mono text-[10px] text-zinc-400">
              this object · {actualValues}
            </span>
          ) : null}
          <span className="mt-1 block text-[9px] uppercase tracking-wide text-zinc-500">
            Find_Orb-style · projectpluto.com
          </span>
        </span>
      )}

      {/* Click-expand mini-panel */}
      {expanded && (
        <span
          role="dialog"
          aria-label={`Astrometric quality ${grade} details`}
          className="absolute left-0 top-full z-50 mt-1 w-80 rounded border border-zinc-700 bg-zinc-950/98 px-3 py-2 text-[10px] leading-snug text-zinc-200 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="flex items-center justify-between">
            <span className="font-semibold text-zinc-100">
              Quality {grade} · {breakdown?.grade_summary ?? s.label}
            </span>
            <button
              type="button"
              className="rounded px-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="Close"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(false);
              }}
            >
              ✕
            </button>
          </span>
          {breakdown ? (
            <ul className="mt-1.5 space-y-0.5 font-mono">
              {breakdown.checks.map((c) => {
                const passes = c.passes_a
                  ? "A"
                  : c.passes_b
                    ? "B"
                    : c.passes_c
                      ? "C"
                      : "—";
                const valueDisplay =
                  c.value == null
                    ? "—"
                    : c.unit === "minutes"
                      ? `${Math.round(c.value)} min`
                      : c.unit === "V_mag"
                        ? `V=${c.value.toFixed(1)}`
                        : c.value.toString();
                return (
                  <li key={c.name} className="flex justify-between gap-2">
                    <span className="text-zinc-400">{c.label}</span>
                    <span className="text-zinc-200">
                      {valueDisplay}{" "}
                      <span className="text-zinc-500">· pass {passes}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-1.5 text-zinc-400">{s.methodology}</p>
          )}
          <span className="mt-2 flex items-center justify-between border-t border-zinc-800 pt-1.5">
            <span className="text-[9px] uppercase tracking-wide text-zinc-500">
              Find_Orb-style · projectpluto.com
            </span>
            {onJumpToDetails && (
              <button
                type="button"
                className="text-[10px] font-mono uppercase tracking-wide text-emerald-300 hover:text-emerald-200"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(false);
                  onJumpToDetails();
                }}
              >
                see details →
              </button>
            )}
          </span>
        </span>
      )}
    </span>
  );
}
