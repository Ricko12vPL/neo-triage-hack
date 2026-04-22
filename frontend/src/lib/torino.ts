// Simplified Torino Scale indicator derived from P(PHA) from our Bayesian classifier.
// The canonical Torino Scale requires impact probability × kinetic energy; we use P(PHA)
// as a directional proxy since we lack orbit-derived impact probabilities.
// Thresholds tuned so that YR4-like analogs (P(PHA)~0.9) register as Torino 3-5.

export interface TorinoResult {
  scale: number;
  label: string;
  // Tailwind color classes for the badge
  colorClasses: string;
  description: string;
}

export function computeTorinoIndicator(prob_pha: number): TorinoResult {
  if (prob_pha >= 0.80) {
    return {
      scale: 5,
      label: "Torino 5",
      colorClasses: "text-red-200 border-red-600 bg-red-900/40",
      description: "Threatening — certain collision region",
    };
  }
  if (prob_pha >= 0.50) {
    return {
      scale: 4,
      label: "Torino 4",
      colorClasses: "text-orange-200 border-orange-700 bg-orange-900/30",
      description: "Threatening close encounter",
    };
  }
  if (prob_pha >= 0.20) {
    return {
      scale: 3,
      label: "Torino 3",
      colorClasses: "text-amber-200 border-amber-700 bg-amber-900/30",
      description: "Close encounter — possible impact 2032",
    };
  }
  if (prob_pha >= 0.05) {
    return {
      scale: 2,
      label: "Torino 2",
      colorClasses: "text-yellow-300 border-yellow-700/60 bg-yellow-900/20",
      description: "Merits close monitoring",
    };
  }
  if (prob_pha >= 0.01) {
    return {
      scale: 1,
      label: "Torino 1",
      colorClasses: "text-zinc-400 border-zinc-600 bg-zinc-900/40",
      description: "Merits careful monitoring",
    };
  }
  return {
    scale: 0,
    label: "Torino 0",
    colorClasses: "text-zinc-600 border-zinc-700 bg-transparent",
    description: "No hazard",
  };
}
