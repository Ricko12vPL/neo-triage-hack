import type { AgentStatus } from "../api/types";
import type { WsConnectionStatus } from "../hooks/useAgentFeed";

interface Props {
  agentStatus: AgentStatus | null;
  connectionStatus: WsConnectionStatus;
}

export function AgentStatusIndicator({ agentStatus, connectionStatus }: Props) {
  const dot =
    connectionStatus === "open"
      ? "bg-emerald-400"
      : connectionStatus === "error"
        ? "bg-red-400 animate-pulse"
        : "bg-amber-400 animate-pulse";

  const label =
    connectionStatus === "open"
      ? agentStatus
        ? `Agent · Cycle ${agentStatus.cycle_count}`
        : "Agent · connecting…"
      : connectionStatus === "error"
        ? "Agent · error"
        : "Agent · reconnecting";

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
      className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-400"
      title={tooltip}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
      <span>{label}</span>
    </div>
  );
}
