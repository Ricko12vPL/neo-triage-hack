import type { FamousNEO } from "../lib/famous_neos";

interface Props {
  neo: FamousNEO;
  onClose: () => void;
}

function Row({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-zinc-800/70 py-1.5">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <span
        className={`text-right text-[11px] ${mono ? "font-mono" : ""} text-zinc-200`}
      >
        {value}
      </span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4">
      <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300/70">
        {title}
      </h3>
      <div className="rounded border border-zinc-800 bg-zinc-950/70 px-3 py-2">
        {children}
      </div>
    </section>
  );
}

function formatAU(au: number): string {
  const km = au * 149_597_870.7;
  if (km > 1e8) return `${au.toFixed(3)} AU  ·  ${(km / 1e6).toFixed(1)}M km`;
  return `${au.toFixed(3)} AU  ·  ${(km / 1e3).toFixed(0)}k km`;
}

function perihelion_au(a: number, e: number): number {
  return a * (1 - e);
}

function aphelion_au(a: number, e: number): number {
  return a * (1 + e);
}

const ORBIT_CLASS_DESCRIPTION: Record<string, string> = {
  Apollo: "Earth-crossing orbit, a > 1 AU (Apollo family)",
  Aten: "Earth-crossing orbit, a < 1 AU (Aten family)",
  Amor: "Approaches but doesn't cross Earth's orbit (Amor family)",
  Atira: "Orbit entirely inside Earth's (Atira family, rare)",
  MBA: "Main-belt asteroid, between Mars and Jupiter — not an NEO",
  Comet: "Jupiter-family / short-period comet — not a sub-class of NEO",
};

export function FamousNEODetailsPanel({ neo, onClose }: Props) {
  const q = perihelion_au(
    neo.orbit.semi_major_axis_au,
    neo.orbit.eccentricity,
  );
  const Q = aphelion_au(
    neo.orbit.semi_major_axis_au,
    neo.orbit.eccentricity,
  );

  return (
    <aside
      className="pointer-events-auto absolute bottom-3 right-3 top-3 z-20 flex w-[360px] max-w-[92vw] flex-col overflow-hidden rounded border border-violet-800/40 bg-zinc-950/96 shadow-2xl backdrop-blur"
      aria-label="Famous NEO details"
    >
      <header className="flex items-start justify-between border-b border-violet-900/50 bg-gradient-to-r from-violet-950/40 to-zinc-950/40 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-sm text-zinc-100">{neo.name}</h2>
            <span className="rounded border border-violet-700 bg-violet-900/30 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-violet-200">
              Famous NEO
            </span>
          </div>
          <p className="mt-0.5 font-mono text-[10px] text-zinc-500">
            {neo.designation}
          </p>
        </div>
        <button
          onClick={onClose}
          className="ml-3 rounded px-2 py-0.5 font-mono text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          aria-label="Close details"
        >
          ✕
        </button>
      </header>

      {!neo.is_neo && (
        <div className="border-b border-amber-900/40 bg-amber-950/30 px-4 py-2 text-[10px] leading-relaxed text-amber-200/90">
          <strong>Not an NEO.</strong> {ORBIT_CLASS_DESCRIPTION[neo.orbit_class]}.
          Shown here because it's a well-known body with mission history.
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* Identity + classification — hero block */}
        <div className="rounded border border-violet-900/40 bg-black/40 p-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              Classification
            </span>
            <span className="font-mono text-violet-200">
              {neo.orbit_class}
              {neo.is_pha && (
                <span className="ml-2 rounded border border-red-700/60 bg-red-950/50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-red-200">
                  PHA
                </span>
              )}
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
            {ORBIT_CLASS_DESCRIPTION[neo.orbit_class]}
          </p>
        </div>

        <Section title="Physical">
          <Row
            label="Diameter"
            value={
              neo.diameter_km >= 1
                ? `${neo.diameter_km.toFixed(2)} km`
                : `${(neo.diameter_km * 1000).toFixed(0)} m`
            }
          />
          <Row
            label="Abs. magnitude H"
            value={neo.absolute_magnitude_h.toFixed(2)}
          />
          <Row
            label="Albedo"
            value={neo.albedo != null ? neo.albedo.toFixed(3) : "—"}
          />
          <Row label="Spectral class" value={neo.spectral_class || "—"} />
          <Row
            label="Rotation period"
            value={
              neo.rotation_period_hours != null
                ? neo.rotation_period_hours >= 24
                  ? `${(neo.rotation_period_hours / 24).toFixed(2)} d`
                  : `${neo.rotation_period_hours.toFixed(2)} h`
                : "chaotic / unknown"
            }
          />
        </Section>

        <Section title="Orbit (heliocentric, J2000)">
          <Row
            label="Semi-major axis"
            value={formatAU(neo.orbit.semi_major_axis_au)}
          />
          <Row
            label="Eccentricity"
            value={neo.orbit.eccentricity.toFixed(4)}
          />
          <Row
            label="Inclination"
            value={`${neo.orbit.inclination_deg.toFixed(2)}°`}
          />
          <Row label="Perihelion q" value={formatAU(q)} />
          <Row label="Aphelion Q" value={formatAU(Q)} />
          <Row
            label="Period"
            value={`${neo.orbit.orbital_period_years.toFixed(3)} yr`}
          />
          <Row
            label="Ω · ω · M (J2000)"
            value={`${neo.orbit.longitude_ascending_node_deg.toFixed(1)}° · ${neo.orbit.argument_periapsis_deg.toFixed(1)}° · ${neo.orbit.mean_anomaly_deg_j2000.toFixed(1)}°`}
          />
        </Section>

        {(neo.impact_probability_cumulative != null ||
          neo.torino_scale_peak > 0) && (
          <Section title="Impact hazard">
            {neo.impact_probability_cumulative != null && (
              <Row
                label="P(impact), cumulative"
                value={neo.impact_probability_cumulative.toExponential(2)}
              />
            )}
            {neo.torino_scale_peak > 0 && (
              <Row
                label="Torino scale (historical peak)"
                value={neo.torino_scale_peak.toString()}
              />
            )}
            <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
              Known object — impact probability comes from a full orbit
              determination (JPL Sentry / NEODyS). This is not a neo-triage
              classifier output; we don't estimate risk for catalogued
              bodies.
            </p>
          </Section>
        )}

        <Section title="Discovery">
          <Row
            label="Year"
            value={neo.discovery_year.toString()}
          />
          <Row label="Discoverer" value={neo.discoverer} mono={false} />
        </Section>

        {neo.spacecraft_visits.length > 0 && (
          <Section title="Spacecraft visits">
            <ul className="space-y-1.5 text-[11px] text-zinc-300">
              {neo.spacecraft_visits.map((visit, i) => (
                <li key={i} className="leading-relaxed">
                  ·{" "}
                  <span className="font-mono text-violet-200/90">
                    {visit}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {neo.notable_events.length > 0 && (
          <Section title="Notable events">
            <ul className="space-y-1.5 text-[11px] text-zinc-300">
              {neo.notable_events.map((evt, i) => (
                <li key={i} className="leading-relaxed">
                  · {evt}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      <footer className="border-t border-zinc-800 bg-zinc-950/80 px-4 py-3">
        <p className="text-center text-[10px] leading-relaxed text-zinc-500">
          Complete orbital determination from JPL SBDB — this is a known
          body, not a NEOCP tracklet.
        </p>
      </footer>
    </aside>
  );
}
