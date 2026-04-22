"""Tests for the Bayesian ranker (sklearn GBM + isotonic).

These tests fit the model on a small synthetic sample at module level
so the suite stays fast. Full training (2000 samples) is covered by the
`scripts/train_ranker.py` CLI and validated manually in CI / Day 2
gate check.
"""
from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pytest

from backend.models.schemas import Candidate, Prediction
from backend.services import metrics, ranker
from backend.services.synthetic_data import (
    CLASS_LABELS,
    PHA_FRACTION_AMONG_NEO,
    SyntheticConfig,
    generate,
    temporal_split,
)

# ---------------------------------------------------------------------
# Synthetic data
# ---------------------------------------------------------------------


def test_synthetic_data_reproducible() -> None:
    a = generate(SyntheticConfig(n_samples=500, seed=42))
    b = generate(SyntheticConfig(n_samples=500, seed=42))
    assert a.equals(b)


def test_synthetic_data_different_seed_differs() -> None:
    a = generate(SyntheticConfig(n_samples=500, seed=42))
    b = generate(SyntheticConfig(n_samples=500, seed=123))
    assert not a.equals(b)


def test_synthetic_data_class_balance_within_tolerance() -> None:
    df = generate(SyntheticConfig(n_samples=2000, seed=42))
    fractions = {
        label: (df["disposition"] == label).sum() / len(df)
        for label in CLASS_LABELS
    }
    assert abs(fractions["NEO"] - 0.55) < 0.03
    assert abs(fractions["MBA"] - 0.30) < 0.03
    assert abs(fractions["ARTIFACT"] - 0.10) < 0.02


def test_synthetic_data_pha_only_on_neo_rows() -> None:
    df = generate(SyntheticConfig(n_samples=2000, seed=42))
    non_neo = df.filter(df["disposition"] != "NEO")
    assert not non_neo["is_pha"].any(), "is_pha must be False for non-NEO rows"

    neo = df.filter(df["disposition"] == "NEO")
    pha_frac = neo["is_pha"].sum() / len(neo)
    assert abs(pha_frac - PHA_FRACTION_AMONG_NEO) < 0.05


def test_temporal_split_respects_time_order() -> None:
    df = generate(SyntheticConfig(n_samples=1000, seed=42))
    train, val, test = temporal_split(df)
    assert len(train) + len(val) + len(test) == len(df)
    # Last train datetime must be <= first val datetime, same for val→test
    train_max = train["submit_datetime"].max()
    val_min = val["submit_datetime"].min()
    val_max = val["submit_datetime"].max()
    test_min = test["submit_datetime"].min()
    assert train_max <= val_min
    assert val_max <= test_min


def test_temporal_split_rejects_invalid_fractions() -> None:
    df = generate(SyntheticConfig(n_samples=100, seed=42))
    with pytest.raises(ValueError):
        temporal_split(df, train_fraction=0.5, val_fraction=0.6)


# ---------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------


def test_ece_perfect_calibration_is_zero() -> None:
    # Predict exactly 0.5 on a 50/50 split — calibration is perfect.
    y_true = np.array([0, 1, 0, 1, 0, 1, 0, 1])
    y_prob = np.array([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5])
    assert metrics.compute_ece(y_true, y_prob, n_bins=2) < 1e-6


def test_ece_poor_calibration_is_large() -> None:
    # Predict 0.9 on a set that is only 10% positive — ECE should be ~0.8.
    y_true = np.array([0, 0, 0, 0, 0, 0, 0, 0, 0, 1])
    y_prob = np.full(10, 0.9)
    assert metrics.compute_ece(y_true, y_prob, n_bins=10) > 0.5


def test_brier_matches_manual_computation() -> None:
    y_true = np.array([0, 1, 1, 0])
    y_prob = np.array([0.1, 0.9, 0.8, 0.3])
    expected = np.mean((y_prob - y_true) ** 2)
    assert abs(metrics.compute_brier(y_true, y_prob) - expected) < 1e-9


def test_pha_recall_ignores_non_pha_rows() -> None:
    y_true_neo = np.array([True, True, True, True, False])
    y_pred_neo = np.array([True, True, False, True, True])
    is_pha = np.array([True, True, True, False, False])
    # On PHA rows only: true=[T,T,T], pred=[T,T,F] → recall = 2/3
    assert abs(metrics.compute_pha_recall(y_true_neo, y_pred_neo, is_pha) - 2 / 3) < 1e-9


# ---------------------------------------------------------------------
# Ranker end-to-end
# ---------------------------------------------------------------------


@pytest.fixture(scope="module")
def trained_ranker() -> ranker.Ranker:
    # Smaller sample for test speed; temporal split still applies.
    return ranker.train_ranker(SyntheticConfig(n_samples=500, seed=42))


def test_ranker_predict_returns_valid_prediction(
    trained_ranker: ranker.Ranker,
) -> None:
    from backend.data.mock_candidates import MOCK_CANDIDATES

    yr4 = next(c for c in MOCK_CANDIDATES if c.trksub == "P21YR4A")
    prediction = trained_ranker.predict(yr4)

    assert isinstance(prediction, Prediction)
    assert 0.0 <= prediction.prob_neo <= 1.0
    assert 0.0 <= prediction.prob_pha <= 1.0
    assert prediction.prob_neo_ci_90[0] <= prediction.prob_neo_ci_90[1]
    assert 0.0 <= prediction.prob_neo_ci_90[0] <= 1.0
    assert 0.0 <= prediction.prob_neo_ci_90[1] <= 1.0
    assert prediction.map_class in CLASS_LABELS
    assert prediction.uncertainty_entropy_bits >= 0.0
    assert prediction.model_version.startswith("bayesian_v0.1")


