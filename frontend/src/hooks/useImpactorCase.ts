import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { ImminentImpactorCase } from "../api/types";

/**
 * Fetch one entry from the Imminent Impactors Library catalog by
 * IAU designation.
 *
 * Used by the Live Feed PopulationRiskPanel to load the real
 * published trajectory + population figure for demo fixtures that
 * link to a historical case (e.g. P21YR4A → '2024 YR4'). Process-wide
 * cache so re-selecting the same demo doesn't re-hit the network.
 *
 * `null` designation parks the hook in the idle state — common case
 * for live MPC tracklets that have no real-world counterpart and
 * should render the deferred placeholder instead.
 */

const cache = new Map<string, ImminentImpactorCase>();

interface State {
  data: ImminentImpactorCase | null;
  loading: boolean;
  error: Error | null;
}

const IDLE: State = { data: null, loading: false, error: null };

export function useImpactorCase(designation: string | null | undefined): State {
  const [state, setState] = useState<State>(IDLE);

  useEffect(() => {
    if (!designation) {
      setState(IDLE);
      return;
    }
    const cached = cache.get(designation);
    if (cached) {
      setState({ data: cached, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    api
      .imminentImpactor(designation)
      .then((data) => {
        if (cancelled) return;
        cache.set(designation, data);
        setState({ data, loading: false, error: null });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setState({ data: null, loading: false, error: err });
      });
    return () => {
      cancelled = true;
    };
  }, [designation]);

  return state;
}
