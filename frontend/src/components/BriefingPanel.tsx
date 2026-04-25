import { useEffect, useRef, useState } from "react";
import { toSlackMarkdown } from "../lib/slackFormat";
import { downloadMarkdown } from "../lib/download";

export interface BriefingHistoryEntry {
  trksub: string;
  reasoning: string;
  briefing: string;
  timestamp: Date;
  from_cache: boolean;
}

interface Props {
  reasoning: string;
  briefing: string;
  status: "idle" | "streaming" | "done" | "cache_hit" | "error";
  error: string | null;
  trksub?: string | null;
  history?: BriefingHistoryEntry[];
  onHistoryRestore?: (entry: BriefingHistoryEntry) => void;
}

// Strip the "## Reasoning" header that arrives as the first streamed chunk.
function stripReasoningHeader(text: string): string {
  return text.replace(/^\s*##\s*Reasoning\s*\n?/i, "").trimStart();
}

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

export function BriefingPanel({
  reasoning,
  briefing,
  status,
  error,
  trksub,
  history = [],
  onHistoryRestore,
}: Props) {
  const [reasoningOpen, setReasoningOpen] = useState(true);
  const [historyOpenUser, setHistoryOpenUser] = useState(false);
  const historyOpen = historyOpenUser && status !== "streaming";
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const displayReasoning = stripReasoningHeader(reasoning);
  const briefingRef = useRef<HTMLDivElement | null>(null);
  const reasoningRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll while streaming
  useEffect(() => {
    if (status === "streaming") {
      briefingRef.current?.scrollTo({ top: briefingRef.current.scrollHeight });
      reasoningRef.current?.scrollTo({
        top: reasoningRef.current.scrollHeight,
      });
    }
  }, [reasoning, briefing, status]);

  return (
    // Outer is a plain flex column — the parent <section> handles vertical
    // overflow so we don't want an inner clip. min-h-0 keeps any nested
    // streaming buffers shrink-friendly.
    <div className="flex min-h-0 flex-col">
      {/* Streaming progress indicator */}
      <div className="relative h-px bg-zinc-800">
        {status === "streaming" && (
          <div className="stream-indicator absolute left-0 top-0 h-full bg-emerald-500/60" />
        )}
      </div>

      <div className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-950/40 px-4 py-2 text-[11px]">
        <StatusBadge status={status} />
        <span className="font-mono text-zinc-500">
          claude-opus-4-7 · adaptive thinking
        </span>
        {status === "cache_hit" && (
          <span className="font-mono text-sky-400">cache hit · $0.000</span>
        )}
        {error && (
          <span className="ml-auto rounded-sm bg-red-500/10 px-2 py-0.5 font-mono text-red-300">
            {error}
          </span>
        )}

        {/* History button — only when there's something to show */}
        {history.length > 0 && (
          <div className="relative ml-auto">
            <button
              onClick={() => setHistoryOpenUser((v) => !v)}
              className={[
                "rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
                historyOpen
                  ? "border-zinc-600 bg-zinc-800 text-zinc-200"
                  : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300",
              ].join(" ")}
            >
              History ({history.length})
            </button>

            {historyOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-600">
                  Session briefings — click to restore
                </div>
                {[...history].reverse().map((entry) => (
                  <button
                    key={`${entry.trksub}-${entry.timestamp.getTime()}`}
                    onClick={() => {
                      onHistoryRestore?.(entry);
                      setHistoryOpenUser(false);
                    }}
                    className="block w-full px-3 py-2 text-left transition-colors hover:bg-zinc-800"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[12px] font-medium text-zinc-200">
                        {entry.trksub}
                      </span>
                      <span className="font-mono text-[10px] text-zinc-600">
                        {relativeTime(entry.timestamp)}
                        {entry.from_cache && " · cached"}
                      </span>
                    </div>
                    <div className="mt-0.5 line-clamp-1 text-[11px] text-zinc-500">
                      {entry.briefing.slice(0, 80)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Copy/export bar — only when briefing is complete */}
      {briefing && (status === "done" || status === "cache_hit") && (
        <div className="flex items-center gap-1.5 border-b border-zinc-900 bg-zinc-950/30 px-4 py-1.5">
          <span className="mr-1 text-[10px] uppercase tracking-wider text-zinc-600">
            Export
          </span>
          <CopyButton
            label={copyFeedback === "md" ? "Copied!" : "Markdown"}
            onClick={() => {
              navigator.clipboard.writeText(briefing).catch(() => {});
              setCopyFeedback("md");
              setTimeout(() => setCopyFeedback(null), 2000);
            }}
            active={copyFeedback === "md"}
          />
          <CopyButton
            label={copyFeedback === "slack" ? "Copied!" : "Slack"}
            onClick={() => {
              navigator.clipboard.writeText(toSlackMarkdown(briefing)).catch(() => {});
              setCopyFeedback("slack");
              setTimeout(() => setCopyFeedback(null), 2000);
            }}
            active={copyFeedback === "slack"}
          />
          <CopyButton
            label=".md"
            onClick={() => {
              const name = trksub
                ? `briefing-${trksub}-${new Date().toISOString().slice(0, 16).replace("T", "T").replace(":", "")}.md`
                : `briefing-${Date.now()}.md`;
              downloadMarkdown(name, briefing);
            }}
            active={false}
          />
        </div>
      )}

      {/* Reasoning panel — collapsible */}
      <div className="border-b border-zinc-800 bg-zinc-950/20">
        <button
          onClick={() => setReasoningOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-2 text-left text-[11px] uppercase tracking-wider text-zinc-400 hover:text-zinc-200"
        >
          <span
            className={`inline-block transition-transform ${
              reasoningOpen ? "rotate-90" : ""
            }`}
          >
            ▸
          </span>
          Claude's reasoning
          {reasoning && (
            <span className="ml-2 normal-case text-zinc-600">
              ({displayReasoning.split(/\s+/).filter(Boolean).length} words)
            </span>
          )}
        </button>
        {reasoningOpen && (
          <div
            ref={reasoningRef}
            className="max-h-72 overflow-y-auto px-4 pb-3 font-mono text-[12px] leading-relaxed text-zinc-400"
          >
            {displayReasoning ? (
              <pre className="whitespace-pre-wrap">{displayReasoning}</pre>
            ) : (
              <p className="text-zinc-600 italic">
                {status === "streaming"
                  ? "Thinking…"
                  : "Reasoning will appear here when the briefing streams."}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Briefing panel — main artefact: 150–250 word veteran-astronomer
          recommendation. Renders at natural height so the parent
          <section> can scroll the whole stack predictably. */}
      <div className="border-b border-zinc-900 bg-zinc-950/30 px-4 py-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-300/80">
          Operator briefing — what to do tonight
        </p>
        <p className="mt-0.5 text-[10px] text-zinc-600">
          Veteran-astronomer voice · 150–250 words · streamed by Opus 4.7
        </p>
      </div>
      <div
        ref={briefingRef}
        className="px-6 py-5 text-[14px] leading-relaxed text-zinc-200"
      >
        {briefing ? (
          <Markdown text={briefing} />
        ) : (
          <p className="text-zinc-600 italic">
            {status === "streaming"
              ? "Briefing streaming…"
              : status === "idle"
                ? "Select a candidate from the left panel to begin."
                : "No briefing yet."}
          </p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "idle" | "streaming" | "done" | "cache_hit" | "error";
}) {
  const map = {
    idle: { txt: "ready", cls: "bg-zinc-800 text-zinc-400" },
    streaming: {
      txt: "streaming",
      cls: "bg-emerald-500/15 text-emerald-300 animate-pulse",
    },
    done: { txt: "done", cls: "bg-emerald-500/15 text-emerald-300" },
    cache_hit: { txt: "cache hit", cls: "bg-sky-500/15 text-sky-300" },
    error: { txt: "error", cls: "bg-red-500/15 text-red-300" },
  } as const;
  const v = map[status];
  return (
    <span
      className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${v.cls}`}
    >
      {v.txt}
    </span>
  );
}

/**
 * Tiny markdown renderer — handles only what Claude actually emits in
 * briefings: headers (`##`, `###`), bold (`**`), bullet lists, paragraphs.
 * Stays dependency-free.
 */
function Markdown({ text }: { text: string }) {
  type Token =
    | { kind: "h2"; text: string }
    | { kind: "h3"; text: string }
    | { kind: "ul"; items: string[] }
    | { kind: "p"; text: string };

  const tokens: Token[] = [];
  const lines = text.split("\n");
  let pBuf: string[] = [];
  let ulBuf: string[] = [];

  const flushP = () => {
    if (pBuf.length) {
      tokens.push({ kind: "p", text: pBuf.join(" ").trim() });
      pBuf = [];
    }
  };
  const flushUl = () => {
    if (ulBuf.length) {
      tokens.push({ kind: "ul", items: ulBuf });
      ulBuf = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushP();
      flushUl();
      continue;
    }
    const h3 = /^###\s+(.*)$/.exec(line);
    if (h3) {
      flushP();
      flushUl();
      tokens.push({ kind: "h3", text: h3[1] });
      continue;
    }
    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2) {
      flushP();
      flushUl();
      tokens.push({ kind: "h2", text: h2[1] });
      continue;
    }
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (li) {
      flushP();
      ulBuf.push(li[1]);
      continue;
    }
    flushUl();
    pBuf.push(line);
  }
  flushP();
  flushUl();

  return (
    <div className="space-y-3">
      {tokens.map((tok, i) => {
        switch (tok.kind) {
          case "h2":
            return (
              <h2
                key={i}
                className="mt-3 text-[16px] font-semibold text-zinc-100"
              >
                <Inline text={tok.text} />
              </h2>
            );
          case "h3":
            return (
              <h3
                key={i}
                className="mt-3 text-[12px] font-semibold uppercase tracking-wider text-zinc-300"
              >
                <Inline text={tok.text} />
              </h3>
            );
          case "ul":
            return (
              <ul
                key={i}
                className="ml-5 list-disc space-y-1 text-zinc-200 marker:text-zinc-600"
              >
                {tok.items.map((it, j) => (
                  <li key={j}>
                    <Inline text={it} />
                  </li>
                ))}
              </ul>
            );
          case "p":
            return (
              <p key={i} className="text-zinc-200">
                <Inline text={tok.text} />
              </p>
            );
        }
      })}
    </div>
  );
}

function CopyButton({
  label,
  onClick,
  active,
}: {
  label: string;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
        active
          ? "border-emerald-700 bg-emerald-900/30 text-emerald-300"
          : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold text-zinc-50">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
