import { computeTorinoFromCandidate } from "../lib/torino";

interface Props {
  impact_probability: number | null | undefined;
  absolute_magnitude_h: number | null | undefined;
  variant: "inline" | "card";
}

export function TorinoBadge({
  impact_probability,
  absolute_magnitude_h,
  variant,
}: Props) {
  const torino = computeTorinoFromCandidate(
    impact_probability,
    absolute_magnitude_h,
  );

  if (variant === "inline") {
    // Only surface Torino 2+ in list rows — Torino 0/1 is visual noise
    if (torino.scale < 2) return null;
    return (
      <span
        title={torino.description}
        className={`rounded-sm border px-1 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${torino.colorClasses}`}
      >
        {torino.label}
      </span>
    );
  }

  // Card variant — always shown, full label + description
  return (
    <div
      className={`rounded-sm border px-3 py-2 ${torino.scale >= 2 ? torino.colorClasses : "border-zinc-800 bg-zinc-900/40 text-zinc-500"}`}
    >
      <div className="text-[10px] uppercase tracking-wider opacity-70">
        Torino Scale
      </div>
      <div className="mt-1 font-mono text-xl font-medium">
        {torino.scale}
      </div>
      <div className="mt-0.5 text-[10px] leading-tight opacity-80">
        {torino.description}
      </div>
    </div>
  );
}
