import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, streamBriefing } from "./api/client";
import type { BriefingChunk, RankedCandidate, YR4Milestone } from "./api/types";
import { BriefingPanel, type BriefingHistoryEntry } from "./components/BriefingPanel";
import { CandidateList } from "./components/CandidateList";
import { CostMeter } from "./components/CostMeter";
import { DataSourceBadge } from "./components/DataSourceBadge";
import { PredictionCard } from "./components/PredictionCard";
import { AgentAlertBanner } from "./components/AgentAlertBanner";
import { AgentStatusIndicator } from "./components/AgentStatusIndicator";
import { ObserverLocationControl } from "./components/ObserverLocationControl";
import { YR4ReplayView } from "./components/YR4ReplayView";
import { useAgentFeed } from "./hooks/useAgentFeed";
import { useObserverLocation } from "./hooks/useObserverLocation";
import type { AgentEventNewCandidate } from "./api/types";

// Three.js is heavy — lazy-load only when user opens Sky View tab.
const SkyViewContainer = lazy(() =>
  import("./components/SkyViewContainer").then((m) => ({
    default: m.SkyViewContainer,
  })),
);

type StreamStatus = "idle" | "streaming" | "done" | "cache_hit" | "error";
type AppMode = "live" | "skyview" | "yr4replay";

const YR4_CROSS_SURVEY_CONTEXT =
  "ATLAS covered this region 6h ago to V=19.7 and saw nothing. CSS covered 14h ago to V=20.2 and saw nothing.";

