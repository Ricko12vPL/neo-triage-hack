"""Synthetic labeled training data for the v0.1 Bayesian ranker.

This is explicitly a placeholder — it approximates the feature
distributions we'd expect from Vereš et al. 2025 NEOCP disposition
statistics (NEO / MBA / ARTIFACT / COMET / UNCONFIRMED), based on
published numbers in the research subfolder 05-ml/MODEL_CARD.md.

Two critical invariants:
- All samples carry a synthetic `submit_datetime`; training code must
  use a *temporal* split (NN-09), never a random shuffle, so the
  ranker never sees future-leaked data.
- Each sample lands on a single disposition class; the PHA flag is a
  subflag of NEO (≈15% of NEO rows are PHA-positive).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

import numpy as np
import numpy.typing as npt
import polars as pl

CLASS_LABELS = ("NEO", "MBA", "ARTIFACT", "COMET", "UNCONFIRMED")
CLASS_FRACTIONS = {"NEO": 0.55, "MBA": 0.30, "ARTIFACT": 0.10, "COMET": 0.03, "UNCONFIRMED": 0.02}
PHA_FRACTION_AMONG_NEO = 0.15


@dataclass(frozen=True)
class SyntheticConfig:
    n_samples: int = 2000
    seed: int = 42
    start_datetime: datetime = datetime(2025, 1, 1)
    span_days: int = 365


def _sample_class_counts(n: int, rng: np.random.Generator) -> dict[str, int]:
    fractions = np.array([CLASS_FRACTIONS[c] for c in CLASS_LABELS])
    # Expected counts; distribute the rounding remainder to NEO for stability.
    counts = np.floor(fractions * n).astype(int)
    remainder = n - counts.sum()
    counts[0] += remainder
    return dict(zip(CLASS_LABELS, counts, strict=True))


def _sample_neo(n: int, rng: np.random.Generator) -> dict[str, npt.NDArray[np.float64]]:
    return {
        "digest2_neo_noid": np.clip(
            rng.beta(6.0, 1.5, n) * 40 + 60, 60, 100
        ).astype(int),
        "rate_arcsec_min": np.clip(rng.lognormal(np.log(1.8), 0.45, n), 0.5, 5.0),
        "mean_magnitude_v": rng.uniform(18.0, 22.0, n),
        "arc_length_minutes": np.clip(rng.lognormal(np.log(25.0), 0.6, n), 5.0, 180.0),
        "n_observations": rng.integers(3, 10, n),
        "ecliptic_latitude_deg": rng.laplace(0.0, 15.0, n),
    }


def _sample_mba(n: int, rng: np.random.Generator) -> dict[str, npt.NDArray[np.float64]]:
    return {
        "digest2_neo_noid": np.clip(
            rng.beta(2.0, 2.0, n) * 60 + 20, 20, 80
        ).astype(int),
        "rate_arcsec_min": np.clip(rng.lognormal(np.log(0.4), 0.35, n), 0.1, 1.2),
        "mean_magnitude_v": rng.uniform(19.0, 22.5, n),
        "arc_length_minutes": np.clip(rng.lognormal(np.log(30.0), 0.5, n), 8.0, 200.0),
        "n_observations": rng.integers(4, 12, n),
        "ecliptic_latitude_deg": rng.laplace(0.0, 5.0, n),
    }


def _sample_artifact(n: int, rng: np.random.Generator) -> dict[str, npt.NDArray[np.float64]]:
    # Rate is bimodal — streak artifacts (very fast) or cosmic-ray/hot-pixel
    # pairings (near-zero motion).
    rate_mode_fast = rng.random(n) < 0.5
    rate_fast = rng.lognormal(np.log(6.0), 0.4, n)
    rate_slow = rng.lognormal(np.log(0.08), 0.5, n)
    rate = np.where(rate_mode_fast, rate_fast, rate_slow)
    return {
        "digest2_neo_noid": rng.integers(0, 40, n),
        "rate_arcsec_min": np.clip(rate, 0.01, 15.0),
        "mean_magnitude_v": rng.uniform(19.0, 22.5, n),
        "arc_length_minutes": np.clip(rng.lognormal(np.log(6.0), 0.4, n), 2.0, 20.0),
        "n_observations": rng.integers(2, 4, n),
        "ecliptic_latitude_deg": rng.laplace(0.0, 40.0, n),
    }


def _sample_comet(n: int, rng: np.random.Generator) -> dict[str, npt.NDArray[np.float64]]:
    return {
        "digest2_neo_noid": np.clip(rng.integers(30, 85, n), 30, 85),
        "rate_arcsec_min": np.clip(rng.lognormal(np.log(0.6), 0.5, n), 0.1, 2.5),
        "mean_magnitude_v": rng.uniform(17.0, 21.0, n),
        "arc_length_minutes": np.clip(rng.lognormal(np.log(40.0), 0.5, n), 10.0, 240.0),
        "n_observations": rng.integers(5, 15, n),
        "ecliptic_latitude_deg": rng.laplace(0.0, 25.0, n),
    }


def _sample_unconfirmed(n: int, rng: np.random.Generator) -> dict[str, npt.NDArray[np.float64]]:
    return {
        "digest2_neo_noid": rng.integers(35, 75, n),
        "rate_arcsec_min": np.clip(rng.lognormal(np.log(1.0), 0.8, n), 0.1, 4.0),
        "mean_magnitude_v": rng.uniform(20.0, 22.5, n),
        "arc_length_minutes": np.clip(rng.lognormal(np.log(12.0), 0.4, n), 3.0, 30.0),
        "n_observations": rng.integers(2, 5, n),
        "ecliptic_latitude_deg": rng.laplace(0.0, 20.0, n),
    }


_CLASS_SAMPLERS = {
    "NEO": _sample_neo,
    "MBA": _sample_mba,
    "ARTIFACT": _sample_artifact,
    "COMET": _sample_comet,
    "UNCONFIRMED": _sample_unconfirmed,
}


def generate(config: SyntheticConfig | None = None) -> pl.DataFrame:
    """Generate a synthetic labeled dataset.

    Returns a Polars DataFrame with one row per candidate and columns
    matching `Candidate` schema plus `disposition` (class label) and
    `is_pha` (subflag of NEO) and `submit_datetime` (for temporal split).
    """
    cfg = config or SyntheticConfig()
    rng = np.random.default_rng(cfg.seed)

    counts = _sample_class_counts(cfg.n_samples, rng)
    frames: list[pl.DataFrame] = []

    for class_label, n in counts.items():
        if n == 0:
            continue
        features = _CLASS_SAMPLERS[class_label](n, rng)
        df = pl.DataFrame(features)
        df = df.with_columns(
            pl.lit(class_label).alias("disposition"),
        )
        # PHA flag: only NEO rows can be PHA.
        if class_label == "NEO":
            pha_mask = rng.random(n) < PHA_FRACTION_AMONG_NEO
            df = df.with_columns(pl.Series("is_pha", pha_mask))
        else:
            df = df.with_columns(pl.lit(False).alias("is_pha"))
        frames.append(df)

    combined = pl.concat(frames, how="vertical")

    # Randomize submit_datetime across the span, then sort temporally so
    # the caller can slice a temporal split directly.
    random_seconds = rng.integers(0, cfg.span_days * 86400, len(combined))
    submit_datetimes = [
        cfg.start_datetime + timedelta(seconds=int(s)) for s in random_seconds
    ]
    return (
        combined.with_columns(pl.Series("submit_datetime", submit_datetimes))
        .sort("submit_datetime")
    )


def temporal_split(
    df: pl.DataFrame,
    *,
    train_fraction: float = 0.70,
    val_fraction: float = 0.15,
) -> tuple[pl.DataFrame, pl.DataFrame, pl.DataFrame]:
    """Split a sorted DataFrame into (train, val, test) respecting time order.

    The DataFrame must already be sorted by `submit_datetime` ascending (as
    produced by `generate`). NEVER use a random split on time-series data
    (NN-09) — future leakage would overstate metrics.
    """
    if not 0 < train_fraction < 1:
        raise ValueError("train_fraction must be in (0, 1)")
    if not 0 < val_fraction < 1:
        raise ValueError("val_fraction must be in (0, 1)")
    if train_fraction + val_fraction >= 1:
        raise ValueError("train + val fractions must leave room for test")

    n = len(df)
    train_end = int(n * train_fraction)
    val_end = int(n * (train_fraction + val_fraction))
    return df[:train_end], df[train_end:val_end], df[val_end:]
