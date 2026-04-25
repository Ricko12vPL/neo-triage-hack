import type { ExpertReview } from "../api/types";

/**
 * Expanded reasoning panel — sits BELOW CandidateDetailsPanel when an
 * expert review exists for the selected candidate. Distinct violet
 * accent so the operator instantly sees this is "the second opinion",
 * not the ranker output.
 *
 * Sections (top → bottom):
 *   - Header: OPUS 4.7 EXPERT REVIEW + endorsement badge + thinking-token count
 *   - Verdict: endorsed_class + confidence_match
 *   - Reasoning: 2–4 paragraphs, monospace, scrollable
 *   - Caveats: list, severity-coloured
 *   - Suggested action: large styled call-to-action
 *   - Footer: cost_usd, reviewed_at_utc, cache_hit indicator
 */
interface Props {
  review: ExpertReview;
}

const ENDORSEMENT_STYLE: Record<
  ExpertReview["class_endorsement"],
  { bg: string; text: string; border: string; label: string }
> = {
  CONCUR: {
    bg: "bg-emerald-900/40",
    text: "text-emerald-200",
    border: "border-emerald-700",
    label: "CONCUR",
  },
  PARTIAL_CONCUR: {
    bg: "bg-amber-900/40",
    text: "text-amber-200",
    border: "border-amber-700",
    label: "PARTIAL CONCUR",
  },
  DISSENT: {
    bg: "bg-rose-900/50",
    text: "text-rose-200",
    border: "border-rose-700",
    label: "DISSENT",
  },
};

const SEVERITY_STYLE: Record<
  ExpertReview["caveats"][number]["severity"],
  string
> = {
  INFO: "border-zinc-600 bg-zinc-900/60 text-zinc-300",
  WARN: "border-amber-700 bg-amber-950/50 text-amber-200",
  CRITICAL: "border-rose-700 bg-rose-950/60 text-rose-200",
};

const ACTION_LABEL: Record<ExpertReview["suggested_action"], string> = {
  follow_up_immediately: "Follow up immediately",
  queue_normal: "Queue at normal priority",
  request_second_epoch: "Request a second epoch",
  deprioritize: "De-prioritise",
  monitor: "Monitor only",
};

const ACTION_TONE: Record<ExpertReview["suggested_action"], string> = {
  follow_up_immediately: "border-rose-600 bg-rose-950/70 text-rose-100",
  queue_normal: "border-emerald-700 bg-emerald-950/60 text-emerald-100",
  request_second_epoch: "border-violet-600 bg-violet-950/70 text-violet-100",
  deprioritize: "border-zinc-600 bg-zinc-900/70 text-zinc-300",
  monitor: "border-sky-700 bg-sky-950/70 text-sky-100",
};

export function ExpertReviewPanel({ review }: Props) {
  const endorsement = ENDORSEMENT_STYLE[review.class_endorsement];
  const reviewedAt = new Date(review.reviewed_at_utc).toUTCString();
  return (
    <section
      className="border-t-2 border-violet-700/60 bg-zinc-950/80 p-4"
      aria-label="Opus 4.7 expert review"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-mono text-[11px] uppercase tracking-widest text-violet-300">
            🧠 Opus 4.7 expert review
          </h3>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            Hybrid classifier · second opinion on the Bayesian ranker
          </p>
        </div>
        <span
          className={[
            "rounded border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider",
            endorsement.bg,
            endorsement.text,
            endorsement.border,
          ].join(" ")}
        >
          {endorsement.label}
        </span>
      </header>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
        <div>
          <dt className="text-zinc-500">Endorsed class</dt>
          <dd className="mt-0.5 font-mono text-zinc-100">{review.endorsed_class}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Confidence match</dt>
          <dd className="mt-0.5 font-mono text-zinc-100">
            {review.confidence_match}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Thinking</dt>
          <dd className="mt-0.5 font-mono text-zinc-300">
            {review.thinking_tokens_used.toLocaleString()} tokens
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Output</dt>
          <dd className="mt-0.5 font-mono text-zinc-300">
            {review.output_tokens_used.toLocaleString()} tokens
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <h4 className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          Reasoning
        </h4>
        <div className="mt-1.5 max-h-72 overflow-y-auto whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950/60 p-3 font-mono text-[12px] leading-relaxed text-zinc-200">
          {review.reasoning_trace}
        </div>
      </div>

      {review.quality_acknowledgment && (
        <div className="mt-4">
          <h4 className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            Quality acknowledgment
          </h4>
          <div
            className="mt-1.5 rounded border border-zinc-800 bg-zinc-950/40 px-3 py-2 font-mono text-[11px] italic leading-relaxed text-zinc-300"
            title="How Opus weighted Find_Orb-style astrometric quality in its endorsement"
          >
            {review.quality_acknowledgment}
          </div>
        </div>
      )}

      {review.caveats.length > 0 && (
        <div className="mt-4">
          <h4 className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            Caveats
          </h4>
          <ul className="mt-1.5 space-y-1.5">
            {review.caveats.map((caveat, i) => (
              <li
                key={`${caveat.code}-${i}`}
                className={[
                  "rounded border px-3 py-2 text-[11px]",
                  SEVERITY_STYLE[caveat.severity],
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider opacity-80">
                    {caveat.severity} · {caveat.code}
                  </span>
                </div>
                <p className="mt-1 leading-relaxed">{caveat.explanation}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <h4 className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          Suggested action
        </h4>
        <div
          className={[
            "mt-1.5 rounded border px-4 py-2 text-center font-mono text-[12px] font-semibold uppercase tracking-wider",
            ACTION_TONE[review.suggested_action],
          ].join(" ")}
        >
          {ACTION_LABEL[review.suggested_action]}
        </div>
      </div>

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-900 pt-2 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
        <span>{review.model}</span>
        <span>${review.cost_usd.toFixed(4)} · {reviewedAt}</span>
        <span
          className={
            review.cache_hit ? "text-emerald-400" : "text-violet-400"
          }
        >
          {review.cache_hit ? "cache hit" : "fresh"}
        </span>
      </footer>
    </section>
  );
}
