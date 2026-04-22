import type { AgentStatus } from "../api/types";
import type { WsConnectionStatus } from "../hooks/useAgentFeed";

interface Props {
  agentStatus: AgentStatus | null;
  connectionStatus: WsConnectionStatus;
}

export function AgentStatusIndicator({ agentStatus, connectionStatus }: Props) {
  const isActive = connectionStatus === "open";
  const isError = connectionStatus === "error";

  const dotClass = isActive
    ? "bg-emerald-400"
    : isError
      ? "bg-red-400 animate-pulse"
      : "bg-amber-400 animate-pulse";

  const cycleLabel = agentStatus
    ? `CYCLE ${String(agentStatus.cycle_count).padStart(3, "0")}`
    : "CYCLE ---";

  const statusLabel = isActive ? "AGENT" : isError ? "ERROR" : "RECONNECT";

  const tooltip = agentStatus
    ? [
        agentStatus.last_cycle_at
          ? `Last cycle: ${agentStatus.last_cycle_at.slice(11, 19)} UTC`
          : null,
        `Session cost: $${agentStatus.session_cost_usd.toFixed(3)}`,
        `WS clients: ${agentStatus.connection_count}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div
      className="flex items-center gap-px font-mono text-[10px] tracking-wider"
      title={tooltip}
    >
      <div
        className={[
          "flex items-center gap-1.5 border border-r-0 border-zinc-700 px-2 py-1",
          isActive
            ? "bg-zinc-900 text-emerald-400"
            : isError
              ? "bg-zinc-900 text-red-400"
              : "bg-zinc-900 text-amber-400",
        ].join(" ")}
      >
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass}`} />
        <span>{statusLabel}</span>
      </div>
      <div className="border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-400">
        {cycleLabel}
      </div>
    </div>
  );
}
