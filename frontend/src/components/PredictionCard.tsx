import type { Prediction, RankedCandidate } from "../api/types";

interface Props {
  candidate: RankedCandidate;
}

function ProbCell({
  label,
  value,
  ci,
}: {
  label: string;
  value: number;
  ci?: [number, number];
}) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className="mt-1 font-mono text-base text-zinc-100">
        {value.toFixed(3)}
      </div>
      {ci && (
        <div className="mt-0.5 font-mono text-[10px] text-zinc-500">
          90% CI [{ci[0].toFixed(3)}, {ci[1].toFixed(3)}]
        </div>
      )}
    </div>
  );
}

export function PredictionCard({ candidate }: Props) {
  const c = candidate;
  const p: Prediction = candidate.prediction;
  return (
    <section className="border-b border-zinc-800 bg-zinc-950/40 px-4 py-3">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-medium text-zinc-100">
            {c.trksub}
          </h1>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {c.observatory_code} ·{" "}
            {new Date(c.first_obs_datetime).toISOString().slice(0, 19)}Z · arc{" "}
            {c.arc_length_minutes.toFixed(0)}min · {c.n_observations} obs
          </p>
        </div>
        <span className="rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1 font-mono text-[10px] text-zinc-400">
          {p.model_version}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ProbCell label="P(NEO)" value={p.prob_neo} ci={p.prob_neo_ci_90} />
        <ProbCell label="P(PHA)" value={p.prob_pha} />
        <div className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            MAP class
          </div>
          <div className="mt-1 font-mono text-base text-zinc-100">
            {p.map_class}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-zinc-500">
            entropy {p.uncertainty_entropy_bits.toFixed(2)} bits
          </div>
        </div>
        <div className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            Photometry
          </div>
          <div className="mt-1 font-mono text-base text-zinc-100">
            V {c.mean_magnitude_v.toFixed(2)}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-zinc-500">
            d2={c.digest2_neo_noid} · {c.rate_arcsec_min.toFixed(2)}″/min
          </div>
        </div>
      </div>
    </section>
  );
}
