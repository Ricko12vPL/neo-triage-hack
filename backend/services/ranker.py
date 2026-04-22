"""Bayesian ranker — sklearn GBM with isotonic calibration.

Design notes
------------
For the hackathon, we scope to an sklearn `GradientBoostingClassifier`
wrapped in `CalibratedClassifierCV` (isotonic) per PLAN.md hackathon-mode
override. The full research plan uses numpyro NUTS; that's v2.

Persistence
~~~~~~~~~~~
We do NOT pickle or joblib the fitted model (NN-01 forbids pickle in
persisted artifacts). Instead, the ranker is a deterministic function
of (seed, synthetic_data_config, model_hyperparams). On app startup we
retrain from the same seed — on 2000 synthetic samples this runs in ~3s.
Metrics are persisted as JSON alongside the training run; the
`RankerMetadata` is the actual disk artifact.

Uncertainty
~~~~~~~~~~~
The 90% credible interval on `prob_neo` is computed from the std of the
per-fold predictions inside `CalibratedClassifierCV`. This is a bootstrap-
like proxy for the posterior — adequate for v0.1 where the Claude
briefing layer provides the richer narrative.
"""
from __future__ import annotations

import json
import threading
from dataclasses import dataclass, field
from datetime import UTC, datetime
from math import log2
from pathlib import Path

import numpy as np
import polars as pl
from sklearn.calibration import CalibratedClassifierCV  # type: ignore[import-untyped]
from sklearn.ensemble import GradientBoostingClassifier  # type: ignore[import-untyped]

from backend.models.schemas import Candidate, Prediction
from backend.services import metrics as metrics_mod
from backend.services.features import FEATURE_NAMES, candidate_to_features, dataframe_to_features
from backend.services.synthetic_data import (
    CLASS_LABELS,
    SyntheticConfig,
    generate,
    temporal_split,
)

MODEL_VERSION = "bayesian_v0.1_gbm_isotonic"
BASE_MODEL_KWARGS = {
    "n_estimators": 200,
    "max_depth": 4,
    "learning_rate": 0.05,
    "random_state": 42,
    "subsample": 0.9,
}
CALIBRATION_CV_FOLDS = 5
Z_90 = 1.645  # 90% CI half-width multiplier on a normal approximation


@dataclass
class RankerMetrics:
    accuracy: float
    neo_recall: float
    pha_recall: float
    ece: float
    brier_neo: float
    n_train: int
    n_val: int
    n_test: int


@dataclass
class RankerMetadata:
    model_version: str
    feature_names: tuple[str, ...]
    class_labels: tuple[str, ...]
    training_config: dict[str, object]
    metrics_val: RankerMetrics
    metrics_test: RankerMetrics
    trained_at: str
    note: str = field(
        default=(
            "Trained on synthetic data approximating Vereš 2025 feature "
            "distributions. Real-data integration is v1.1 scope."
        )
    )


class Ranker:
    """Thread-safe in-memory ranker."""

    def __init__(
        self,
        calibrated_model: CalibratedClassifierCV,
        class_index: dict[str, int],
        metadata: RankerMetadata,
    ) -> None:
        self._model = calibrated_model
        self._class_index = class_index
        self._model_classes: tuple[str, ...] = tuple(
            str(c) for c in calibrated_model.classes_
        )
        self._metadata = metadata
        self._lock = threading.Lock()

    @property
    def metadata(self) -> RankerMetadata:
        return self._metadata

    def predict(self, candidate_or_features: Candidate | np.ndarray) -> Prediction:
        """Return a Prediction for either a Candidate or a raw feature vector."""
        if isinstance(candidate_or_features, np.ndarray):
            feats = candidate_or_features.reshape(1, -1)
            trksub = "<unknown>"
        else:
            feats = candidate_to_features(candidate_or_features).reshape(1, -1)
            trksub = candidate_or_features.trksub

        with self._lock:
            probs = self._model.predict_proba(feats)[0]
            fold_probs = _per_fold_probs(self._model, feats)[0]

        neo_idx = self._class_index["NEO"]
        prob_neo = float(probs[neo_idx])
        prob_neo_std = float(fold_probs[:, neo_idx].std())
        ci_low = max(0.0, prob_neo - Z_90 * prob_neo_std)
        ci_high = min(1.0, prob_neo + Z_90 * prob_neo_std)

        # P(PHA) approximated as P(NEO) × PHA-among-NEO fraction.
        from backend.services.synthetic_data import PHA_FRACTION_AMONG_NEO
        prob_pha = prob_neo * PHA_FRACTION_AMONG_NEO

        map_idx = int(probs.argmax())
        map_class = self._model_classes[map_idx]

        entropy = 0.0
        for p in probs:
            if p > 0:
                entropy -= float(p) * log2(float(p))

        return Prediction(
            trksub=trksub,
            prob_neo=prob_neo,
            prob_pha=prob_pha,
            prob_neo_ci_90=(ci_low, ci_high),
            map_class=map_class,  # type: ignore[arg-type]
            uncertainty_entropy_bits=entropy,
            model_version=MODEL_VERSION,
        )


