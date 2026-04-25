import type { DataSource } from "../api/types";

/**
 * Per-object provenance pill. Renders next to the trksub in the Live
 * Feed, in the candidate-details panel header, and (small variant) on
 * the Sky View popover. Three states only — no ambiguity for jurors:
 *
 *   ◉ MPC LIVE   → real MPC NEOCP scrape, emerald
 *   ◆ DEMO       → handcrafted fixture, violet
 *   ⚡ SYNTHETIC → operator-triggered demo event, orange + pulse
 */
const STYLE: Record<
  DataSource,
  { bg: string; text: string; border: string; icon: string; label: string; pulse?: boolean }
> = {
  LIVE_MPC_NEOCP: {
    bg: "bg-emerald-900/40",
    text: "text-emerald-300",
    border: "border-emerald-700/60",
    icon: "◉",
    label: "MPC live",
  },
  DEMO_FIXTURE: {
    bg: "bg-violet-900/40",
    text: "text-violet-300",
    border: "border-violet-700/60",
    icon: "◆",
    label: "Demo",
  },
  SYNTHETIC_INJECTION: {
    bg: "bg-orange-900/50",
    text: "text-orange-300",
    border: "border-orange-700/60",
    icon: "⚡",
    label: "Synthetic",
    pulse: true,
  },
};

function relativeAge(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const sec = Math.floor(ms / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

interface Props {
  source?: DataSource;
  fetchedAt?: string | null;
  className?: string;
}

export function SourceBadge({
  source = "LIVE_MPC_NEOCP",
  fetchedAt,
  className,
}: Props) {
  const s = STYLE[source];
  const age = relativeAge(fetchedAt);
  const tooltip =
    source === "LIVE_MPC_NEOCP"
      ? `Real MPC NEOCP tracklet${age ? ` · fetched ${age}` : ""}.`
      : source === "DEMO_FIXTURE"
      ? "Handcrafted demo fixture (not derived from real observations)."
      : "Operator-triggered synthetic event for demo recording.";
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide",
        s.bg,
        s.text,
        s.border,
        s.pulse ? "animate-pulse" : "",
        className ?? "",
      ].join(" ")}
      title={tooltip}
    >
      <span aria-hidden>{s.icon}</span>
      <span>{s.label}</span>
    </span>
  );
}
