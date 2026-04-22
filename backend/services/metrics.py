"""Calibration and classification metrics for the Bayesian ranker.

All functions operate on NumPy arrays so the ranker module can call
them without importing sklearn metrics pieces individually — keeps the
ranker surface clean.
"""
from __future__ import annotations

import numpy as np


def compute_ece(y_true: np.ndarray, y_prob: np.ndarray, n_bins: int = 10) -> float:
    """Expected Calibration Error.

    Partitions [0, 1] into equal-width bins, averages |accuracy - confidence|
    weighted by bin size. Lower is better; well-calibrated classifiers
    trend toward 0. Target per MODEL_CARD.md §4.1 is < 0.05.
    """
    if len(y_true) != len(y_prob):
        raise ValueError("y_true and y_prob length mismatch")
    if n_bins < 1:
        raise ValueError("n_bins must be >= 1")

    y_true_arr = np.asarray(y_true, dtype=np.int64)
    y_prob_arr = np.asarray(y_prob, dtype=np.float64).clip(0.0, 1.0)
    bin_edges = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    total = len(y_true_arr)
    for i in range(n_bins):
        lo, hi = bin_edges[i], bin_edges[i + 1]
        if i == n_bins - 1:
            mask = (y_prob_arr >= lo) & (y_prob_arr <= hi)
        else:
            mask = (y_prob_arr >= lo) & (y_prob_arr < hi)
        if not mask.any():
            continue
        bin_acc = y_true_arr[mask].mean()
        bin_conf = y_prob_arr[mask].mean()
        bin_weight = mask.sum() / total
        ece += bin_weight * abs(bin_acc - bin_conf)
    return float(ece)


def compute_brier(y_true: np.ndarray, y_prob: np.ndarray) -> float:
    """Brier score — mean squared error on probabilities. Lower is better."""
    y_true_arr = np.asarray(y_true, dtype=np.float64)
    y_prob_arr = np.asarray(y_prob, dtype=np.float64)
    return float(np.mean((y_prob_arr - y_true_arr) ** 2))


def compute_recall(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Binary recall — TP / (TP + FN)."""
    y_true_arr = np.asarray(y_true, dtype=bool)
    y_pred_arr = np.asarray(y_pred, dtype=bool)
    positives = y_true_arr.sum()
    if positives == 0:
        return float("nan")
    tp = (y_true_arr & y_pred_arr).sum()
    return float(tp / positives)


def compute_pha_recall(
    y_true_neo: np.ndarray, y_pred_neo: np.ndarray, is_pha: np.ndarray
) -> float:
    """Recall on the hazardous (PHA) subset.

    Per MODEL_CARD.md §4.1, PHA recall ≥ 0.99 is the key safety bound.
    For synthetic data, `is_pha` is a subflag of NEO-class rows.
    """
    pha_mask = np.asarray(is_pha, dtype=bool)
    if not pha_mask.any():
        return float("nan")
    y_true_on_pha = np.asarray(y_true_neo, dtype=bool)[pha_mask]
    y_pred_on_pha = np.asarray(y_pred_neo, dtype=bool)[pha_mask]
    if not y_true_on_pha.any():
        return float("nan")
    tp = (y_true_on_pha & y_pred_on_pha).sum()
    return float(tp / y_true_on_pha.sum())