def _per_fold_probs(model: CalibratedClassifierCV, X: np.ndarray) -> np.ndarray:
    """Return per-fold predicted probabilities, shape (n_samples, n_folds, n_classes)."""
    return np.stack(
        [cc.predict_proba(X) for cc in model.calibrated_classifiers_],
        axis=1,
    )


def _evaluate(
    model: CalibratedClassifierCV,
    class_index: dict[str, int],
    df: pl.DataFrame,
) -> RankerMetrics:
    X = dataframe_to_features(df)
    y_true_label = df["disposition"].to_numpy()
    probs = model.predict_proba(X)
    model_classes = np.array([str(c) for c in model.classes_])
    preds_idx = probs.argmax(axis=1)
    pred_labels = model_classes[preds_idx]

    neo_idx = class_index["NEO"]
    prob_neo = probs[:, neo_idx]
    y_true_neo = (y_true_label == "NEO")
    y_pred_neo = (pred_labels == "NEO")

    is_pha = df["is_pha"].to_numpy()

    return RankerMetrics(
        accuracy=float((pred_labels == y_true_label).mean()),
        neo_recall=metrics_mod.compute_recall(y_true_neo, y_pred_neo),
        pha_recall=metrics_mod.compute_pha_recall(y_true_neo, y_pred_neo, is_pha),
        ece=metrics_mod.compute_ece(y_true_neo, prob_neo),
        brier_neo=metrics_mod.compute_brier(y_true_neo, prob_neo),
        n_train=0,
        n_val=0,
        n_test=len(df),
    )


def train_ranker(config: SyntheticConfig | None = None) -> Ranker:
    """Generate data, fit calibrated GBM, evaluate, return a Ranker instance."""
    cfg = config or SyntheticConfig()
    df = generate(cfg)
    train_df, val_df, test_df = temporal_split(df)

    X_train = dataframe_to_features(train_df)
    y_train = train_df["disposition"].to_numpy()

    base = GradientBoostingClassifier(**BASE_MODEL_KWARGS)
    model = CalibratedClassifierCV(
        base, method="isotonic", cv=CALIBRATION_CV_FOLDS
    )
    model.fit(X_train, y_train)

    class_index = {str(label): int(idx) for idx, label in enumerate(model.classes_)}
    # Ensure all canonical labels are present in the fitted model.
    for label in CLASS_LABELS:
        if label not in class_index:
            raise RuntimeError(
                f"Fitted model missing class '{label}' — training data may be too small"
            )

    val_metrics = _evaluate(model, class_index, val_df)
    val_metrics.n_train = len(train_df)
    val_metrics.n_val = len(val_df)
    val_metrics.n_test = len(test_df)

    test_metrics = _evaluate(model, class_index, test_df)
    test_metrics.n_train = len(train_df)
    test_metrics.n_val = len(val_df)
    test_metrics.n_test = len(test_df)

    metadata = RankerMetadata(
        model_version=MODEL_VERSION,
        feature_names=FEATURE_NAMES,
        class_labels=CLASS_LABELS,
        training_config={
            "n_samples": cfg.n_samples,
            "seed": cfg.seed,
            "span_days": cfg.span_days,
            "base_model": "GradientBoostingClassifier",
            "base_model_kwargs": BASE_MODEL_KWARGS,
            "calibration_cv_folds": CALIBRATION_CV_FOLDS,
            "calibration_method": "isotonic",
            "train_fraction": 0.70,
            "val_fraction": 0.15,
            "test_fraction": 0.15,
            "split_strategy": "temporal",
        },
        metrics_val=val_metrics,
        metrics_test=test_metrics,
        trained_at=datetime.now(UTC).isoformat(),
    )

    return Ranker(model, class_index, metadata)


def save_metadata(ranker: Ranker, path: Path) -> None:
    """Persist RankerMetadata as JSON. No pickle — NN-01."""
    meta = ranker.metadata
    payload = {
        "model_version": meta.model_version,
        "feature_names": list(meta.feature_names),
        "class_labels": list(meta.class_labels),
        "training_config": meta.training_config,
        "metrics_val": meta.metrics_val.__dict__,
        "metrics_test": meta.metrics_test.__dict__,
        "trained_at": meta.trained_at,
        "note": meta.note,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, default=str))


# ---------------------------------------------------------------------
# Module-level singleton — trained lazily on first access.
# ---------------------------------------------------------------------

_ranker_singleton: Ranker | None = None
_singleton_lock = threading.Lock()


def get_ranker() -> Ranker:
    """Return the module-level Ranker, training on first call."""
    global _ranker_singleton
    if _ranker_singleton is not None:
        return _ranker_singleton
    with _singleton_lock:
        if _ranker_singleton is None:
            _ranker_singleton = train_ranker()
    return _ranker_singleton


def reset_ranker(new_ranker: Ranker | None = None) -> None:
    """Test helper: replace or clear the singleton."""
    global _ranker_singleton
    with _singleton_lock:
        _ranker_singleton = new_ranker
