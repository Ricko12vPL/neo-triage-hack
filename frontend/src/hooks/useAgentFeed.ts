import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { AgentEvent, AgentStatus } from "../api/types";

const WS_PATH = "/ws/feed";
const MAX_EVENTS = 50;
const STATUS_POLL_MS = 10_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export type WsConnectionStatus = "connecting" | "open" | "closed" | "error";

interface AgentFeed {
  events: AgentEvent[];
  connectionStatus: WsConnectionStatus;
  agentStatus: AgentStatus | null;
}

export function useAgentFeed(): AgentFeed {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<WsConnectionStatus>("connecting");
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelay = useRef(RECONNECT_BASE_MS);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);
  // Stored in ref so the WS onclose callback can call it without capturing stale closures
  const scheduleReconnect = useRef<() => void>(() => {});

  useEffect(() => {
    unmounted.current = false;

    function connect() {
      if (unmounted.current) return;
      const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const url = envUrl && envUrl.length > 0
        ? envUrl
        : `${protocol}://${window.location.host}${WS_PATH}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      setConnectionStatus("connecting");

      ws.onopen = () => {
        if (unmounted.current) return;
        setConnectionStatus("open");
        reconnectDelay.current = RECONNECT_BASE_MS;
      };

      ws.onmessage = (e) => {
        if (unmounted.current) return;
        try {
          const event = JSON.parse(e.data as string) as AgentEvent;
          setEvents((prev) => [...prev.slice(-(MAX_EVENTS - 1)), event]);
        } catch { /* malformed frame — skip */ }
      };

      ws.onerror = () => {
        if (!unmounted.current) setConnectionStatus("error");
      };

      ws.onclose = () => {
        if (unmounted.current) return;
        setConnectionStatus("closed");
        scheduleReconnect.current();
      };

      const pingId = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("");
      }, 30_000);

      return () => clearInterval(pingId);
    }

    scheduleReconnect.current = () => {
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(
          reconnectDelay.current * 2,
          RECONNECT_MAX_MS,
        );
        connect();
      }, reconnectDelay.current);
    };

    const cleanup = connect();

    return () => {
      unmounted.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      cleanup?.();
    };
  }, []);

  // Agent status polling
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const s = await api.agentStatus();
        if (!cancelled) setAgentStatus(s);
      } catch { /* status is informational — silent fail */ }
    };
    poll();
    const id = setInterval(poll, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { events, connectionStatus, agentStatus };
}
