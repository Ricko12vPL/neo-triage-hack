interface Props {
  designation: string;
  arc_length_minutes: number;
  n_observations: number;
}

/**
 * Educational placeholder rendered in place of the impact corridor for
 * live MPC tracklets — they don't have an orbit determination yet
 * (that's literally what neo-triage exists to triage), so no corridor
 * can be projected. We surface this as a teaching moment rather than
 * silently hiding the panel: jurors and operators see the
 * triage → orbit → corridor pipeline plainly.
 *
 * Honest disclosure: the component never claims a corridor exists; it
 * explains why one doesn't and links the Phase 2 path (Find_Orb-style
 * orbit fits → JPL Sentry-II / ESA Aegis b-plane Monte Carlo).
 */
export function DeferredCorridorPlaceholder({
  designation,
  arc_length_minutes,
  n_observations,
}: Props) {
  return (
    <section className="border-t border-zinc-800 bg-zinc-950/40">
      <header className="flex items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/40 px-4 py-2">
        <div>
          <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
            Population at risk
          </h3>
          <p className="text-[10px] text-zinc-500">
            Why this candidate matters for planetary defense
          </p>
        </div>
        <span
          className="rounded border border-zinc-700 bg-zinc-900/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-300"
          title="Orbit determination is required before any impact corridor can be projected. neo-triage exists to surface candidates worth that compute."
        >
          deferred · pending OD
        </span>
      </header>

      <div className="px-4 py-3">
        <div className="rounded border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-[11px] leading-relaxed text-zinc-300">
          <p>
            <span className="font-mono uppercase tracking-wider text-zinc-200">
              Population risk deferred.
            </span>{" "}
            <span className="font-mono text-zinc-400">{designation}</span> has{" "}
            <span className="font-mono text-zinc-200">
              {arc_length_minutes.toFixed(0)} min
            </span>{" "}
            of arc across{" "}
            <span className="font-mono text-zinc-200">{n_observations}</span>{" "}
            observations — insufficient for the orbit determination that an
            impact corridor projection requires.
          </p>
          <p className="mt-2 text-zinc-400">
            <span className="text-zinc-300">neo-triage exists to triage</span>{" "}
            candidates <em>before</em> this stage. If this tracklet is followed
            up and confirmed → an orbit is fit → JPL Sentry-II / ESA Aegis can
            project a real impact corridor downstream.
          </p>
          <p className="mt-2 text-[10px] text-zinc-500">
            Phase 2:{" "}
            <a
              href="https://www.projectpluto.com/find_orb.htm"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 underline-offset-2 hover:text-zinc-300 hover:underline"
            >
              Find_Orb integration ↗
            </a>
            {" "}→ orbit fits in seconds → b-plane Monte Carlo for any tracklet
            that crosses the astrometric-quality threshold.
          </p>
        </div>
      </div>
    </section>
  );
}
