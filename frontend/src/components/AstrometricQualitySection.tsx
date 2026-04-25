import type {
  AstrometricQualityBreakdown,
  AstrometricQualityCheck,
  GradeColor,
  OperatorActionVerb,
} from "../api/types";
import { QualityRangeBar } from "./QualityRangeBar";

/**
 * Full breakdown section that appears in CandidateDetailsPanel.
 *
 * Layout, top to bottom:
 *   1. Header   — grade letter + summary
 *   2. RangeBar — visual A→F spectrum with marker (BLOCK_6)
 *   3. Checks   — 4 rows × (your value, A/B/C thresholds, status)
 *   4. Why      — plain-English derivation (server-generated)
 *   5. Upgrade  — smallest delta to higher grade (when not A)
 *   6. Action   — bordered callout with operator verb
 *   7. Footer   — Find_Orb attribution + Phase 2 caveat
 */

interface Props {
  breakdown: AstrometricQualityBreakdown;
}

const GRADE_TEXT_COLOR: Record<GradeColor, string> = {
  emerald: "text-emerald-300",
  amber: "text-amber-300",
  orange: "text-orange-300",
  rose: "text-rose-300",
};

const GRADE_BG: Record<GradeColor, string> = {
  emerald: "bg-emerald-900/30 border-emerald-700/60",
  amber: "bg-amber-900/30 border-amber-700/60",
  orange: "bg-orange-900/30 border-orange-700/60",
  rose: "bg-rose-900/30 border-rose-700/60",
};

const ACTION_VERB_COLOR: Record<OperatorActionVerb, string> = {
  COMMIT: "text-emerald-200",
  OBSERVE: "text-amber-200",
  URGENT: "text-orange-200",
  TRIAGE: "text-rose-200",
};

function formatValue(c: AstrometricQualityCheck): string {
  if (c.value == null) return "—";
  switch (c.unit) {
    case "minutes":
      return `${Math.round(c.value)} min`;
    case "V_mag":
      return `V=${c.value.toFixed(1)}`;
    case "score":
      return c.value.toString();
    default:
      return c.value.toString();
  }
}

function formatThreshold(
  c: AstrometricQualityCheck,
  threshold: number | null,
): string {
  if (threshold == null) return "—";
  switch (c.unit) {
    case "count":
      return `≥${threshold}`;
    case "minutes":
      return `≥${Math.round(threshold)}`;
    case "V_mag":
      return `<${threshold.toFixed(0)}`;
    case "score":
      return `≥${threshold}`;
    default:
      return threshold.toString();
  }
}

function passLabel(c: AstrometricQualityCheck): {
  text: string;
  className: string;
} {
  if (c.passes_a) return { text: "Pass A", className: "text-emerald-300" };
  if (c.passes_b) return { text: "Pass B", className: "text-amber-300" };
  if (c.passes_c) return { text: "Pass C", className: "text-orange-300" };
  return { text: "Fail", className: "text-rose-300" };
}

function ChecksTable({ checks }: { checks: AstrometricQualityCheck[] }) {
  return (
    <div className="overflow-hidden rounded border border-zinc-800">
      <table className="w-full font-mono text-[10px]">
        <thead className="bg-zinc-900/60 text-[9px] uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="px-2 py-1 text-left">Check</th>
            <th className="px-2 py-1 text-right">Value</th>
            <th className="px-2 py-1 text-right">A needs</th>
            <th className="px-2 py-1 text-right">B needs</th>
            <th className="px-2 py-1 text-right">C needs</th>
            <th className="px-2 py-1 text-right">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-900">
          {checks.map((c) => {
            const label = passLabel(c);
            return (
              <tr
                key={c.name}
                className="hover:bg-zinc-900/40"
                title={c.interpretation}
              >
                <td className="px-2 py-1 text-zinc-400">{c.label}</td>
                <td className="px-2 py-1 text-right text-zinc-200">
                  {formatValue(c)}
                </td>
                <td className="px-2 py-1 text-right text-zinc-500">
                  {formatThreshold(c, c.threshold_a)}
                </td>
                <td className="px-2 py-1 text-right text-zinc-500">
                  {formatThreshold(c, c.threshold_b)}
                </td>
                <td className="px-2 py-1 text-right text-zinc-500">
                  {formatThreshold(c, c.threshold_c)}
                </td>
                <td className={`px-2 py-1 text-right ${label.className}`}>
                  {label.text}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AstrometricQualitySection({ breakdown }: Props) {
  const obs = breakdown.checks.find((c) => c.name === "observations")?.value;
  const arc = breakdown.checks.find((c) => c.name === "arc_length")?.value;
  const mag = breakdown.checks.find((c) => c.name === "magnitude")?.value;

  const subhead = (() => {
    const parts: string[] = [];
    if (typeof obs === "number") parts.push(`${obs} observations`);
    if (typeof arc === "number")
      parts.push(`${Math.round(arc)} min of arc`);
    if (typeof mag === "number") parts.push(`V=${mag.toFixed(1)}`);
    return parts.join(" · ");
  })();

  return (
    <section className="mt-4">
      <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
        Astrometric quality
      </h3>
      <div className="rounded border border-zinc-800 bg-zinc-950/70 px-3 py-2.5">
        {/* Header */}
        <div className="flex items-baseline justify-between gap-2 border-b border-zinc-800 pb-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">
              Grade
            </div>
            <div
              className={`text-base font-mono font-semibold ${GRADE_TEXT_COLOR[breakdown.grade_color]}`}
            >
              {breakdown.grade} ·{" "}
              <span className="text-[12px] font-normal">
                {breakdown.grade_summary}
              </span>
            </div>
          </div>
          {subhead && (
            <span className="text-right font-mono text-[10px] text-zinc-500">
              {subhead}
            </span>
          )}
        </div>

        {/* Range bar */}
        <div className="mt-3">
          <QualityRangeBar breakdown={breakdown} />
        </div>

        {/* Checks table */}
        <div className="mt-3">
          <ChecksTable checks={breakdown.checks} />
        </div>

        {/* Why this grade */}
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            Why this grade
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-300">
            {breakdown.why_this_grade}
          </p>
        </div>

        {/* What would upgrade */}
        {breakdown.what_would_upgrade && (
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">
              What would upgrade
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-300">
              {breakdown.what_would_upgrade}
            </p>
          </div>
        )}

        {/* Operator implication callout */}
        <div
          className={`mt-3 rounded border px-3 py-2 ${GRADE_BG[breakdown.grade_color]}`}
        >
          <div className="text-[9px] uppercase tracking-wider text-zinc-400">
            Operator implication
          </div>
          <div
            className={`mt-0.5 font-mono text-[12px] font-semibold ${ACTION_VERB_COLOR[breakdown.operator_action_verb]}`}
          >
            {breakdown.operator_implication}
          </div>
        </div>

        {/* Footer — Find_Orb attribution + Phase 2 caveat */}
        <p className="mt-3 border-t border-zinc-800 pt-2 text-[9px] leading-snug text-zinc-500">
          Methodology: {breakdown.methodology_reference}.{" "}
          <a
            href="https://www.projectpluto.com/find_orb.htm"
            target="_blank"
            rel="noreferrer noopener"
            className="text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
          >
            projectpluto.com
          </a>
          . {breakdown.methodology_caveat}
        </p>
      </div>
    </section>
  );
}
