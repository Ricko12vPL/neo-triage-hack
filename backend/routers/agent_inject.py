"""Operator-triggered synthetic injection endpoint.

The agent loop's normal `new_candidate` events come from a real diff
between successive MPC NEOCP polls. For demo recordings we also need
the ability to fire a controllable, identifiable event so the climax
moments (P21YR4A YR4 analogue, P21LOWRT DISSENT case) happen on cue
even if the live MPC queue stays quiet for the four-minute take.

Every event from this endpoint carries `source: "SYNTHETIC_INJECTION"`
in the WebSocket payload and `data_source: SYNTHETIC_INJECTION` in the
candidate provenance, so the frontend can render an explicit orange
"⚡ SYNTHETIC" badge — no jury can confuse this with a real tracklet.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.agent import notifier
from backend.data.mock_candidates import MOCK_CANDIDATES
from backend.models.schemas import Candidate
from backend.routers.meta import record_synthetic_injection
from backend.services.expert_classifier import get_expert_classifier
from backend.services.ranker import get_ranker

router = APIRouter(prefix="/api/agent", tags=["agent"])
_log = logging.getLogger(__name__)


TemplateName = Literal["p21yr4a_replay", "p21lowrt_dissent", "high_confidence_neo"]


class InjectionResult(BaseModel):
    injected_trksub: str
    template: TemplateName
    timestamp_utc: str
    expert_review_endorsement: str | None = None
    note: str = (
        "This event was operator-triggered for demo recording. The frontend"
        " renders a SYNTHETIC badge so reviewers see the difference vs. real"
        " MPC NEOCP detections."
    )


def _template_for(template: TemplateName) -> Candidate:
    """Pick the template's source Candidate from MOCK_CANDIDATES.

    P21YR4A and P21LOWRT both already exist as fixtures in
    backend/data/mock_candidates.py — the injection endpoint just
    builds a fresh trksub-stamped clone so multiple injections during
    a recording produce distinct events.
    """
    if template == "p21yr4a_replay":
        base = next(c for c in MOCK_CANDIDATES if c.trksub == "P21YR4A")
    elif template == "p21lowrt_dissent":
        base = next(c for c in MOCK_CANDIDATES if c.trksub == "P21LOWRT")
    elif template == "high_confidence_neo":
        base = next(c for c in MOCK_CANDIDATES if c.trksub == "P21a3Kx")
    else:  # defensive — Pydantic Literal already enforces, but explicit is good
        raise HTTPException(400, f"unknown template: {template}")

    suffix = datetime.now(UTC).strftime("%H%M")
    return base.model_copy(
        update={
            "trksub": f"{base.trksub}-{suffix}",
            "data_source": "SYNTHETIC_INJECTION",
            "data_source_url": None,
            "data_source_fetched_at_utc": datetime.now(UTC),
        }
    )


@router.post("/inject-synthetic", response_model=InjectionResult)
async def inject_synthetic_candidate(
    template: TemplateName = "p21yr4a_replay",
) -> InjectionResult:
    """Fire a clearly-labeled synthetic new_candidate event for demo use."""
    candidate = _template_for(template)

    ranker = get_ranker()
    prediction = ranker.predict(candidate).model_copy(
        update={"trksub": candidate.trksub}
    )

    expert_payload: dict[str, Any] | None = None
    expert_endorsement: str | None = None
    try:
        classifier = get_expert_classifier()
        review = await classifier.review_one(candidate, prediction)
        expert_payload = review.model_dump(mode="json")
        expert_endorsement = review.class_endorsement
    except Exception as exc:  # noqa: BLE001 — review is optional
        _log.warning("synthetic injection: expert review failed (%s)", exc)

    timestamp = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    await notifier.broadcast(
        {
            "type": "new_candidate",
            "source": "SYNTHETIC_INJECTION",
            "candidate": candidate.model_dump(mode="json"),
            "prediction": prediction.model_dump(mode="json"),
            "briefing_preview": (
                f"Synthetic {template} injection — operator-triggered for demo."
            ),
            "expert_review": expert_payload,
            "timestamp": timestamp,
        }
    )

    record_synthetic_injection()
    _log.info(
        "synthetic injection fired: template=%s trksub=%s endorsement=%s",
        template, candidate.trksub, expert_endorsement,
    )

    return InjectionResult(
        injected_trksub=candidate.trksub,
        template=template,
        timestamp_utc=timestamp,
        expert_review_endorsement=expert_endorsement,
    )