export default function App() {
  const [mode, setMode] = useState<AppMode>("live");

  // Observer location (persisted to localStorage)
  const { location: observerLocation, setLocation: setObserverLocation } =
    useObserverLocation();

  // Live feed state
  const [candidates, setCandidates] = useState<RankedCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [reasoning, setReasoning] = useState("");
  const [briefing, setBriefing] = useState("");
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [streamError, setStreamError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Briefing history — session-scoped, last 20 entries
  const [briefingHistory, setBriefingHistory] = useState<BriefingHistoryEntry[]>([]);

  // YR4 replay state
  const [yr4Timeline, setYr4Timeline] = useState<YR4Milestone[]>([]);

  // Agent feed
  const { events, connectionStatus, agentStatus } = useAgentFeed();
  const newCandidateEvents = useMemo(
    () =>
      events.filter(
        (e): e is AgentEventNewCandidate => e.type === "new_candidate",
      ),
    [events],
  );

  // Load initial ranked candidates. Limit 50 covers the full live NEOCP
  // window (typically 20–50 active tracklets) plus the curated demo set.
  useEffect(() => {
    let cancelled = false;
    api
      .ranked(200)
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

  // Auto-refresh candidate list every 15 min — aligned with NEOCP cache TTL.
  // Silent background fetch: no loading state reset, errors swallowed.
  useEffect(() => {
    const id = setInterval(() => {
      api
        .ranked(200)
        .then(setCandidates)
        .catch(() => {});
    }, 15 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Load YR4 timeline when switching to replay mode
  useEffect(() => {
    if (mode !== "yr4replay" || yr4Timeline.length > 0) return;
    api.yr4Timeline().then(setYr4Timeline).catch(() => {});
  }, [mode, yr4Timeline.length]);

  // Merge agent-detected candidates into the ranked list
  const displayCandidates = useMemo(() => {
    const agentNew = newCandidateEvents.map(
      (e): RankedCandidate => ({ ...e.candidate, prediction: e.prediction }),
    );
    const agentTrksubs = new Set(agentNew.map((c) => c.trksub));
    const unique = agentNew.filter(
      (c, i, arr) => arr.findIndex((x) => x.trksub === c.trksub) === i,
    );
    return [...unique, ...candidates.filter((c) => !agentTrksubs.has(c.trksub))];
  }, [newCandidateEvents, candidates]);

  const selectedCandidate = useMemo(
    () => displayCandidates.find((c) => c.trksub === selected) ?? null,
    [displayCandidates, selected],
  );

  const handleSelect = useCallback(
    async (trksub: string) => {
      if (status === "streaming") abortRef.current?.abort();
      setSelected(trksub);
      setReasoning("");
      setBriefing("");
      setStatus("streaming");
      setStreamError(null);

      const candidate = displayCandidates.find((c) => c.trksub === trksub);
      if (!candidate) {
        setStatus("error");
        setStreamError(`Candidate ${trksub} not in list`);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      let accReasoning = "";
      let accBriefing = "";

      try {
        for await (const chunk of streamBriefing(
          {
            candidate: stripPrediction(candidate),
            prediction: candidate.prediction,
            cross_survey_context:
              candidate.trksub === "P21YR4A" ? YR4_CROSS_SURVEY_CONTEXT : null,
            include_reasoning: true,
            observer_location: `${observerLocation.label} (${observerLocation.latitude_deg > 0 ? "N" : "S"}${Math.abs(observerLocation.latitude_deg).toFixed(1)}°, ${observerLocation.longitude_deg > 0 ? "E" : "W"}${Math.abs(observerLocation.longitude_deg).toFixed(1)}°)`,
          },
          controller.signal,
        )) {
          if (chunk.type === "reasoning" || chunk.type === "thinking") {
            accReasoning += chunk.content;
          } else if (chunk.type === "text") {
            accBriefing += chunk.content;
          }
          handleChunk(chunk, {
            setReasoning,
            setBriefing,
            setStatus,
            setStreamError,
          });

          if (chunk.type === "done" && accBriefing) {
            setBriefingHistory((prev) => {
              const entry: BriefingHistoryEntry = {
                trksub,
                reasoning: accReasoning,
                briefing: accBriefing,
                timestamp: new Date(),
                from_cache: chunk.content === "cache_hit",
              };
              // deduplicate: remove old entry for same trksub, add new at end
              const without = prev.filter((h) => h.trksub !== trksub);
              return [...without, entry].slice(-20);
            });
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setStreamError((err as Error).message);
        setStatus("error");
      }
    },
    [displayCandidates, status, observerLocation],
  );

  return (
    <div className="grid h-screen grid-rows-[auto_1fr] bg-zinc-950 text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-zinc-800 bg-zinc-950/80 px-5 py-3 backdrop-blur">
        <div>
          <h1 className="text-sm font-semibold tracking-tight text-zinc-100">
            neo-triage
          </h1>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Bayesian NEO follow-up · Claude Opus 4.7 reasoning
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Mode tabs */}
          <div className="flex rounded bg-zinc-900 p-0.5 text-[11px]">
            <button
              onClick={() => setMode("live")}
              className={[
                "rounded px-3 py-1 font-mono uppercase tracking-wider transition-colors",
                mode === "live"
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300",
              ].join(" ")}
            >
              Live Feed
            </button>
            <button
              onClick={() => setMode("skyview")}
              className={[
                "rounded px-3 py-1 font-mono uppercase tracking-wider transition-colors",
                mode === "skyview"
                  ? "bg-sky-900/80 text-sky-200"
                  : "text-zinc-500 hover:text-zinc-300",
              ].join(" ")}
            >
              Sky View
            </button>
            <button
              onClick={() => setMode("yr4replay")}
              className={[
                "rounded px-3 py-1 font-mono uppercase tracking-wider transition-colors",
                mode === "yr4replay"
                  ? "bg-red-900/80 text-red-200"
                  : "text-zinc-500 hover:text-zinc-300",
              ].join(" ")}
            >
              2024 YR4 Replay
            </button>
          </div>

          <ObserverLocationControl
            location={observerLocation}
            onLocationChange={setObserverLocation}
          />
          <AgentStatusIndicator
            agentStatus={agentStatus}
            connectionStatus={connectionStatus}
          />
          <DataSourceBadge />
          <CostMeter />
        </div>
      </header>

      {/* Alert banner — overlaid, not in flow */}
      <AgentAlertBanner
        events={newCandidateEvents}
        onSelect={(trksub) => {
          setMode("live");
          handleSelect(trksub);
        }}
      />

      {mode === "live" && (
        // grid-rows-[minmax(0,1fr)] on md+ constrains the single row to
        // the parent's height instead of letting auto-rows grow with
        // content. Without this, agent-pushed candidates (live-NEOCP
        // tracklets that arrive over WebSocket on top of the 10 ranked
        // mocks) made the aside taller than the viewport — overflow-
        // hidden on main clipped the bottom rows and the inner
        // overflow-y-auto could not trigger because the aside itself
        // was not height-constrained.
        <main className="grid grid-rows-[auto_1fr] overflow-hidden md:grid-cols-[320px_1fr] md:grid-rows-[minmax(0,1fr)]">
          <CandidateList
            candidates={displayCandidates}
            selected={selected}
            onSelect={handleSelect}
            loading={loading}
            observerLocation={observerLocation}
          />

          <section className="flex flex-col overflow-hidden">
            {loadError ? (
              <div className="flex h-full items-center justify-center px-6 text-sm text-red-300">
                Failed to load candidates: {loadError}
              </div>
            ) : selectedCandidate ? (
              <>
                <PredictionCard
                  candidate={selectedCandidate}
                  observerLocation={observerLocation}
                />
                <BriefingPanel
                  reasoning={reasoning}
                  briefing={briefing}
                  status={status}
                  error={streamError}
                  trksub={selected}
                  history={briefingHistory}
                  onHistoryRestore={(entry) => {
                    setSelected(entry.trksub);
                    setReasoning(entry.reasoning);
                    setBriefing(entry.briefing);
                    setStatus(entry.from_cache ? "cache_hit" : "done");
                    setStreamError(null);
                  }}
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
      )}

      {mode === "skyview" && (
        <main className="overflow-hidden">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                Loading sky view…
              </div>
            }
          >
            <SkyViewContainer
              candidates={displayCandidates}
              selectedTrksub={selected}
              onOpenFullBriefing={(trksub) => {
                setMode("live");
                handleSelect(trksub);
              }}
            />
          </Suspense>
        </main>
      )}

      {mode === "yr4replay" && (
        <main className="overflow-hidden">
          {yr4Timeline.length > 0 ? (
            <YR4ReplayView timeline={yr4Timeline} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
              Loading 2024 YR4 timeline…
            </div>
          )}
        </main>
      )}
    </div>
  );
}

function stripPrediction(candidate: RankedCandidate) {
  const { prediction: _, ...bare } = candidate;
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
      break;
  }
}
