/**
 * Backend client. All routes go through Vite's dev proxy in dev and
 * through the configured `VITE_API_BASE` in production. Default empty
 * base means same-origin.
 */
import type {
  AgentStatus,
  BriefingChunk,
  BriefingRequest,
  Candidate,
  CostSummary,
  DataSourceReport,
  ExpertReview,
  Prediction,
  RankedCandidate,
  YR4Milestone,
} from "./types";

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

async function getJson<T>(path: string): Promise<T> {
  const resp = await fetch(`${BASE}${path}`);
  if (!resp.ok) {
    const detail = await resp.text().catch(() => resp.statusText);
    throw new Error(`GET ${path} failed: ${resp.status} ${detail}`);
  }
  return (await resp.json()) as T;
}

export const api = {
  health: () =>
    getJson<{ status: string; service: string; version: string }>("/health"),
  candidates: (limit = 10) =>
    getJson<Candidate[]>(`/api/candidates/?limit=${limit}`),
  candidate: (trksub: string) =>
    getJson<Candidate>(`/api/candidates/${encodeURIComponent(trksub)}`),
  ranked: (limit = 10, opts: { expert?: boolean; k?: number } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (opts.expert) params.set("expert", "true");
    if (opts.k) params.set("k", String(opts.k));
    return getJson<RankedCandidate[]>(`/api/rank/?${params.toString()}`);
  },
  rank: (trksub: string) =>
    getJson<Prediction>(`/api/rank/${encodeURIComponent(trksub)}`),
  expertReview: (trksub: string) =>
    getJson<ExpertReview>(
      `/api/rank/expert-review/${encodeURIComponent(trksub)}`,
    ),
  injectSynthetic: async (
    template: "p21yr4a_replay" | "p21lowrt_dissent" | "high_confidence_neo",
  ) => {
    const resp = await fetch(`${BASE}/api/agent/inject-synthetic?template=${template}`, {
      method: "POST",
    });
    if (!resp.ok) throw new Error(`inject-synthetic failed: ${resp.status}`);
    return (await resp.json()) as {
      injected_trksub: string;
      template: string;
      timestamp_utc: string;
      expert_review_endorsement: string | null;
    };
  },
  cost: () => getJson<CostSummary>("/api/cost/"),
  agentStatus: () => getJson<AgentStatus>("/api/agent/status"),
  dataSource: () => getJson<DataSourceReport>("/api/meta/data-source"),
  yr4Timeline: () => getJson<YR4Milestone[]>("/api/replay/yr4"),
  yr4Milestone: (hour: number) =>
    getJson<YR4Milestone>(`/api/replay/yr4/${hour}`),
};

/** Parse SSE body into BriefingChunk stream. Shared by all streaming endpoints. */
async function* parseSseStream(
  resp: Response,
  label: string,
): AsyncGenerator<BriefingChunk, void, void> {
  if (!resp.ok || !resp.body) {
    const detail = await resp.text().catch(() => resp.statusText);
    throw new Error(`${label} failed: ${resp.status} ${detail}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep = buffer.indexOf("\n\n");
      while (sep !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
        if (dataLine) {
          try {
            yield JSON.parse(dataLine.slice(6)) as BriefingChunk;
          } catch { /* malformed SSE chunk — skip */ }
        }
        sep = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* streamReplayBrief(
  hour: number,
): AsyncGenerator<BriefingChunk, void, void> {
  const resp = await fetch(`${BASE}/api/replay/yr4/${hour}/brief`, {
    method: "POST",
    headers: { Accept: "text/event-stream" },
  });
  yield* parseSseStream(resp, `POST /api/replay/yr4/${hour}/brief`);
}

export async function* streamYr4Alert(): AsyncGenerator<
  BriefingChunk,
  void,
  void
> {
  const resp = await fetch(`${BASE}/api/replay/yr4/alert`, {
    method: "POST",
    headers: { Accept: "text/event-stream" },
  });
  yield* parseSseStream(resp, "POST /api/replay/yr4/alert");
}

/**
 * Stream a briefing as parsed SSE chunks. Caller receives one
 * `BriefingChunk` per `event: …\\ndata: …\\n\\n` block.
 *
 * Aborting the returned controller cancels the underlying fetch and
 * the parser exits cleanly on the next iteration.
 */
export async function* streamBriefing(
  request: BriefingRequest,
  signal?: AbortSignal,
): AsyncGenerator<BriefingChunk, void, void> {
  const resp = await fetch(`${BASE}/api/briefing/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(request),
    signal,
  });
  yield* parseSseStream(resp, "POST /api/briefing/");
}
