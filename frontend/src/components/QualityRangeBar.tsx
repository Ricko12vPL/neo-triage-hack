import { useEffect, useState } from "react";
import type {
  AstrometricGrade,
  AstrometricQualityBreakdown,
  AstrometricQualityCheck,
} from "../api/types";

/**
 * Visual A→F spectrum range bar with marker showing where this tracklet
 * sits within its grade band.
 *
 * Layout:
 *   |  F-zone  |  C-zone  |    B-zone     |     A-zone     |  100%
 *   ▒▒▒▒▒▒▒▒▒▒▒░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
 *   rose        orange     amber           emerald
 *
 * Marker (▼) position is computed from the bottleneck check — the one
 * with the smallest headroom to the next-tier threshold. So a grade-B
 * tracklet that's right on the edge of A renders far right of the B
 * band, while one barely above C renders at the band's lower edge.
 *
 * Background bands fade in 200 ms, marker animates from left over 600 ms.
 */

interface Props {
  breakdown: AstrometricQualityBreakdown;
}

// Band offsets (in 0–100 percent space). Widths match how operators
// generally describe astrometric quality bands — F is large because it
// covers everything below the C floor, A is narrow because once you're
// in A there's not much room to "improve" further.
const BAND: Record<AstrometricGrade, { start: number; width: number }> = {
  F: { start: 0, width: 33 },
  C: { start: 33, width: 17 },
  B: { start: 50, width: 30 },
  A: { start: 80, width: 20 },
};

const BAND_FILL: Record<AstrometricGrade, string> = {
  F: "fill-rose-900/60",
  C: "fill-orange-900/55",
  B: "fill-amber-900/55",
  A: "fill-emerald-900/55",
};

const BAND_LABEL_COLOR: Record<AstrometricGrade, string> = {
  F: "fill-rose-300",
  C: "fill-orange-300",
  B: "fill-amber-300",
  A: "fill-emerald-300",
};

const MARKER_COLOR: Record<AstrometricGrade, string> = {
  F: "fill-rose-200 stroke-rose-300",
  C: "fill-orange-200 stroke-orange-300",
  B: "fill-amber-200 stroke-amber-300",
  A: "fill-emerald-200 stroke-emerald-300",
};

interface BottleneckResult {
  /** 0–1 normalized position within current grade band. */
  position_within_band: number;
  /** Which check binds the grade most tightly. */
  binding_check: AstrometricQualityCheck | null;
  reason: string;
}

/**
 * Identify the bottleneck check — the one with the smallest headroom
 * relative to the next tier's threshold.
 *
 * For each check, compute how close (0–1) we are to the next-tier
 * threshold. Take the minimum: that's the bottleneck, and its position
 * tells us where in the current band the marker should sit.
 *
 * Edge cases:
 *  - Grade A: no next tier, so we look at how strongly each A check
 *    passes — marker drifts toward 100% for very strong tracklets.
 *  - Grade F: no checks pass at all, marker hugs left edge.
 */
function computeBottleneck(
  breakdown: AstrometricQualityBreakdown,
): BottleneckResult {
  const grade = breakdown.grade;
  const checks = breakdown.checks;

  if (grade === "F") {
    return {
      position_within_band: 0.2,
      binding_check: null,
      reason: "below all C thresholds — marker hugs left edge",
    };
  }

  if (grade === "A") {
    // Strongest A passes get a marker further right.
    // Use observations and arc as the dominant signal — both have
    // useful headroom for "how strong is the A".
    const obsCheck = checks.find((c) => c.name === "observations");
    const arcCheck = checks.find((c) => c.name === "arc_length");
    let strength = 0.5;
    if (obsCheck?.value != null && obsCheck.threshold_a != null) {
      const obsRatio = Math.min(
        2,
        (obsCheck.value as number) / Math.max(1, obsCheck.threshold_a as number),
      );
      strength = Math.max(strength, (obsRatio - 1) / 1); // 0 at threshold, 1 at 2× threshold
    }
    if (arcCheck?.value != null && arcCheck.threshold_a != null) {
      const arcRatio = Math.min(
        2,
        (arcCheck.value as number) /
          Math.max(1, arcCheck.threshold_a as number),
      );
      strength = Math.max(strength, (arcRatio - 1) / 1);
    }
    return {
      position_within_band: Math.max(0.1, Math.min(1, strength)),
      binding_check: obsCheck ?? null,
      reason: "Grade A — marker drifts right with stronger pass margins",
    };
  }

  // Grade B or C — find the bottleneck against next-tier threshold.
  const nextTierKey: "threshold_a" | "threshold_b" =
    grade === "B" ? "threshold_a" : "threshold_b";

  let bottleneckCheck: AstrometricQualityCheck | null = null;
  let minRatio = 1.0;

  for (const c of checks) {
    if (c.value == null) continue;
    const threshold = c[nextTierKey];
    if (threshold == null) continue;

    let ratio: number;
    if (c.unit === "V_mag") {
      // Magnitude: smaller is better. Use ratio of (max_b - v) / (max_b - max_a).
      // For B grade looking at threshold_a (A_MAX_V = 20), threshold_b = 22:
      //   v=20.0 → ratio=1.0 (at A threshold), v=22.0 → ratio=0.0 (at B floor)
      const maxBThreshold =
        grade === "B" ? c.threshold_b : c.threshold_b ?? c.threshold_c;
      if (maxBThreshold == null) continue;
      const span = (maxBThreshold as number) - (threshold as number);
      if (span <= 0) continue;
      ratio = Math.max(
        0,
        Math.min(1, ((maxBThreshold as number) - (c.value as number)) / span),
      );
    } else {
      // Higher is better: ratio of how far past current-tier toward next.
      const currentTier = grade === "B" ? c.threshold_b : c.threshold_c;
      if (currentTier == null) continue;
      const span = (threshold as number) - (currentTier as number);
      if (span <= 0) continue;
      ratio = Math.max(
        0,
        Math.min(1, ((c.value as number) - (currentTier as number)) / span),
      );
    }

    if (ratio < minRatio) {
      minRatio = ratio;
      bottleneckCheck = c;
    }
  }

  return {
    position_within_band: minRatio,
    binding_check: bottleneckCheck,
    reason: bottleneckCheck
      ? `Constraining check: ${bottleneckCheck.label}`
      : "no constraining check identified",
  };
}

