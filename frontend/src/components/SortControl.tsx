import { SORT_OPTIONS, type SortKey } from "../lib/sort";

export type { SortKey };

interface Props {
  sortKey: SortKey;
  onSortChange: (key: SortKey) => void;
  phaOnly: boolean;
  onPhaOnlyChange: (v: boolean) => void;
}

export function SortControl({
  sortKey,
  onSortChange,
  phaOnly,
  onPhaOnlyChange,
}: Props) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {SORT_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onSortChange(opt.id)}
          className={[
            "rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
            sortKey === opt.id
              ? "bg-zinc-700 text-zinc-100"
              : "text-zinc-600 hover:text-zinc-400",
          ].join(" ")}
        >
          {opt.label}
        </button>
      ))}
      <button
        onClick={() => onPhaOnlyChange(!phaOnly)}
        className={[
          "ml-auto rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
          phaOnly
            ? "border-red-700/60 bg-red-900/30 text-red-300"
            : "border-zinc-800 text-zinc-600 hover:text-zinc-400",
        ].join(" ")}
      >
        PHA
      </button>
    </div>
  );
}
