import type { ExpertReview } from "../api/types";

/**
 * Small inline pill rendered next to a candidate's class badge in the
 * Live Feed list. Three colours map to the three endorsement states:
 *   CONCUR         → emerald  (ranker call backed by Opus)
 *   PARTIAL_CONCUR → amber    (mostly agree, caveat to flag)
 *   DISSENT        → rose     (Opus pushes back on the ranker)
 *
 * The "·c" suffix means a cache hit — same review served from disk
 * within the 15-min TTL. Helpful when judging cost during the demo.
 */
interface Props {
  review: ExpertReview;
  className?: string;
}

const STYLE: Record<
  ExpertReview["class_endorsement"],
  { bg: string; text: string; border: string; icon: string; label: string }
> = {
  CONCUR: {
    bg: "bg-emerald-900/40",
    text: "text-emerald-300",
    border: "border-emerald-700/60",
    icon: "✓",
    label: "concur",
  },
  PARTIAL_CONCUR: {
    bg: "bg-amber-900/40",
    text: "text-amber-300",
    border: "border-amber-700/60",
    icon: "~",
    label: "partial",
  },
  DISSENT: {
    bg: "bg-rose-900/50",
    text: "text-rose-300",
    border: "border-rose-700/60",
    icon: "!",
    label: "dissent",
  },
};

export function ExpertReviewChip({ review, className }: Props) {
  const style = STYLE[review.class_endorsement];
  const cacheSuffix = review.cache_hit ? "·c" : "";
  const tooltip =
    `Opus 4.7 ${style.label} on ${review.endorsed_class}` +
    ` (confidence ${review.confidence_match})\n` +
    `Action: ${review.suggested_action}\n` +
    (review.caveats.length > 0
      ? `Caveats: ${review.caveats.map((c) => c.code).join(", ")}\n`
      : "") +
    `Click row to read reasoning.`;
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide",
        style.bg,
        style.text,
        style.border,
        className ?? "",
      ].join(" ")}
      title={tooltip}
    >
      <span aria-hidden>{style.icon}</span>
      <span>opus{cacheSuffix}</span>
    </span>
  );
}
