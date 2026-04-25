import type { AstrometricGrade } from "../api/types";

/**
 * Letter pill A/B/C/F mirroring Find_Orb's astrometric quality buckets.
 * Operators see at a glance whether the tracklet supports a confident
 * orbit determination or whether the ranker numbers are noise.
 */

interface Props {
  grade: AstrometricGrade;
  variant?: "inline" | "panel";
}

const STYLE: Record<AstrometricGrade, { bg: string; text: string; border: string; label: string }> =
  {
    A: {
      bg: "bg-emerald-900/40",
      text: "text-emerald-200",
      border: "border-emerald-700/60",
      label: "Strong astrometry — orbit determination will converge cleanly.",
    },
    B: {
      bg: "bg-amber-900/40",
      text: "text-amber-200",
      border: "border-amber-700/60",
      label: "Solid arc — consider a second epoch to tighten the orbit.",
    },
    C: {
      bg: "bg-orange-900/40",
      text: "text-orange-200",
      border: "border-orange-700/60",
      label: "Minimal arc — ranker output is a hint, not a verdict.",
    },
    F: {
      bg: "bg-rose-900/40",
      text: "text-rose-200",
      border: "border-rose-700/60",
      label: "Too few observations / too short an arc — preliminary only.",
    },
  };

export function AstrometricQualityBadge({ grade, variant = "inline" }: Props) {
  const s = STYLE[grade];
  const sizing =
    variant === "panel"
      ? "px-2 py-0.5 text-[11px]"
      : "px-1 py-0.5 text-[9px]";
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-sm border font-mono uppercase tracking-wide",
        s.bg,
        s.text,
        s.border,
        sizing,
      ].join(" ")}
      title={`Find_Orb-style astrometry grade ${grade} — ${s.label}`}
    >
      <span aria-hidden>★</span>
      <span>q{grade}</span>
    </span>
  );
}
