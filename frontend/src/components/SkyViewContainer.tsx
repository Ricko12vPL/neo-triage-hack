import { useState } from "react";
import type { RankedCandidate } from "../api/types";
import { SkyViewPanel } from "./SkyViewPanel";
import { CandidateDetailsPanel } from "./CandidateDetailsPanel";

interface Props {
  candidates: RankedCandidate[];
  selectedTrksub: string | null;
  onOpenFullBriefing: (trksub: string) => void;
}

const NASA_EYES_URL = "https://eyes.nasa.gov/apps/asteroids/#/home";

export function SkyViewContainer({
  candidates,
  selectedTrksub,
  onOpenFullBriefing,
}: Props) {
  const [iframeFailed, setIframeFailed] = useState(false);
  // Sky-view-local selection — opens the details panel; does NOT switch tabs.
  // Seeded from the top-level selection so the user doesn't lose context when
  // they navigate in from Live Feed.
  const [inspectedTrksub, setInspectedTrksub] = useState<string | null>(
    selectedTrksub,
  );

  const inspected = candidates.find((c) => c.trksub === inspectedTrksub) ?? null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* TOP — OUR TRIAGE */}
      <div className="relative flex-1 border-b border-zinc-800 bg-[#04060a] min-h-0">
        <div className="pointer-events-none absolute left-4 top-3 z-10 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
          Our triage · tonight · {candidates.length} candidates
        </div>
        <div className="pointer-events-none absolute right-4 top-3 z-10 flex flex-col items-end gap-1 text-[9px] font-mono uppercase tracking-wider text-zinc-500">
          <div>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 align-middle mr-1" />
            Torino 3+
          </div>
          <div>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle mr-1" />
            Torino 2
          </div>
          <div>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500 align-middle mr-1" />
            Routine
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-3 left-4 z-10 text-[9px] font-mono uppercase tracking-wider text-zinc-600">
          Celestial sphere · drag to rotate · scroll to zoom · click a point to inspect
        </div>
        <div className="pointer-events-none absolute bottom-3 right-4 z-10 text-[9px] font-mono uppercase tracking-wider text-zinc-600">
          <span className="text-violet-500/80">— —</span> ecliptic ·{" "}
          <span className="text-slate-500/80">— —</span> celestial equator
        </div>
        <SkyViewPanel
          candidates={candidates}
          selectedTrksub={inspectedTrksub}
          onCandidateClick={(trksub) => setInspectedTrksub(trksub)}
        />

        {inspected && (
          <CandidateDetailsPanel
            candidate={inspected}
            onClose={() => setInspectedTrksub(null)}
            onOpenFullBriefing={() => {
              onOpenFullBriefing(inspected.trksub);
            }}
          />
        )}
      </div>

      {/* BOTTOM — NASA EYES CONTEXT */}
      <div className="relative h-[38vh] min-h-[260px] flex-none bg-black">
        <div className="pointer-events-none absolute left-4 top-3 z-10 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
          Planetary context · NASA Eyes on Asteroids · 37k+ NEO population
        </div>
        <div className="pointer-events-none absolute bottom-3 left-4 z-10 hidden max-w-md rounded bg-black/60 p-2 text-[10px] text-zinc-400 backdrop-blur-sm sm:block">
          Above: what <em>we</em> are watching. Below: the full catalog NASA/JPL
          tracks in 2026 — every labelled point is a known NEO. Rubin
          Observatory will add ~130 new candidates per night starting 2027.
          Follow-up capacity doesn't scale 8×. That's the problem neo-triage
          exists to solve.
        </div>
        <a
          href={NASA_EYES_URL}
          target="_blank"
          rel="noreferrer"
          className="absolute right-4 top-3 z-10 rounded border border-zinc-700 bg-zinc-900/80 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-zinc-300 hover:bg-zinc-800 hover:text-white"
        >
          Open in new tab ↗
        </a>
        {iframeFailed ? (
          <div className="flex h-full items-center justify-center">
            <img
              src="/nasa-eyes-neo-population.png"
              alt="NASA Eyes on Asteroids — NEO population"
              className="max-h-full max-w-full object-contain"
            />
          </div>
        ) : (
          <iframe
            src={NASA_EYES_URL}
            title="NASA Eyes on Asteroids"
            className="h-full w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            onError={() => setIframeFailed(true)}
          />
        )}
      </div>
    </div>
  );
}
