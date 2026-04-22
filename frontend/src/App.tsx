import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, streamBriefing } from "./api/client";
import type { BriefingChunk, RankedCandidate } from "./api/types";
import { BriefingPanel } from "./components/BriefingPanel";
import { CandidateList } from "./components/CandidateList";
import { CostMeter } from "./components/CostMeter";
import { PredictionCard } from "./components/PredictionCard";

type StreamStatus = "idle" | "streaming" | "done" | "cache_hit" | "error";

const YR4_CROSS_SURVEY_CONTEXT =
  "ATLAS covered this region 6h ago to V=19.7 and saw nothing. CSS covered 14h ago to V=20.2 and saw nothing.";

export default function App() {
  const [candidates, setCandidates] = useState<RankedCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [reasoning, setReasoning] = useState("");
  const [briefing, setBriefing] = useState("");
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [streamError, setStreamError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Initial candidate load
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .ranked(10)
      .then((items) => {
        if (cancelled) return;
        setCandidates(items);
        setLoadError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCandidate = useMemo(
    () => candidates.find((c) => c.trksub === selected) ?? null,
    [candidates, selected],
  );

  const handleSelect = useCallback(
    async (trksub: string) => {
      if (status === "streaming") {
        abortRef.current?.abort();
      }
      setSelected(trksub);
      setReasoning("");
      setBriefing("");
      setStatus("streaming");
      setStreamError(null);

      const candidate = candidates.find((c) => c.trksub === trksub);
      if (!candidate) {
        setStatus("error");
        setStreamError(`Candidate ${trksub} not in list`);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        for await (const chunk of streamBriefing(
          {
            candidate: stripPrediction(candidate),
            prediction: candidate.prediction,
            cross_survey_context:
              candidate.trksub === "P21YR4A" ? YR4_CROSS_SURVEY_CONTEXT : null,
            include_reasoning: true,
          },
          controller.signal,
        )) {
          handleChunk(chunk, {
            setReasoning,
            setBriefing,
            setStatus,
            setStreamError,
          });
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setStreamError((err as Error).message);
        setStatus("error");
      }
    },
    [candidates, status],
  );

  return (
    <div className="grid h-screen grid-rows-[auto_1fr] bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-5 py-3 backdrop-blur">
        <div>
          <h1 className="text-sm font-semibold tracking-tight text-zinc-100">
            neo-triage
          </h1>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Bayesian NEO follow-up · Claude Opus 4.7 reasoning
          </p>
        </div>
        <CostMeter />
      </header>

      <main className="grid grid-cols-[320px_1fr] overflow-hidden">
        <CandidateList
          candidates={candidates}
          selected={selected}
          onSelect={handleSelect}
          loading={loading}
        />

        <section className="flex flex-col overflow-hidden">
          {loadError ? (
            <div className="flex h-full items-center justify-center px-6 text-sm text-red-300">
              Failed to load candidates: {loadError}
            </div>
          ) : selectedCandidate ? (
            <>
              <PredictionCard candidate={selectedCandidate} />
              <BriefingPanel
                reasoning={reasoning}
                briefing={briefing}
                status={status}
                error={streamError}
              />
            </>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-sm text-zinc-500">
              Select a candidate from the left panel to load a Claude
              briefing.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function stripPrediction(candidate: RankedCandidate) {
  const { prediction: _prediction, ...bare } = candidate;
  return bare;
}

interface ChunkSetters {
  setReasoning: (fn: (prev: string) => string) => void;
  setBriefing: (fn: (prev: string) => string) => void;
  setStatus: (s: StreamStatus) => void;
  setStreamError: (e: string | null) => void;
}

function handleChunk(chunk: BriefingChunk, s: ChunkSetters) {
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
      // No-op for now.
      break;
  }
}
