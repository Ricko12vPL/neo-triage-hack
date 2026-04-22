import { useEffect, useRef, useState } from "react";

interface Props {
  reasoning: string;
  briefing: string;
  status: "idle" | "streaming" | "done" | "cache_hit" | "error";
  error: string | null;
}

export function BriefingPanel({ reasoning, briefing, status, error }: Props) {
  const [reasoningOpen, setReasoningOpen] = useState(true);
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
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-950/40 px-4 py-2 text-[11px]">
        <StatusBadge status={status} />
        <span className="text-zinc-500">
          claude-opus-4-7 · adaptive thinking
        </span>
        {error && (
          <span className="ml-auto rounded bg-red-500/10 px-2 py-0.5 font-mono text-red-300">
            {error}
          </span>
        )}
      </div>

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
              ({reasoning.split(/\s+/).filter(Boolean).length} words)
            </span>
          )}
        </button>
        {reasoningOpen && (
          <div
            ref={reasoningRef}
            className="max-h-48 overflow-y-auto px-4 pb-3 font-mono text-[12px] leading-relaxed text-zinc-400"
          >
            {reasoning ? (
              <pre className="whitespace-pre-wrap">{reasoning}</pre>
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

      {/* Briefing panel — main */}
      <div
        ref={briefingRef}
        className="flex-1 overflow-y-auto px-6 py-5 text-[14px] leading-relaxed text-zinc-200"
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
 *
 * The model often emits a header followed immediately by a paragraph on
 * the next line (no blank between), so we tokenize line-by-line rather
 * than splitting on double-newlines.
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

function Inline({ text }: { text: string }) {
  // Bold (**…**) — split, alternating non-bold/bold pieces.
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
