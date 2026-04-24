import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { DataSourceReport } from "../api/types";

/**
 * Small header pill that shows where the Live Feed candidates come from
 * and when the backend last refreshed them. Exists for jury transparency:
 * anyone can hit `/api/meta/data-source` and see the same fields, so
 * there is no hidden narrative.
 *
 * Primary source is currently `mock` (curated P21YR4A demo scenario);
 * the live NEOCP scraper is implemented and separately reachable at
 * `/api/candidates/` — this badge reports its live availability alongside.
 */
const SOURCE_POLL_MS = 60_000;

export function DataSourceBadge() {
  const [report, setReport] = useState<DataSourceReport | null>(null);
  const [error, setError] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await api.dataSource();
        if (!cancelled) {
          setReport(r);
          setError(false);
          setNowMs(Date.now());
        }
      } catch {
        if (!cancelled) setError(true);
      }
    };
    poll();
    const id = setInterval(poll, SOURCE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Re-render every 10s so the "N sec/min ago" label stays honest without
  // triggering a full refetch each tick. Keeps `nowMs` as state so render
  // stays pure (no Date.now() call during render).
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  if (error) {
    return (
      <div
        className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500"
        title="Could not reach /api/meta/data-source"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
        data · unknown
      </div>
    );
  }
  if (!report) {
    return (
      <div className="rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
        data · …
      </div>
    );
  }

  const retrievedAt = new Date(report.retrieved_at_utc);
  const ageMs = Math.max(0, nowMs - retrievedAt.getTime());
  const ageLabel = formatAge(ageMs);

  const sourceLabel =
    report.primary_source === "live_neocp"
      ? "Live NEOCP"
      : report.primary_source === "hybrid"
      ? "Hybrid"
      : "Demo candidates";
  const dotColor =
    report.primary_source === "live_neocp"
      ? "bg-emerald-500"
      : report.primary_source === "hybrid"
      ? "bg-amber-400"
      : "bg-sky-400";

  const liveBadge = report.live_feed_available
    ? `NEOCP scraper live (${report.live_feed_candidate_count ?? "?"} tracklets)`
    : "NEOCP scraper unavailable right now";

  const title =
    `${report.primary_description}\n\n` +
    `Primary source: ${report.primary_source} (${report.primary_count} objects)\n` +
    `Retrieved: ${retrievedAt.toISOString()}\n` +
    `${liveBadge}\n\n` +
    `Famous NEOs: ${report.famous_neos_count} objects, ` +
    `epoch JD ${report.famous_neos_epoch_jd}, ` +
    `verified ${report.famous_neos_last_verified}.\n\n` +
    `${report.notes}`;

  return (
    <div
      className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-300"
      title={title}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      <span className="text-zinc-100">data · {sourceLabel}</span>
      <span className="text-zinc-500">
        updated {ageLabel}
      </span>
    </div>
  );
}

function formatAge(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  return `${hrs}h ago`;
}
