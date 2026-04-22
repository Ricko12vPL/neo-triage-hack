"""Feature extraction for the Bayesian ranker.

Kept simple and interpretable. These features are derived from the
observed quantities on a NEOCP tracklet — no cross-survey or orbit-fit
features enter v0.1 because the synthetic training data does not support
them.

Feature order is the wire contract between `synthetic_data`, `ranker`,
and anywhere candidate-to-feature conversion happens. Reordering here
is a breaking change.
"""
from __future__ import annotations

import numpy as np
import polars as pl

from backend.models.schemas import Candidate

FEATURE_NAMES: tuple[str, ...] = (
    "digest2_neo_noid",
    "log_rate_arcsec_min",
    "mean_magnitude_v",
    "log_arc_length_minutes",
    "n_observations",
    "abs_ecliptic_latitude_deg",
    "log_rate_to_mag_ratio",
)


def candidate_to_features(candidate: Candidate) -> np.ndarray:
    """Convert a single Candidate into the model's feature vector."""
    mag = candidate.mean_magnitude
    rate = max(candidate.rate_arcsec_min, 1e-3)
    arc = max(candidate.arc_length_minutes, 1e-3)
    return np.array(
        [
            candidate.digest2_neo_noid,
            np.log(rate),
            mag,
            np.log(arc),
            candidate.n_observations,
            abs(candidate.ecliptic_latitude_deg),
            np.log(rate) - np.log(max(mag, 1e-3)),
        ],
        dtype=np.float64,
    )


def dataframe_to_features(df: pl.DataFrame) -> np.ndarray:
    """Vectorized feature extraction for a Polars DataFrame.

    Accepts a DataFrame with synthetic-data column names (note:
    `mean_magnitude_v` rather than the Candidate field `mean_magnitude`).
    """
    rate = df["rate_arcsec_min"].to_numpy().clip(min=1e-3)
    arc = df["arc_length_minutes"].to_numpy().clip(min=1e-3)
    mag = df["mean_magnitude_v"].to_numpy()
    return np.column_stack(
        [
            df["digest2_neo_noid"].to_numpy(),
            np.log(rate),
            mag,
            np.log(arc),
            df["n_observations"].to_numpy(),
            np.abs(df["ecliptic_latitude_deg"].to_numpy()),
            np.log(rate) - np.log(np.clip(mag, 1e-3, None)),
        ]
    )
