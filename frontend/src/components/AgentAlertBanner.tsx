import { useEffect, useRef, useState } from "react";
import type { AgentEventNewCandidate } from "../api/types";

interface Alert {
  id: number;
  event: AgentEventNewCandidate;
}

let _nextId = 0;

interface Props {
  events: AgentEventNewCandidate[];
  onSelect: (trksub: string) => void;
}

export function AgentAlertBanner({ events, onSelect }: Props) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  // Track which events we've already converted to avoid duplicate alerts
  const seenCount = useRef(0);

  useEffect(() => {
    if (events.length <= seenCount.current) return;
    // Only process genuinely new events
    const newEvents = events.slice(seenCount.current);
    seenCount.current = events.length;

    newEvents.forEach((event) => {
      const id = _nextId++;
      setAlerts((prev) => [...prev.slice(-2), { id, event }]);
      setTimeout(() => {
        setAlerts((prev) => prev.filter((a) => a.id !== id));
      }, 10_000);
    });
  }, [events]);

  if (alerts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-16 z-50 flex flex-col gap-2">
      {alerts.map((a) => {
        const isPha = a.event.prediction.prob_pha > 0.5;
        return (
          <button
            key={a.id}
            onClick={() => {
              onSelect(a.event.candidate.trksub);
              setAlerts((prev) => prev.filter((x) => x.id !== a.id));
            }}
            className={[
              "pointer-events-auto flex max-w-xs flex-col gap-1 rounded border px-3 py-2",
              "text-left text-[11px] shadow-lg transition-all duration-300",
              "bg-zinc-900/95 backdrop-blur",
              isPha
                ? "border-red-500 text-red-200"
                : "border-amber-500 text-amber-200",
            ].join(" ")}
          >
            <div className="flex items-center gap-2 font-mono font-semibold uppercase tracking-wider">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${isPha ? "bg-red-400 animate-pulse" : "bg-amber-400"}`}
              />
              New object: {a.event.candidate.trksub}
            </div>
            <div className="text-zinc-400">
              score {a.event.candidate.digest2_neo_noid} · P(NEO)={" "}
              {a.event.prediction.prob_neo.toFixed(2)}
              {isPha && (
                <span className="ml-2 font-semibold text-red-300">
                  ⚠ P(PHA)={a.event.prediction.prob_pha.toFixed(2)}
                </span>
              )}
            </div>
            {a.event.briefing_preview && (
              <div className="mt-0.5 text-zinc-500 line-clamp-2">
                {a.event.briefing_preview}
              </div>
            )}
            <div className="mt-0.5 text-zinc-600">Click to open briefing</div>
          </button>
        );
      })}
    </div>
  );
}