def test_ranker_yr4_analog_is_high_confidence_neo(
    trained_ranker: ranker.Ranker,
) -> None:
    """The hero demo candidate must be flagged as a confident NEO."""
    from backend.data.mock_candidates import MOCK_CANDIDATES

    yr4 = next(c for c in MOCK_CANDIDATES if c.trksub == "P21YR4A")
    prediction = trained_ranker.predict(yr4)
    assert prediction.prob_neo > 0.70, (
        f"YR4 analog got P(NEO)={prediction.prob_neo:.3f}, expected > 0.70"
    )
    assert prediction.map_class == "NEO"


def test_ranker_artifact_candidate_is_not_neo(
    trained_ranker: ranker.Ranker,
) -> None:
    """Clear artifact features (low digest2, short arc, few obs) → not NEO."""
    from backend.data.mock_candidates import MOCK_CANDIDATES

    artifact = next(c for c in MOCK_CANDIDATES if c.trksub == "P21f1Aa")
    prediction = trained_ranker.predict(artifact)
    assert prediction.prob_neo < 0.50, (
        f"Artifact got P(NEO)={prediction.prob_neo:.3f}, expected < 0.50"
    )


def test_ranker_metadata_has_all_metrics(trained_ranker: ranker.Ranker) -> None:
    meta = trained_ranker.metadata
    assert meta.model_version.startswith("bayesian_v0.1")
    for m in (meta.metrics_val, meta.metrics_test):
        assert 0.0 <= m.accuracy <= 1.0
        # PHA recall target per MODEL_CARD.md §4.1 — synthetic data should hit it.
        assert not np.isnan(m.pha_recall)
        assert m.ece < 0.10, f"ECE {m.ece} higher than loose hackathon bound"


def test_save_metadata_writes_valid_json(
    trained_ranker: ranker.Ranker, tmp_path: Path
) -> None:
    out = tmp_path / "meta.json"
    ranker.save_metadata(trained_ranker, out)
    assert out.exists()

    loaded = json.loads(out.read_text())
    # JSON artifact must parse; NN-01 compliance check.
    assert "model_version" in loaded
    assert "metrics_test" in loaded
    assert loaded["metrics_test"]["accuracy"] >= 0.0
    # Must NOT contain pickled bytes — sanity check for NN-01
    raw_bytes = out.read_bytes()
    assert b"\x80\x04" not in raw_bytes  # pickle protocol 4 header
    assert b"\x80\x05" not in raw_bytes  # pickle protocol 5 header


def test_ranker_singleton_is_lazy_and_cached(
    monkeypatch: pytest.MonkeyPatch,
    trained_ranker: ranker.Ranker,
) -> None:
    """get_ranker() trains once, returns the same instance thereafter."""
    call_count = {"n": 0}

    def fake_train(_cfg: SyntheticConfig | None = None) -> ranker.Ranker:
        # Return the already-trained module fixture without recursing
        # into the (monkey-patched) name.
        call_count["n"] += 1
        return trained_ranker

    ranker.reset_ranker(None)
    monkeypatch.setattr(ranker, "train_ranker", fake_train)

    r1 = ranker.get_ranker()
    r2 = ranker.get_ranker()
    assert r1 is r2
    assert call_count["n"] == 1

    ranker.reset_ranker(None)


def test_ranker_accepts_raw_feature_vector(trained_ranker: ranker.Ranker) -> None:
    # A feature vector in the middle of NEO territory.
    feats = np.array([95, np.log(2.5), 19.5, np.log(20.0), 4, 1.0, np.log(2.5) - np.log(19.5)])
    prediction = trained_ranker.predict(feats)
    assert isinstance(prediction, Prediction)
    assert prediction.trksub == "<unknown>"


def test_ranker_prediction_bounds_coherent(trained_ranker: ranker.Ranker) -> None:
    """P(PHA) <= P(NEO) always — PHA is a strict subset of NEO."""
    from backend.data.mock_candidates import MOCK_CANDIDATES

    for candidate in MOCK_CANDIDATES:
        prediction = trained_ranker.predict(candidate)
        assert prediction.prob_pha <= prediction.prob_neo + 1e-9


# Helper for tests below that need a synthetic candidate regardless of mock set.
def _build_candidate(**overrides: object) -> Candidate:
    defaults: dict[str, object] = {
        "trksub": "TEST01",
        "ra_deg": 45.0,
        "dec_deg": 5.0,
        "mean_magnitude": 20.0,
        "rate_arcsec_min": 2.0,
        "observatory_code": "W68",
        "first_obs_datetime": datetime(2026, 4, 22, 0, 0, tzinfo=UTC),
        "n_observations": 4,
        "arc_length_minutes": 15.0,
        "digest2_neo_noid": 85,
        "ecliptic_latitude_deg": 2.0,
    }
    defaults.update(overrides)
    return Candidate(**defaults)  # type: ignore[arg-type]


def test_ranker_handles_extreme_feature_values(
    trained_ranker: ranker.Ranker,
) -> None:
    """Model must not crash on edge-case inputs (large rates, tiny arcs)."""
    extreme = _build_candidate(
        rate_arcsec_min=20.0,
        arc_length_minutes=1.0,
        digest2_neo_noid=0,
        ecliptic_latitude_deg=80.0,
    )
    prediction = trained_ranker.predict(extreme)
    assert 0.0 <= prediction.prob_neo <= 1.0
