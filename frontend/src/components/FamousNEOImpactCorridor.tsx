import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { ImpactCorridorEstimate } from "../api/types";
import type { FamousNEO } from "../lib/famous_neos";
import { ImpactCorridor2D } from "./ImpactCorridor2D";

interface Props {
  neo: FamousNEO;
}

/**
 * Approximate severe-damage (5-psi) radius in km from diameter, velocity
 * and density. Mirrors the Collins et al. 2017 simplified scaling used
 * by `backend/services/impact_damage_model.py` so the rendered circle is
 * commensurate with what the backend would compute, without an extra
 * round-trip to /api/risk/population-weighted.
 */
function approxDamageRadiusKm(
  diameter_m: number,
  velocity_km_s: number,
  density_kg_m3 = 3000,
): number {
  const radius_m = diameter_m / 2;
  const mass_kg = (4 / 3) * Math.PI * radius_m ** 3 * density_kg_m3;
  const ke_joules = 0.5 * mass_kg * (velocity_km_s * 1000) ** 2;
  const energy_mt_tnt = ke_joules / 4.184e15;
  return 2.2 * Math.cbrt(Math.max(energy_mt_tnt, 1e-3));
}

/**
 * Sentry-II approximate impact corridor visualisation for a famous NEO.
 *
 * Behaviour:
 *   - Calls GET /api/risk/corridor/{designation} on mount.
 *   - If the API returns a corridor estimate, renders ImpactCorridor2D
 *     centred on the estimate with the emerald "real" banner.
 *   - If the API returns null, renders an honest fallback message
 *     (REMOVED objects like Apophis post-2021, NOT_FOUND, etc.).
 *
 * Damage radius is derived client-side from `neo.diameter_km` so the
 * visualisation is self-contained — no extra population-risk POST.
 */
export function FamousNEOImpactCorridor({ neo }: Props) {
  const [estimate, setEstimate] = useState<ImpactCorridorEstimate | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ok" | "none" | "error"
  >("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setEstimate(null);
    setErrorMessage(null);
    api
      .impactCorridor(neo.designation)
      .then((data) => {
        if (cancelled) return;
        if (data == null) {
          setStatus("none");
        } else {
          setEstimate(data);
          setStatus("ok");
        }
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [neo.designation]);

  const diameter_m = neo.diameter_km * 1000;
  const velocity_km_s = 17;
  const damage_radius_km = approxDamageRadiusKm(diameter_m, velocity_km_s);

  if (status === "loading") {
    return (
      <p className="font-mono text-[10px] text-zinc-500">
        <span className="animate-pulse">
          Querying JPL Sentry-II for top virtual impactor…
        </span>
      </p>
    );
  }

  if (status === "error") {
    return (
      <p className="rounded border border-amber-700/40 bg-amber-950/20 px-2 py-1 font-mono text-[10px] text-amber-200">
        ⚠ Sentry-II lookup failed: {errorMessage ?? "unknown error"}
      </p>
    );
  }

  if (status === "none" || estimate == null) {
    return (
      <div className="rounded border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-[10px] leading-relaxed text-zinc-400">
        <p>
          <span className="font-mono uppercase tracking-wider text-zinc-300">
            No active Sentry-II corridor.
          </span>{" "}
          {neo.name} is not currently in JPL's risk list — either the orbit
          determination converged with zero positive-IP virtual impactors
          (e.g. Apophis after the 2021 radar campaign) or the object was
          never tracked by Sentry.
        </p>
        <p className="mt-1.5 text-zinc-500">
          Source:{" "}
          <a
            className="text-zinc-400 underline-offset-2 hover:text-zinc-300 hover:underline"
            href="https://cneos.jpl.nasa.gov/sentry/"
            target="_blank"
            rel="noopener noreferrer"
          >
            JPL CNEOS Sentry-II ↗
          </a>
        </p>
      </div>
    );
  }

  return (
    <div>
      <ImpactCorridor2D
        impactLatitudeDeg={estimate.center_latitude_deg}
        impactLongitudeDeg={estimate.center_longitude_deg}
        damageRadiusKm={damage_radius_km}
        corridorType="real_jpl_sentry"
        realCorridor={estimate}
      />
      <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-500">
        Top virtual impactor:{" "}
        <span className="font-mono text-zinc-300">
          {estimate.based_on_vi_date}
        </span>{" "}
        · IP={" "}
        <span className="font-mono text-zinc-300">
          {estimate.based_on_vi_ip.toExponential(2)}
        </span>
        {estimate.based_on_vi_sigma != null && (
          <>
            {" "}
            · σ ={" "}
            <span className="font-mono text-zinc-300">
              {estimate.based_on_vi_sigma.toFixed(2)}
            </span>
          </>
        )}
        . Damage circle assumes v = {velocity_km_s} km/s, density 3000 kg/m³,
        Collins et al. 2017 5-psi scaling.
      </p>
    </div>
  );
}
