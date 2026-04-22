"""Train the Bayesian ranker from synthetic data and dump metrics.

Usage:
    python scripts/train_ranker.py

Produces:
    models/ranker-v0.1-metadata.json  — training config + metrics

The trained model itself is NOT persisted (NN-01: no pickle). The app
retrains from seed on startup; training takes ~3s for 2000 samples.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

from backend.services.ranker import RankerMetrics, save_metadata, train_ranker

METADATA_PATH = Path("models/ranker-v0.1-metadata.json")


def _format_metrics(label: str, m: RankerMetrics) -> str:
    return (
        f"{label:6s}: "
        f"acc={m.accuracy:.3f}  "
        f"NEO_recall={m.neo_recall:.3f}  "
        f"PHA_recall={m.pha_recall:.3f}  "
        f"ECE={m.ece:.4f}  "
        f"Brier_NEO={m.brier_neo:.4f}  "
        f"(n={m.n_test})"
    )


def main() -> int:
    print("Training Bayesian ranker v0.1 on synthetic data...")
    t0 = time.perf_counter()
    ranker = train_ranker()
    elapsed = time.perf_counter() - t0
    meta = ranker.metadata

    print(f"  trained in {elapsed:.2f}s")
    print(f"  model_version: {meta.model_version}")
    print(f"  samples (train/val/test): "
          f"{meta.metrics_val.n_train}/{meta.metrics_val.n_val}/{meta.metrics_val.n_test}")
    print()
    print(_format_metrics("VAL",  meta.metrics_val))
    print(_format_metrics("TEST", meta.metrics_test))
    print()

    save_metadata(ranker, METADATA_PATH)
    print(f"Metadata written to {METADATA_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
