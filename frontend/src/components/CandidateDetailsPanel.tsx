import type { RankedCandidate } from "../api/types";
import {
  diameterMFromH,
  estimateKineticEnergyMtTnt,
} from "../lib/energetics";
import { computeTorinoFromCandidate } from "../lib/torino";
import { TorinoBadge } from "./TorinoBadge";
import { computeMotionEnvelope, hashTrksub } from "../lib/proper_motion";

interface Props {
  candidate: RankedCandidate;
  onClose: () => void;
  onOpenFullBriefing: () => void;
}

/**
 * Heuristic composition from class label — "minutes-old tracklet" has no
 * spectra, so the text is framed as a prior, not a measurement.
 */
function compositionHint(map_class: string): {
  label: string;
  body: string;
} {
  switch (map_class) {
    case "NEO":
      return {
        label: "Composition (prior)",
        body:
          "Likely stony (S-type, ~75% of NEO population) or carbonaceous " +
          "(C-type). No spectra — classification from dynamics only.",
      };
    case "MBA":
      return {
        label: "Composition (prior)",
        body:
          "Main-belt asteroid — silicate or carbonaceous. Dynamics " +
          "suggest stable heliocentric orbit between Mars and Jupiter.",
      };
    case "COMET":
      return {
        label: "Composition (prior)",
        body:
          "Volatile-rich: water ice, CO₂, dust mantle. Coma may be " +
          "visible in deeper imagery.",
      };
    case "ARTIFACT":
      return {
        label: "Composition",
        body:
          "Likely not a real object. Tracklet is probably a cosmic-ray " +
          "hit, hot pixel, or streaked image defect.",
      };
    default:
      return {
        label: "Composition",
        body:
          "Unclassified. More observations needed before composition " +
          "prior can be set.",
      };
  }
}

function formatRa(ra_deg: number): string {
  const ra_hours = ra_deg / 15;
  const h = Math.floor(ra_hours);
  const m_frac = (ra_hours - h) * 60;
  const m = Math.floor(m_frac);
  const s = Math.round((m_frac - m) * 60);
  return `${h}h ${m}m ${s}s (${ra_deg.toFixed(3)}°)`;
}

function formatDec(dec_deg: number): string {
  const sign = dec_deg >= 0 ? "+" : "−";
  const abs = Math.abs(dec_deg);
  const d = Math.floor(abs);
  const m_frac = (abs - d) * 60;
  const m = Math.floor(m_frac);
  const s = Math.round((m_frac - m) * 60);
  return `${sign}${d}° ${m}' ${s}" (${dec_deg.toFixed(3)}°)`;
}

/** Mass estimate assuming spherical body, density 2500 kg/m³ (stony NEO). */
function estimateMassKg(diameter_m: number): number {
  const r = diameter_m / 2;
  const volume = (4 / 3) * Math.PI * r ** 3;
  return volume * 2500;
}

function formatMass(kg: number): string {
  if (kg > 1e12) return `${(kg / 1e12).toFixed(2)} Gt`;
  if (kg > 1e9) return `${(kg / 1e9).toFixed(2)} Mt`;
  if (kg > 1e6) return `${(kg / 1e6).toFixed(2)} kt`;
  return `${(kg / 1e3).toFixed(0)} t`;
}

