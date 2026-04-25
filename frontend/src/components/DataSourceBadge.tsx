import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { DataSourceReport, StreamReport } from "../api/types";

/**
 * Header transparency widget. Renders three stacked pills (or one
 * compact strip on narrow screens) so the operator can see at a
 * glance how fresh each stream is:
 *
 *   ◉ MPC LIVE  · 47 · 47s ago
 *   ◆ DEMO      · 11 · static
 *   ⚡ SYNTHETIC · N · idle | last 12s ago
 *
 * Polls /api/meta/data-source every 10s for fresh per-stream meta.
 */
const POLL_MS = 10_000;
const TICK_MS = 5_000;

function relativeAge(iso: string | null | undefined, now: number): string | null {
  if (!iso) return null;
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const sec = Math.floor(ms / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

const ICON: Record<StreamReport["source"], string> = {
  LIVE_MPC_NEOCP: "◉",
  DEMO_FIXTURE: "◆",
  SYNTHETIC_INJECTION: "⚡",
};

const TONE: Record<
  StreamReport["source"],
  { dot: string; text: string; border: string; pulse?: boolean }
> = {
  LIVE_MPC_NEOCP: {
    dot: "bg-emerald-400",
    text: "text-emerald-200",
    border: "border-emerald-700/60",
  },
  DEMO_FIXTURE: {
    dot: "bg-violet-400",
    text: "text-violet-200",
    border: "border-violet-700/60",
  },
  SYNTHETIC_INJECTION: {
    dot: "bg-orange-400",
    text: "text-orange-200",
    border: "border-orange-700/60",
    pulse: true,
  },
};

function StreamPill({ stream, now }: { stream: StreamReport; now: number }) {
  const tone = TONE[stream.source];
  let freshness: string;
  if (stream.fetch_status === "ERROR") {
    freshness = "error";
  } else if (stream.source === "DEMO_FIXTURE") {
    freshness = "static";
  } else if (stream.source === "SYNTHETIC_INJECTION") {
    const age = relativeAge(stream.last_fetched_at_utc, now);
    freshness = age ? `last ${age}` : "idle";
  } else {
    const age = relativeAge(stream.last_fetched_at_utc, now);
    freshness = age ?? "—";
  }
  const showPulse =
    stream.source === "SYNTHETIC_INJECTION" && stream.candidate_count > 0;
  const tooltip =
    `${stream.label} — ${stream.description}` +
    (stream.url ? `\n${stream.url}` : "");
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px]",
        tone.border,
        tone.text,
        showPulse ? "animate-pulse" : "",
      ].join(" ")}
      title={tooltip}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      <span aria-hidden>{ICON[stream.source]}</span>
      <span className="uppercase tracking-wide">{stream.label}</span>
      <span className="text-zinc-500">·</span>
      <span className="text-zinc-300">{stream.candidate_count}</span>
      <span className="text-zinc-500">·</span>
      <span className="text-zinc-500">{freshness}</span>
    </span>
  );
}

export function DataSourceBadge() {
  const [report, setReport] = useState<DataSourceReport | null>(null);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await api.dataSource();
        if (!cancelled) {
          setReport(r);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const streams = useMemo(() => report?.streams ?? [], [report]);

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
        data · unknown
      </div>
    );
  }
  if (!report) {
    return (
      <div className="rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
        data · …
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {streams.map((s) => (
        <StreamPill key={s.source} stream={s} now={now} />
      ))}
    </div>
  );
}
