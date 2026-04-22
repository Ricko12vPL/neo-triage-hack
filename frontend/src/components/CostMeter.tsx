import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { CostSummary } from "../api/types";

const POLL_INTERVAL_MS = 10_000;

export function CostMeter() {
  const [cost, setCost] = useState<CostSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const c = await api.cost();
        if (!cancelled) setCost(c);
      } catch {
        // Silent — cost meter is informational, not blocking.
      }
    };
    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!cost) {
    return (
      <div className="font-mono text-[11px] text-zinc-600">
        cost meter starting…
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 font-mono text-[11px]">
      <span className="text-zinc-500">opus 4.7</span>
      <span className="text-zinc-200">${cost.total_spent_usd.toFixed(3)}</span>
      <span className="text-zinc-600">·</span>
      <span className="text-zinc-400">{cost.n_calls} calls</span>
      <span className="text-zinc-600">·</span>
      <span className="text-zinc-500">
        ${cost.budget_remaining_usd.toFixed(2)} left
      </span>
    </div>
  );
}
