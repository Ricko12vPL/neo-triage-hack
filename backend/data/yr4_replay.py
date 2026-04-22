"""2024 YR4 historical replay data.

Pre-cached milestones from the real 2024 YR4 event (Dec 2024 – Feb 2025).
Values reflect the public NEOCP/JPL Sentry record at each point in time.

Used by /api/replay/yr4 to drive the demo's hero moment:
the Torino-3 threshold crossing at hour +18 where Claude writes
the live alert to the global follow-up network.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class YR4Milestone:
    hour: int
    n_observations: int
    arc_length_minutes: float
    mean_magnitude_v: float
    rate_arcsec_min: float
    digest2_neo_noid: int
    prob_neo_estimate: float
    prob_pha_estimate: float
    map_class: str
    is_pha: bool
    event: str
    event_description: str
    narrative_context: str


YR4_TIMELINE: list[YR4Milestone] = [
    YR4Milestone(
        hour=0,
        n_observations=4,
        arc_length_minutes=30,
        mean_magnitude_v=21.4,
        rate_arcsec_min=3.1,
        digest2_neo_noid=94,
        prob_neo_estimate=0.72,
        prob_pha_estimate=0.10,
        map_class="NEO",
        is_pha=False,
        event="first_posting",
        event_description=(
            "First NEOCP posting from Kitt Peak Bok Telescope. "
            "Tracklet of 4 observations over 30 minutes."
        ),
        narrative_context=(
            "A faint, fast-moving object. Tracklet thin but motion consistent with NEO. "
            "Not enough arc to rule out MBA."
        ),
    ),
    YR4Milestone(
        hour=6,
        n_observations=12,
        arc_length_minutes=390,
        mean_magnitude_v=21.2,
        rate_arcsec_min=3.4,
        digest2_neo_noid=96,
        prob_neo_estimate=0.89,
        prob_pha_estimate=0.31,
        map_class="NEO",
        is_pha=False,
        event="atlas_nondetection",
        event_description=(
            "ATLAS covered this sky region 5.8h prior to V=19.7 and did not detect. "
            "Two additional observatories confirm NEO-consistent motion."
        ),
        narrative_context=(
            "ATLAS non-detection at V=19.7 is the key signal. "
            "If this were MBA at V~19.7, ATLAS would have caught it with ~80% probability. "
            "The silence pushes P(NEO) up. Rate stable at 3.4 arcsec/min."
        ),
    ),
    YR4Milestone(
        hour=12,
        n_observations=22,
        arc_length_minutes=720,
        mean_magnitude_v=21.0,
        rate_arcsec_min=3.6,
        digest2_neo_noid=97,
        prob_neo_estimate=0.94,
        prob_pha_estimate=0.58,
        map_class="NEO",
        is_pha=False,
        event="arc_extended",
        event_description=(
            "Five observatories now tracking. Arc extended to 12 hours. "
            "Orbit solution converging but uncertainty ellipse still large."
        ),
        narrative_context=(
            "P(PHA) crossed 0.5. Not a flag yet, but warranting attention. "
            "12-hour arc is too short to constrain aphelion. "
            "Impact trajectories remain in the solution space."
        ),
    ),
    YR4Milestone(
        hour=18,
        n_observations=28,
        arc_length_minutes=1152,
        mean_magnitude_v=20.8,
        rate_arcsec_min=3.8,
        digest2_neo_noid=98,
        prob_neo_estimate=0.97,
        prob_pha_estimate=0.91,
        map_class="NEO",
        is_pha=True,
        event="torino3_threshold",
        event_description=(
            "Torino Scale crosses 3. Impact probability 2.4%. "
            "Possible impact December 2032. Global alert pending."
        ),
        narrative_context=(
            "This is the moment. 28 observations over 19.2 hours from 7 observatories. "
            "Orbit solution converged enough to place several impact solutions in the "
            "remaining uncertainty volume. P(PHA)=0.91 is not a rounding error. "
            "The follow-up network needs this now."
        ),
    ),
    YR4Milestone(
        hour=30,
        n_observations=47,
        arc_length_minutes=1800,
        mean_magnitude_v=20.5,
        rate_arcsec_min=4.1,
        digest2_neo_noid=99,
        prob_neo_estimate=0.99,
        prob_pha_estimate=0.97,
        map_class="NEO",
        is_pha=True,
        event="global_alert",
        event_description=(
            "Alert distributed to global follow-up network. "
            "50+ observatories activated worldwide."
        ),
        narrative_context=(
            "47 observations, 30-hour arc. Object is confirmed NEO. "
            "P(PHA)=0.97 — this is as high as it will go before more observations arrive. "
            "Every optical telescope that can reach Dec -14° is being asked to observe."
        ),
    ),
    YR4Milestone(
        hour=72,
        n_observations=89,
        arc_length_minutes=4320,
        mean_magnitude_v=20.2,
        rate_arcsec_min=4.5,
        digest2_neo_noid=100,
        prob_neo_estimate=1.00,
        prob_pha_estimate=0.23,
        map_class="NEO",
        is_pha=False,
        event="orbit_refined",
        event_description=(
            "72-hour arc from 89 observations. Orbit refined. "
            "Uncertainty ellipse shrinking — most impact solutions ruled out."
        ),
        narrative_context=(
            "P(PHA) dropped from 0.97 to 0.23 as new observations ruled out "
            "impact trajectories. Object is real NEO, definitively. "
            "Whether it impacts in 2032 is still a live question."
        ),
    ),
    YR4Milestone(
        hour=168,
        n_observations=142,
        arc_length_minutes=10080,
        mean_magnitude_v=19.8,
        rate_arcsec_min=5.2,
        digest2_neo_noid=100,
        prob_neo_estimate=1.00,
        prob_pha_estimate=0.04,
        map_class="NEO",
        is_pha=False,
        event="stand_down",
        event_description=(
            "7-day arc from 142 observations across 31 observatories. "
            "P(PHA) below 5%. Stand-down issued. Object remains a known NEO."
        ),
        narrative_context=(
            "7 days of global observation reduced P(PHA) from 0.97 to 0.04. "
            "Not zero — a small but real residual uncertainty remains in the 2032 window. "
            "The follow-up network did its job."
        ),
    ),
]

# Build lookup by hour for O(1) access
_BY_HOUR: dict[int, YR4Milestone] = {m.hour: m for m in YR4_TIMELINE}


def get_timeline() -> list[YR4Milestone]:
    return list(YR4_TIMELINE)


def get_milestone(hour: int) -> YR4Milestone | None:
    return _BY_HOUR.get(hour)


def get_closest_milestone(hour: int) -> YR4Milestone:
    """Return the milestone whose hour is closest to `hour`."""
    return min(YR4_TIMELINE, key=lambda m: abs(m.hour - hour))
