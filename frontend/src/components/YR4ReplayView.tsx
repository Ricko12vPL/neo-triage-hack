import { useCallback, useRef, useState } from "react";
import { streamReplayBrief, streamYr4Alert } from "../api/client";
import type { BriefingChunk, YR4Milestone } from "../api/types";
import { BriefingPanel } from "./BriefingPanel";

interface Props {
  timeline: YR4Milestone[];
}

type StreamStatus = "idle" | "streaming" | "done" | "cache_hit" | "error";

export function YR4ReplayView({ timeline }: Props) {
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [reasoning, setReasoning] = useState("");
  const [briefing, setBriefing] = useState("");
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [alertText, setAlertText] = useState("");
  const [alertStreaming, setAlertStreaming] = useState(false);
  const [alertDone, setAlertDone] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const selectedMilestone = timeline.find((m) => m.hour === selectedHour) ?? null;
  const torino3Reached = selectedHour !== null && selectedHour >= 18;

  const selectMilestone = useCallback(
    async (hour: number) => {
      if (status === "streaming") abortRef.current?.abort();
      setSelectedHour(hour);
      setReasoning("");
      setBriefing("");
      setStatus("streaming");
      setStreamError(null);
      setAlertText("");
      setAlertDone(false);

      try {
        for await (const chunk of streamReplayBrief(hour)) {
          handleChunk(chunk, { setReasoning, setBriefing, setStatus, setStreamError });
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setStreamError((err as Error).message);
          setStatus("error");
        }
      }
    },
    [status],
  );

  const generateAlert = useCallback(async () => {
    if (alertStreaming) return;
    setAlertText("");
    setAlertDone(false);
    setAlertStreaming(true);

    try {
      for await (const chunk of streamYr4Alert()) {
        if (chunk.type === "text") {
          setAlertText((prev) => prev + chunk.content);
        } else if (chunk.type === "done" || chunk.type === "error") {
          setAlertDone(true);
        }
      }
    } catch {
      setAlertDone(true);
    } finally {
      setAlertStreaming(false);
    }
  }, [alertStreaming]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Timeline scrubber */}
      <div className="border-b border-zinc-800 bg-zinc-950/60 px-6 py-4">
        <div className="mb-3 text-[11px] uppercase tracking-wider text-zinc-500">
          2024 YR4 — event timeline
        </div>
        <div className="relative flex items-center gap-0">
          {/* Connector line */}
          <div className="absolute left-0 right-0 top-1/2 h-px bg-zinc-700" />
          {timeline.map((m) => {
            const active = m.hour === selectedHour;
            const isTorino = m.hour === 18;
            const color =
              m.prob_pha_estimate >= 0.9
                ? "border-red-500 bg-red-950"
                : m.prob_pha_estimate >= 0.5
                  ? "border-orange-500 bg-orange-950"
                  : m.prob_pha_estimate >= 0.3
                    ? "border-amber-500 bg-amber-950"
                    : "border-zinc-600 bg-zinc-900";
            return (
              <button
                key={m.hour}
                onClick={() => selectMilestone(m.hour)}
                className={[
                  "relative z-10 flex flex-1 flex-col items-center gap-1.5 px-1",
                ].join(" ")}
              >
                <div
                  className={[
                    "h-3 w-3 rounded-full border-2 transition-all duration-200",
                    color,
                    active ? "scale-150 ring-2 ring-white/30" : "hover:scale-125",
                    isTorino && !active ? "animate-pulse" : "",
                  ].join(" ")}
                />
                <span
                  className={[
                    "font-mono text-[10px] transition-colors",
                    active ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300",
                  ].join(" ")}
                >
                  +{m.hour}h
                </span>
                {isTorino && (
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-red-900/80 px-1.5 py-0.5 text-[9px] text-red-300">
                    Torino 3
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: milestone state */}
        <div className="w-64 shrink-0 overflow-y-auto border-r border-zinc-800 bg-zinc-950/30 px-4 py-4">
          {selectedMilestone ? (
            <MilestoneCard milestone={selectedMilestone} />
          ) : (
            <p className="text-[12px] italic text-zinc-600">
              Select a milestone on the timeline to load Claude&apos;s
              assessment at that moment.
            </p>
          )}
        </div>

        {/* Right: briefing + alert */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <BriefingPanel
            reasoning={reasoning}
            briefing={briefing}
            status={status}
            error={streamError}
          />

          {/* YR4 Alert panel — only when Torino 3 reached */}
          {torino3Reached && (
            <div
              className={[
                "border-t border-red-900/60 bg-red-950/20 px-6 py-4",
                "transition-all duration-500",
              ].join(" ")}
            >
              <div className="mb-3 flex items-center gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-red-400">
                  ⚠ Torino Scale 3 — Global Alert
                </span>
                <button
                  onClick={generateAlert}
                  disabled={alertStreaming}
                  className={[
                    "rounded px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-all",
                    alertStreaming
                      ? "cursor-not-allowed bg-red-900/40 text-red-600"
                      : "animate-pulse bg-red-600 text-white hover:bg-red-500 hover:animate-none",
                  ].join(" ")}
                >
                  {alertStreaming ? "Generating…" : "Generate Alert Now"}
                </button>
              </div>

              {alertText && (
                <div
                  className={[
                    "rounded border px-4 py-3 font-mono text-[13px] leading-relaxed",
                    alertDone
                      ? "border-red-700/50 text-red-100"
                      : "border-red-800/30 text-red-200",
                  ].join(" ")}
                >
                  {alertText}
                  {alertStreaming && (
                    <span className="ml-1 inline-block h-3 w-0.5 animate-pulse bg-red-400" />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MilestoneCard({ milestone: m }: { milestone: YR4Milestone }) {
  const phaColor =
    m.prob_pha_estimate >= 0.9
      ? "text-red-400"
      : m.prob_pha_estimate >= 0.5
        ? "text-orange-400"
        : m.prob_pha_estimate >= 0.3
          ? "text-amber-400"
          : "text-zinc-400";

  return (
    <div className="space-y-3 text-[12px]">
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-600">
          2024 YR4 · Hour +{m.hour}
        </div>
        <div className="font-semibold text-zinc-200">{m.event_description}</div>
      </div>

      <div className="space-y-1 font-mono">
        <Row label="Observations" value={String(m.n_observations)} />
        <Row
          label="Arc"
          value={`${(m.arc_length_minutes / 60).toFixed(1)}h`}
        />
        <Row label="V mag" value={m.mean_magnitude_v.toFixed(1)} />
        <Row
          label="Rate"
          value={`${m.rate_arcsec_min.toFixed(1)}"/min`}
        />
        <Row label="digest2" value={`${m.digest2_neo_noid}/100`} />
      </div>

      <div className="space-y-1 rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2 font-mono">
        <div className="text-[10px] uppercase tracking-wider text-zinc-600">
          Model posterior
        </div>
        <div>
          <span className="text-zinc-500">P(NEO) = </span>
          <span className="text-emerald-400">
            {m.prob_neo_estimate.toFixed(2)}
          </span>
        </div>
        <div>
          <span className="text-zinc-500">P(PHA) = </span>
          <span className={phaColor}>{m.prob_pha_estimate.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-zinc-500">Class: </span>
          <span className="text-zinc-200">{m.map_class}</span>
          {m.is_pha && (
            <span className="ml-2 font-semibold text-red-400">PHA</span>
          )}
        </div>
      </div>

      <div className="text-zinc-600 italic">{m.narrative_context}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-zinc-600">{label}</span>
      <span className="text-zinc-300">{value}</span>
    </div>
  );
}

function handleChunk(
  chunk: BriefingChunk,
  s: {
    setReasoning: (fn: (prev: string) => string) => void;
    setBriefing: (fn: (prev: string) => string) => void;
    setStatus: (v: StreamStatus) => void;
    setStreamError: (e: string | null) => void;
  },
) {
  switch (chunk.type) {
    case "reasoning":
    case "thinking":
      s.setReasoning((prev) => prev + chunk.content);
      break;
    case "text":
      s.setBriefing((prev) => prev + chunk.content);
      break;
    case "done":
      s.setStatus(chunk.content === "cache_hit" ? "cache_hit" : "done");
      break;
    case "error":
      s.setStreamError(chunk.content);
      s.setStatus("error");
      break;
    case "meta":
      break;
  }
}
