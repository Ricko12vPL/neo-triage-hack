import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { CrossValidationReport } from "../api/types";

/**
 * Three-way side-by-side comparison: neo-triage ranker (out-of-scope here
 * — famous NEOs are not ranked candidates), JPL Sentry-II, ESA Aegis.
 *
 * The convergence indicator is the headline. When all production
 * systems agree the panel reads ✓ "Convergence — all production systems
 * concur"; when they diverge ⚠ "Divergence — JPL Sentry vs ESA Aegis
 * disagree on …". Operators trust convergent verdicts and dig into
 * divergent ones.
 *
 * The panel is intentionally honest about absent data: "Apophis was
 * removed from JPL Sentry-II in 2021" is presented as a fact, not a
 * gap — that is the system working correctly.
 */

interface Props {
  designation: string;
}

function formatIP(ip: number): string {
  if (ip <= 0) return "0";
  if (ip < 1e-3) return ip.toExponential(2);
  return ip.toFixed(4);
}

function paletteForPS(ps: number): { text: string; bg: string; border: string } {
  if (ps >= 0)
    return { text: "text-red-200", bg: "bg-red-950/40", border: "border-red-700/60" };
  if (ps >= -2)
    return {
      text: "text-amber-200",
      bg: "bg-amber-950/40",
      border: "border-amber-700/60",
    };
  return {
    text: "text-emerald-200",
    bg: "bg-emerald-950/40",
    border: "border-emerald-700/60",
  };
}

function ConvergenceBanner({ report }: { report: CrossValidationReport }) {
  if (report.convergence === "concur") {
    return (
      <div className="rounded border border-emerald-700/40 bg-emerald-950/30 px-3 py-2 text-[11px] leading-relaxed text-emerald-200">
        <span className="font-mono">✓ Convergence</span> — production systems
        concur. <span className="text-emerald-200/80">{report.convergence_explanation}</span>
      </div>
    );
  }
  if (report.convergence === "diverge") {
    return (
      <div className="rounded border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
        <span className="font-mono">⚠ Divergence</span> —{" "}
        <span className="text-amber-200/80">{report.convergence_explanation}</span>
      </div>
    );
  }
  return (
    <div className="rounded border border-zinc-700/60 bg-zinc-900/40 px-3 py-2 text-[11px] leading-relaxed text-zinc-300">
      <span className="font-mono">— Insufficient data</span> ·{" "}
      <span className="text-zinc-400">{report.convergence_explanation}</span>
    </div>
  );
}

function SentryColumn({ report }: { report: CrossValidationReport["sentry"] }) {
  if (report == null) return <SystemColumn title="JPL Sentry-II" status="—" />;
  if (report.status === "REMOVED") {
    return (
      <SystemColumn
        title="JPL Sentry-II"
        status="removed"
        statusTone="zinc"
        secondary={`Withdrawn ${report.removed_at_utc?.slice(0, 7) ?? ""}`}
        explanation="No longer a risk-list candidate after orbit refinement."
      />
    );
  }
  if (report.status === "NOT_FOUND") {
    return (
      <SystemColumn
        title="JPL Sentry-II"
        status="not in list"
        statusTone="zinc"
        explanation="Orbit determination shows no near-term impact possibility."
      />
    );
  }
  if (report.status === "ERROR") {
    return (
      <SystemColumn
        title="JPL Sentry-II"
        status="unreachable"
        statusTone="amber"
        explanation={report.error_message ?? "Transport error"}
      />
    );
  }
  const summary = report.summary!;
  const palette = paletteForPS(summary.palermo_scale_cumulative);
  return (
    <div
      className={`flex h-full flex-col gap-1.5 rounded border ${palette.border} ${palette.bg} px-2.5 py-2`}
    >
      <div className="flex items-baseline justify-between">
        <h4 className="font-mono text-[10px] uppercase tracking-wider text-zinc-300">
          JPL Sentry-II
        </h4>
        <span className="font-mono text-[9px] text-zinc-500">{summary.method}</span>
      </div>
      <Row label="IP cum" value={formatIP(summary.impact_probability_cumulative)} />
      <Row label="PS cum" value={summary.palermo_scale_cumulative.toFixed(2)} valueClass={palette.text} />
      <Row label="PS max" value={summary.palermo_scale_max.toFixed(2)} />
      <Row label="VIs" value={summary.n_impacts.toString()} />
      <Row label="Years" value={summary.impact_year_range} />
    </div>
  );
}

function AegisColumn({ report }: { report: CrossValidationReport["aegis"] }) {
  if (report == null) {
    return (
      <SystemColumn
        title="ESA Aegis v5"
        status="not in list"
        statusTone="zinc"
        explanation="Aegis OD shows no near-term impact possibility."
      />
    );
  }
  const palette = paletteForPS(report.palermo_scale_cumulative);
  return (
    <div
      className={`flex h-full flex-col gap-1.5 rounded border ${palette.border} ${palette.bg} px-2.5 py-2`}
    >
      <div className="flex items-baseline justify-between">
        <h4 className="font-mono text-[10px] uppercase tracking-wider text-zinc-300">
          ESA Aegis v5
        </h4>
        <span className="font-mono text-[9px] text-zinc-500">TS {report.torino_scale}</span>
      </div>
      <Row label="IP cum" value={formatIP(report.impact_probability_cumulative)} />
      <Row label="PS cum" value={report.palermo_scale_cumulative.toFixed(2)} valueClass={palette.text} />
      <Row label="PS max" value={report.palermo_scale_max.toFixed(2)} />
      <Row label="IP max" value={formatIP(report.impact_probability_max)} />
      <Row label="Years" value={report.impact_year_range} />
    </div>
  );
}

function SystemColumn({
  title,
  status,
  statusTone = "zinc",
  secondary,
  explanation,
}: {
  title: string;
  status: string;
  statusTone?: "zinc" | "amber";
  secondary?: string;
  explanation?: string;
}) {
  const tone =
    statusTone === "amber"
      ? "border-amber-700/50 bg-amber-950/30 text-amber-200"
      : "border-zinc-800 bg-zinc-900/40 text-zinc-300";
  return (
    <div className={`flex h-full flex-col gap-1.5 rounded border ${tone} px-2.5 py-2`}>
      <h4 className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
        {title}
      </h4>
      <p className="font-mono text-[12px] text-zinc-200">{status}</p>
      {secondary && <p className="font-mono text-[10px] text-zinc-500">{secondary}</p>}
      {explanation && (
        <p className="text-[10px] leading-relaxed text-zinc-500">{explanation}</p>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <span className={`font-mono text-[11px] ${valueClass ?? "text-zinc-200"}`}>
        {value}
      </span>
    </div>
  );
}

export function CrossValidationPanel({ designation }: Props) {
  const [report, setReport] = useState<CrossValidationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setReport(null);
    api
      .crossValidation(designation)
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
      <div className="rounded border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[10px] text-zinc-500">
        <span className="animate-pulse">Cross-validating against JPL Sentry-II + ESA Aegis…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-200">
        ⚠ Cross-validation failed: {error}
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="space-y-2">
      <ConvergenceBanner report={report} />
      <div className="grid grid-cols-2 gap-2">
        <SentryColumn report={report.sentry} />
        <AegisColumn report={report.aegis} />
      </div>
      <p className="text-[10px] leading-relaxed text-zinc-500">
        Independent impact-monitoring verdicts from production planetary
        defense systems. neo-triage is a triage layer — it cross-validates
        against, but does not replace, JPL Sentry-II or ESA Aegis.
      </p>
    </div>
  );
}
