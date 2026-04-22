import type { RankedCandidate } from "../api/types";

interface Props {
  candidates: RankedCandidate[];
  selected: string | null;
  onSelect: (trksub: string) => void;
  loading: boolean;
}

function classBadgeColor(cls: string): string {
  switch (cls) {
    case "NEO":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "MBA":
      return "bg-sky-500/15 text-sky-300 border-sky-500/30";
    case "COMET":
      return "bg-violet-500/15 text-violet-300 border-violet-500/30";
    case "ARTIFACT":
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
    default:
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
  }
}

function probBar(prob: number): string {
  if (prob >= 0.8) return "bg-emerald-500";
  if (prob >= 0.5) return "bg-amber-500";
  if (prob >= 0.2) return "bg-orange-500";
  return "bg-zinc-700";
}

export function CandidateList({
  candidates,
  selected,
  onSelect,
  loading,
}: Props) {
  return (
    <aside className="flex h-full flex-col border-r border-zinc-800 bg-zinc-950/40">
      <header className="border-b border-zinc-800 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          NEOCP Candidates
        </h2>
        <p className="mt-0.5 text-[11px] text-zinc-600">
          Ranked by P(NEO) · click to brief
        </p>
      </header>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <p className="p-4 text-sm text-zinc-500">Loading candidates…</p>
        )}

        {!loading && candidates.length === 0 && (
          <p className="p-4 text-sm text-zinc-500">No candidates returned.</p>
        )}

        <ul className="divide-y divide-zinc-900">
          {candidates.map((c) => {
            const isSelected = c.trksub === selected;
            const probNeo = c.prediction.prob_neo;
            return (
              <li key={c.trksub}>
                <button
                  onClick={() => onSelect(c.trksub)}
                  className={`block w-full px-4 py-3 text-left transition-colors ${
                    isSelected
                      ? "bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/30"
                      : "hover:bg-zinc-900/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm text-zinc-200">
                      {c.trksub}
                    </span>
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${classBadgeColor(
                        c.prediction.map_class,
                      )}`}
                    >
                      {c.prediction.map_class}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className={`h-full ${probBar(probNeo)}`}
                        style={{ width: `${(probNeo * 100).toFixed(1)}%` }}
                      />
                    </div>
                    <span className="w-12 text-right font-mono text-[11px] text-zinc-400">
                      {probNeo.toFixed(2)}
                    </span>
                  </div>

                  <div className="mt-2 grid grid-cols-3 gap-x-2 text-[10px] text-zinc-500">
                    <span>
                      d2 <span className="text-zinc-300">{c.digest2_neo_noid}</span>
                    </span>
                    <span>
                      V <span className="text-zinc-300">{c.mean_magnitude_v.toFixed(1)}</span>
                    </span>
                    <span>
                      r <span className="text-zinc-300">{c.rate_arcsec_min.toFixed(2)}″</span>
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
