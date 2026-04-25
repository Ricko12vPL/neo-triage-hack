"""Imminent Impactors Library — catalog loader.

Loads the curated JSON catalog of historically verified pre-impact
predictions and exposes lookup + listing helpers. The catalog is
loaded once per process; if the file changes on disk the server has
to be restarted (which is fine — this is a static reference dataset,
not live telemetry).

Strict invariants enforced at load time:

  - Every IMPACTED case has impact_time_utc, impact_lat_deg, impact_lon_deg.
  - Every CLEARED case has a corridor_polyline with >=3 vertices.
  - Every case has >=2 source citations.

If any invariant fails the loader raises ValueError so a broken catalog
can never silently ship to production.
"""
from __future__ import annotations

import json
import threading
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path

from backend.models.imminent_impactor import (
    ImminentImpactorCase,
    ImminentImpactorsSummary,
)

CATALOG_PATH = Path(__file__).resolve().parent.parent / "data" / "imminent_impactors_catalog.json"


class ImminentImpactorsLibrary:
    """In-memory catalog with O(1) designation lookup and order-stable listing.

    The list returned by `list_summaries()` preserves the catalog's
    chronological order (oldest discovery first); 2024 YR4 sorts last
    because it was discovered most recently (2024-12-27) — even though
    it's the only CLEARED case in the catalog.
    """

    def __init__(self, catalog_path: Path = CATALOG_PATH) -> None:
        self._cases: dict[str, ImminentImpactorCase] = {}
        self._order: list[str] = []
        self._catalog_path = catalog_path
        self._load()

    def _load(self) -> None:
        raw = json.loads(self._catalog_path.read_text(encoding="utf-8"))
        now = datetime.now(UTC)
        for entry in raw["cases"]:
            case = ImminentImpactorCase(**entry, fetched_at_utc=now)
            self._validate(case)
            self._cases[case.designation] = case
            self._order.append(case.designation)

    @staticmethod
    def _validate(case: ImminentImpactorCase) -> None:
        if case.case_type == "IMPACTED":
            if case.impact_time_utc is None:
                raise ValueError(f"{case.designation}: IMPACTED case missing impact_time_utc")
            if case.impact_lat_deg is None or case.impact_lon_deg is None:
                raise ValueError(f"{case.designation}: IMPACTED case missing impact coordinates")
        elif case.case_type == "CLEARED":
            if case.corridor_polyline is None or len(case.corridor_polyline) < 3:
                raise ValueError(
                    f"{case.designation}: CLEARED case must have corridor_polyline with >=3 vertices"
                )
            if case.cleared_date is None:
                raise ValueError(f"{case.designation}: CLEARED case missing cleared_date")
        if len(case.sources) < 2:
            raise ValueError(f"{case.designation}: must cite >=2 sources, got {len(case.sources)}")

    def get_case(self, designation: str) -> ImminentImpactorCase | None:
        return self._cases.get(designation)

    def list_cases(self) -> list[ImminentImpactorCase]:
        return [self._cases[d] for d in self._order]

    def list_summaries(self) -> list[ImminentImpactorsSummary]:
        return [
            ImminentImpactorsSummary(
                designation=c.designation,
                case_number_in_history=c.case_number_in_history,
                case_type=c.case_type,
                discovery_date_utc=c.discovery_date_utc,
                impact_time_utc=c.impact_time_utc,
                diameter_m=c.diameter_m,
                impact_lat_deg=c.impact_lat_deg,
                impact_lon_deg=c.impact_lon_deg,
                impact_location_name=c.impact_location_name,
                has_meteorite_recovery=c.meteorite_recovery is not None,
                has_corridor_polyline=c.corridor_polyline is not None,
                historical_significance=c.historical_significance,
            )
            for c in self.list_cases()
        ]

    def list_sorted_by_date(self) -> list[ImminentImpactorCase]:
        """Return cases sorted by discovery_date_utc ascending.

        The catalog is already chronological so this is identical to
        list_cases() in practice — but exposing it as a separate method
        lets the API contract document the ordering guarantee.
        """
        return sorted(self.list_cases(), key=lambda c: c.discovery_date_utc)


_library_lock = threading.Lock()


@lru_cache(maxsize=1)
def get_library() -> ImminentImpactorsLibrary:
    """Process-wide singleton; thread-safe via the LRU + threading lock."""
    with _library_lock:
        return ImminentImpactorsLibrary()
