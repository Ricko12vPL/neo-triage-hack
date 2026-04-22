/**
 * Backend client. All routes go through Vite's dev proxy in dev and
 * through the configured `VITE_API_BASE` in production. Default empty
 * base means same-origin.
 */
import type {
  BriefingChunk,
  BriefingRequest,
  Candidate,
  CostSummary,
  Prediction,
  RankedCandidate,
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
  ranked: (limit = 10) =>
    getJson<RankedCandidate[]>(`/api/rank/?limit=${limit}`),
  rank: (trksub: string) =>
    getJson<Prediction>(`/api/rank/${encodeURIComponent(trksub)}`),
  cost: () => getJson<CostSummary>("/api/cost/"),
};

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
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(request),
    signal,
  });

  if (!resp.ok || !resp.body) {
    const detail = await resp.text().catch(() => resp.statusText);
    throw new Error(`POST /api/briefing/ failed: ${resp.status} ${detail}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Parse complete SSE blocks separated by \n\n
      let sep = buffer.indexOf("\n\n");
      while (sep !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);

        const dataLine = block
          .split("\n")
          .find((line) => line.startsWith("data: "));
        if (dataLine) {
          try {
            const chunk = JSON.parse(dataLine.slice(6)) as BriefingChunk;
            yield chunk;
          } catch (err) {
            console.error("Failed to parse SSE chunk", err, dataLine);
          }
        }

        sep = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}
