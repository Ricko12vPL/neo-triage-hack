import { useState } from "react";
import { api } from "../api/client";

/**
 * Operator-only demo helper. Visible when the URL has `?demo=1` or
 * localStorage flag `demo-mode=1`. Buttons fire
 * POST /api/agent/inject-synthetic with predefined templates so demo
 * recordings can hit the climax moments on cue regardless of MPC mood.
 *
 * The synthetic event arrives in the WebSocket payload with
 * source=SYNTHETIC_INJECTION, the candidate carries
 * data_source=SYNTHETIC_INJECTION, and the UI renders an explicit
 * orange "⚡ SYNTHETIC" badge — never confused with a real MPC tracklet.
 */
const TEMPLATES: Array<{
  id: "p21yr4a_replay" | "p21lowrt_dissent" | "high_confidence_neo";
  label: string;
  hint: string;
}> = [
  {
    id: "p21yr4a_replay",
    label: "Inject P21YR4A",
    hint: "Hazardous YR4 analogue · drives high-stakes briefing",
  },
  {
    id: "p21lowrt_dissent",
    label: "Inject P21LOWRT",
    hint: "Opus DISSENT case · climax for hybrid-classifier moment",
  },
  {
    id: "high_confidence_neo",
    label: "Inject high-conf NEO",
    hint: "Routine NEO with calibrated CONCUR review",
  },
];

function isEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") === "1") return true;
  return window.localStorage.getItem("demo-mode") === "1";
}

export function DemoInjectionMenu() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!isEnabled()) return null;

  const trigger = async (template: typeof TEMPLATES[number]["id"]) => {
    setBusy(template);
    setFeedback(null);
    try {
      const res = await api.injectSynthetic(template);
      setFeedback(
        `→ ${res.injected_trksub} (${res.expert_review_endorsement ?? "no review"})`,
      );
    } catch (e) {
      setFeedback(`error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
          open
            ? "border-orange-700/70 bg-orange-950/70 text-orange-200"
            : "border-orange-800/40 bg-zinc-900/70 text-orange-400 hover:bg-orange-950/40"
        }`}
        title="Operator-only: trigger synthetic NEOCP events for demo recording"
        aria-expanded={open}
      >
        ⚡ Demo inject
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded border border-zinc-700 bg-zinc-900/95 p-2 shadow-xl backdrop-blur-sm">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-orange-300">
              ⚡ Synthetic injection
            </span>
            <button
              onClick={() => setOpen(false)}
              className="text-[10px] text-zinc-500 hover:text-zinc-300"
            >
              ✕
            </button>
          </div>
          <p className="mb-2 text-[10px] leading-relaxed text-zinc-500">
            Triggers a labelled synthetic event. UI shows orange badge —
            this is honest disclosure, not a real MPC tracklet.
          </p>
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => trigger(t.id)}
              disabled={busy !== null}
              className="mb-1 block w-full rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1.5 text-left transition-colors hover:bg-zinc-900 disabled:opacity-60"
            >
              <div className="font-mono text-[11px] text-orange-200">
                {busy === t.id ? "…firing" : t.label}
              </div>
              <div className="text-[10px] text-zinc-500">{t.hint}</div>
            </button>
          ))}
          {feedback && (
            <div className="mt-1.5 rounded border border-zinc-800 bg-zinc-950/80 px-2 py-1 font-mono text-[10px] text-emerald-300">
              {feedback}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
