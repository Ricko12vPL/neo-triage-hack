import type { RankedCandidate } from "../api/types";

export type SortKey =
  | "p_neo_desc"
  | "p_pha_desc"
  | "digest2_desc"
  | "mag_asc"
  | "rate_desc";

export type SortFn = (a: RankedCandidate, b: RankedCandidate) => number;

const SORT_OPTIONS: { id: SortKey; label: string; fn: SortFn }[] = [
  {
    id: "p_neo_desc",
    label: "P(NEO)↓",
    fn: (a, b) => b.prediction.prob_neo - a.prediction.prob_neo,
  },
  {
    id: "p_pha_desc",
    label: "P(PHA)↓",
    fn: (a, b) => b.prediction.prob_pha - a.prediction.prob_pha,
  },
  {
    id: "digest2_desc",
    label: "d2↓",
    fn: (a, b) => b.digest2_neo_noid - a.digest2_neo_noid,
  },
  {
    id: "mag_asc",
    label: "BRIGHT",
    fn: (a, b) => a.mean_magnitude_v - b.mean_magnitude_v,
  },
  {
    id: "rate_desc",
    label: "FAST",
    fn: (a, b) => b.rate_arcsec_min - a.rate_arcsec_min,
  },
];

export function getSortFn(key: SortKey): SortFn {
  return SORT_OPTIONS.find((o) => o.id === key)!.fn;
}

export { SORT_OPTIONS };