function Row({ label, value, mono = true }: {
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

function Section({ title, children }: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4">
      <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
        {title}
      </h3>
      <div className="rounded border border-zinc-800 bg-zinc-950/70 px-3 py-2">
        {children}
      </div>
    </section>
  );
}

export function CandidateDetailsPanel({
  candidate,
  onClose,
  onOpenFullBriefing,
}: Props) {
  const { prediction } = candidate;
  const torino = computeTorinoFromCandidate(
    candidate.impact_probability,
    candidate.absolute_magnitude_h,
  );

  const diameter_m =
    candidate.absolute_magnitude_h != null
      ? diameterMFromH(candidate.absolute_magnitude_h)
      : null;
  const mass_kg = diameter_m != null ? estimateMassKg(diameter_m) : null;
  const ke_mt =
    candidate.absolute_magnitude_h != null
      ? estimateKineticEnergyMtTnt(candidate.absolute_magnitude_h)
      : null;

  const comp = compositionHint(prediction.map_class);
  const isHero = candidate.trksub === "P21YR4A";

  return (
    <aside
      className="pointer-events-auto absolute bottom-3 right-3 top-3 z-20 flex w-[360px] max-w-[92vw] flex-col overflow-hidden rounded border border-zinc-700/60 bg-zinc-950/96 shadow-2xl backdrop-blur"
      aria-label="Candidate details"
    >
      <header className="flex items-start justify-between border-b border-zinc-800 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-sm text-zinc-100">
              {candidate.trksub}
            </h2>
            {isHero && (
              <span className="rounded border border-red-700 bg-red-900/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-red-200">
                YR4 analog
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            class {prediction.map_class} · obs {candidate.observatory_code} ·
            n={candidate.n_observations}
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

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* Torino + impact — hero block */}
        <div className="rounded border border-zinc-800 bg-black/40 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              Impact hazard
            </span>
            <TorinoBadge
              impact_probability={candidate.impact_probability}
              absolute_magnitude_h={candidate.absolute_magnitude_h}
              variant="inline"
            />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
            {torino.description}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <div className="text-[9px] uppercase tracking-wider text-zinc-500">
                P(impact)
              </div>
              <div className="font-mono text-zinc-200">
                {candidate.impact_probability != null
                  ? `${(candidate.impact_probability * 100).toFixed(3)}%`
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-zinc-500">
                Kinetic energy
              </div>
              <div className="font-mono text-zinc-200">
                {ke_mt != null ? `${ke_mt.toFixed(1)} MT TNT` : "—"}
              </div>
            </div>
          </div>
        </div>

        <Section title="Physical estimate">
          <Row
            label="Abs. magnitude H"
            value={
              candidate.absolute_magnitude_h != null
                ? candidate.absolute_magnitude_h.toFixed(2)
                : "—"
            }
          />
          <Row
            label="Diameter"
            value={
              diameter_m != null
                ? diameter_m > 1000
                  ? `${(diameter_m / 1000).toFixed(2)} km`
                  : `${diameter_m.toFixed(0)} m`
                : "unknown (needs H)"
            }
          />
          <Row
            label="Mass (prior ρ=2500)"
            value={mass_kg != null ? formatMass(mass_kg) : "—"}
          />
          <Row
            label="Apparent V"
            value={`${candidate.mean_magnitude_v.toFixed(1)} mag`}
          />
        </Section>

        <Section title={comp.label}>
          <p className="text-[11px] leading-relaxed text-zinc-400">
            {comp.body}
          </p>
        </Section>

        <Section title="Trajectory (sky plane)">
          <Row label="Right ascension" value={formatRa(candidate.ra_deg)} />
          <Row label="Declination" value={formatDec(candidate.dec_deg)} />
          <Row
            label="Ecliptic latitude"
            value={`${candidate.ecliptic_latitude_deg.toFixed(2)}°`}
          />
          <Row
            label="Rate of motion"
            value={`${candidate.rate_arcsec_min.toFixed(2)}″/min`}
          />
          <Row
            label="Arc length"
            value={`${candidate.arc_length_minutes.toFixed(0)} min`}
          />
        </Section>

        {(() => {
          const env = computeMotionEnvelope({
            ra_deg: candidate.ra_deg,
            dec_deg: candidate.dec_deg,
            rate_arcsec_min: candidate.rate_arcsec_min,
            arc_length_minutes: candidate.arc_length_minutes,
            trksub_hash: hashTrksub(candidate.trksub),
          });
          const last = env.arc[env.arc.length - 1];
          const totalDeg = (candidate.rate_arcsec_min * 60 * 24) / 3600;
          const shortArc = candidate.arc_length_minutes < 60;
          return (
            <Section title="Preliminary motion vector (+24 h)">
              <Row
                label="Angular distance"
                value={`${totalDeg.toFixed(2)}°`}
              />
              <Row
                label="Direction (PA E of N)"
                value={`${env.used_position_angle_deg.toFixed(0)}° (approx)`}
              />
              <Row
                label="Direction uncertainty"
                value={`±${env.uncertainty_half_angle_deg.toFixed(0)}°`}
              />
              <Row
                label="Projected in 24 h"
                value={`RA ${last.ra_deg.toFixed(2)}°, Dec ${last.dec_deg.toFixed(2)}°`}
              />
              <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                {shortArc
                  ? "Short-arc tracklet — direction is a best guess until a second-night recovery. Cone on Sky View shows where the object could be in 24 h."
                  : "Great-circle extrapolation assumes constant rate. Real motion curves once an orbit is fit; use this only as a re-acquisition pointer."}{" "}
                <span className="text-zinc-400">
                  Not a substitute for JPL Scout/Sentry orbit determination.
                </span>
              </p>
            </Section>
          );
        })()}

        <Section title="Orbit (status)">
          {candidate.impact_probability != null ? (
            <>
              <Row
                label="Solution available"
                value={
                  <span className="text-emerald-300">
                    yes — Sentry/NEODyS
                  </span>
                }
                mono={false}
              />
              <Row
                label="P(impact) window"
                value={`${(candidate.impact_probability * 100).toFixed(3)}% · 2032`}
              />
              <Row
                label="Assumed encounter v"
                value="20 km/s (prior)"
              />
            </>
          ) : (
            <>
              <Row
                label="Solution available"
                value={
                  <span className="text-amber-300">
                    pending — arc too short
                  </span>
                }
                mono={false}
              />
              <Row
                label="Arc available"
                value={`${candidate.arc_length_minutes.toFixed(0)} min / ≥ 180 needed`}
              />
              <Row
                label="Next step"
                value="request follow-up astrometry"
                mono={false}
              />
            </>
          )}
          <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
            Full Keplerian elements (a, e, i, Ω, ω, M) need ≥ 3 hour arc
            plus re-observation on a later night. neo-triage consumes
            these downstream from MPC + JPL — we don't redo the solve.
          </p>
        </Section>

        <Section title="Classifier">
          <Row
            label="P(NEO)"
            value={prediction.prob_neo.toFixed(3)}
          />
          <Row
            label="P(PHA)"
            value={prediction.prob_pha.toFixed(3)}
          />
          <Row
            label="digest2 NEO_NoID"
            value={candidate.digest2_neo_noid.toString()}
          />
          <Row
            label="Uncertainty (entropy)"
            value={`${prediction.uncertainty_entropy_bits.toFixed(2)} bits`}
          />
          <Row
            label="Model"
            value={prediction.model_version}
          />
        </Section>

        <Section title="Discovery">
          <Row
            label="Observatory (MPC)"
            value={candidate.observatory_code}
          />
          <Row
            label="First observation"
            value={new Date(candidate.first_obs_datetime)
              .toISOString()
              .replace("T", " ")
              .slice(0, 16)}
          />
          <Row
            label="Observations in tracklet"
            value={candidate.n_observations.toString()}
          />
        </Section>
      </div>

      <footer className="border-t border-zinc-800 bg-zinc-950/80 px-4 py-3">
        <button
          onClick={onOpenFullBriefing}
          className="w-full rounded border border-emerald-700 bg-emerald-900/30 px-3 py-2 text-xs font-mono uppercase tracking-wider text-emerald-200 hover:bg-emerald-900/60"
        >
          Open full Claude briefing →
        </button>
        <p className="mt-1.5 text-center text-[9px] text-zinc-600">
          switches to Live Feed and streams the Opus 4.7 assessment
        </p>
      </footer>
    </aside>
  );
}
