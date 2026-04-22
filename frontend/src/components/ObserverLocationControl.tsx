import { useState } from "react";
import type { ObserverLocation } from "../hooks/useObserverLocation";
import { OBSERVER_PRESETS } from "../hooks/useObserverLocation";

interface Props {
  location: ObserverLocation;
  onLocationChange: (loc: ObserverLocation) => void;
}

export function ObserverLocationControl({ location, onLocationChange }: Props) {
  const [open, setOpen] = useState(false);
  const [customLat, setCustomLat] = useState("");
  const [customLon, setCustomLon] = useState("");
  const [customLabel, setCustomLabel] = useState("");

  function applyCustom() {
    const lat = parseFloat(customLat);
    const lon = parseFloat(customLon);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90) return;
    onLocationChange({ label: customLabel || "Custom", latitude_deg: lat, longitude_deg: lon });
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={`Observer: ${location.label} (${location.latitude_deg > 0 ? "N" : "S"}${Math.abs(location.latitude_deg).toFixed(1)}°)`}
        className="flex items-center gap-1.5 rounded-sm border border-zinc-800 bg-zinc-900/60 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-300"
      >
        <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0a8 8 0 1 0 8 8A8 8 0 0 0 8 0ZM1.5 8A6.5 6.5 0 0 1 8 1.5V8L1.5 8ZM8 14.5A6.5 6.5 0 0 1 1.5 8H8V14.5ZM8 8V1.5A6.5 6.5 0 0 1 14.5 8H8Z" />
        </svg>
        {location.label}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded border border-zinc-700 bg-zinc-900 p-3 shadow-xl">
          <p className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">
            Observer site
          </p>
          <div className="flex flex-col gap-1">
            {OBSERVER_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => {
                  onLocationChange(preset);
                  setOpen(false);
                }}
                className={[
                  "rounded-sm px-2 py-1.5 text-left font-mono text-[11px] transition-colors",
                  location.label === preset.label
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
                ].join(" ")}
              >
                {preset.label}{" "}
                <span className="text-zinc-600">
                  {preset.latitude_deg > 0 ? "N" : "S"}
                  {Math.abs(preset.latitude_deg).toFixed(1)}°
                </span>
              </button>
            ))}
          </div>

          <div className="mt-3 border-t border-zinc-800 pt-3">
            <p className="mb-1.5 text-[10px] text-zinc-600">Custom</p>
            <input
              placeholder="Latitude (–90 to 90)"
              value={customLat}
              onChange={(e) => setCustomLat(e.target.value)}
              className="mb-1 w-full rounded-sm border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-[11px] text-zinc-200 placeholder-zinc-600 outline-none"
            />
            <input
              placeholder="Longitude (–180 to 180)"
              value={customLon}
              onChange={(e) => setCustomLon(e.target.value)}
              className="mb-1 w-full rounded-sm border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-[11px] text-zinc-200 placeholder-zinc-600 outline-none"
            />
            <input
              placeholder="Label (optional)"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              className="mb-2 w-full rounded-sm border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-[11px] text-zinc-200 placeholder-zinc-600 outline-none"
            />
            <button
              onClick={applyCustom}
              className="w-full rounded-sm bg-zinc-700 px-2 py-1 font-mono text-[11px] text-zinc-200 transition-colors hover:bg-zinc-600"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