function reasonLabelForCheck(c: AstrometricQualityCheck): string {
  switch (c.unit) {
    case "minutes":
      return c.value != null
        ? `${c.label.toLowerCase()} ${Math.round(c.value)} min`
        : c.label.toLowerCase();
    case "V_mag":
      return c.value != null
        ? `V=${(c.value as number).toFixed(1)}`
        : c.label.toLowerCase();
    case "count":
      return c.value != null
        ? `${c.value} ${c.label.toLowerCase()}`
        : c.label.toLowerCase();
    default:
      return c.label.toLowerCase();
  }
}

const W = 300;
const H = 32;

export function QualityRangeBar({ breakdown }: Props) {
  const bottleneck = computeBottleneck(breakdown);
  const band = BAND[breakdown.grade];
  const finalPercent =
    band.start + bottleneck.position_within_band * band.width;

  // Animated entrance: marker glides from left to its final position
  // over 600 ms ease-out.
  const [animatedPercent, setAnimatedPercent] = useState(0);
  useEffect(() => {
    let raf = 0;
    const startTime = performance.now();
    const durationMs = 600;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setAnimatedPercent(eased * finalPercent);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [finalPercent]);

  const markerX = (animatedPercent / 100) * W;
  const tooltip = bottleneck.binding_check
    ? `Constraining check: ${reasonLabelForCheck(bottleneck.binding_check)}`
    : bottleneck.reason;

  return (
    <div className="select-none">
      <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-wider text-zinc-500">
        <span>Quality spectrum</span>
        <span className="font-mono text-zinc-400" title={tooltip}>
          {bottleneck.binding_check
            ? `bottleneck · ${reasonLabelForCheck(bottleneck.binding_check)}`
            : "—"}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H + 14}`}
        width="100%"
        height={H + 14}
        role="img"
        aria-label={`Astrometric quality range bar — grade ${breakdown.grade}, marker at ${finalPercent.toFixed(0)} percent`}
      >
        {/* Bands */}
        {(["F", "C", "B", "A"] as AstrometricGrade[]).map((g) => {
          const b = BAND[g];
          const x = (b.start / 100) * W;
          const w = (b.width / 100) * W;
          return (
            <g key={g}>
              <rect
                x={x}
                y={0}
                width={w}
                height={H}
                className={BAND_FILL[g]}
              >
                <animate
                  attributeName="opacity"
                  from="0"
                  to="1"
                  dur="200ms"
                  fill="freeze"
                />
              </rect>
              <text
                x={x + w / 2}
                y={H / 2 + 4}
                textAnchor="middle"
                className={`${BAND_LABEL_COLOR[g]} font-mono text-[10px] font-semibold uppercase`}
              >
                {g}
              </text>
            </g>
          );
        })}

        {/* Band-divider lines */}
        {[33, 50, 80].map((p) => (
          <line
            key={p}
            x1={(p / 100) * W}
            x2={(p / 100) * W}
            y1={0}
            y2={H}
            className="stroke-zinc-950/60"
            strokeWidth={1}
          />
        ))}

        {/* Marker */}
        <g transform={`translate(${markerX}, 0)`}>
          <line
            x1={0}
            x2={0}
            y1={0}
            y2={H}
            className={MARKER_COLOR[breakdown.grade].split(" ")[1]}
            strokeWidth={1.5}
            strokeDasharray="2 2"
          />
          <polygon
            points={`-5,${H + 2} 5,${H + 2} 0,${H + 10}`}
            className={MARKER_COLOR[breakdown.grade]}
            strokeWidth={1}
          >
            <title>{tooltip}</title>
          </polygon>
        </g>
      </svg>
      <p className="mt-1 text-[9px] leading-snug text-zinc-500">
        {bottleneck.binding_check
          ? `Marker placed by the smallest headroom to the next tier — ${reasonLabelForCheck(bottleneck.binding_check)} is the constraining metric.`
          : "Marker reflects band position — no single binding constraint."}
      </p>
    </div>
  );
}
