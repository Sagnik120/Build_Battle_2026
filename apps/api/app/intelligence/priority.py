"""Transparent priority scoring.

Every theme gets a 0-100 score that is a weighted sum of four factors a
manager can read and argue with. No black box: the factor values and the
plain-English reasons are returned alongside the score.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass

WEIGHTS = {"reach": 0.35, "severity": 0.30, "unresolved": 0.20, "momentum": 0.15}
TIERS = ((85, "P0"), (70, "P1"), (50, "P2"), (0, "P3"))
TIER_LABEL = {"P0": "Fix now", "P1": "Fix this sprint", "P2": "Plan", "P3": "Monitor"}
# Share of affected customers assumed lost, by severity band (editable assumption).
DEFAULT_CHURN = {1: 0.05, 2: 0.15, 3: 0.35, 4: 0.60}


@dataclass(slots=True)
class ThemeStats:
    mentions: int  # all feedback tagged with the theme
    complaints: int  # of which negative/mixed complaints
    unresolved: int
    severity_avg: float  # 1..4, complaint-weighted
    impact: int  # taxonomy impact 1..4
    recent: int  # complaints in the later half of the window
    previous: int  # complaints in the earlier half
    total_feedback: int  # denominator for share


@dataclass(slots=True)
class Priority:
    score: int
    tier: str
    tier_label: str
    factors: dict[str, float]
    reasons: list[str]
    change_pct: float | None
    share_pct: float
    unresolved_pct: float

    def as_dict(self) -> dict:
        return asdict(self)


def growth(recent: int, previous: int) -> float | None:
    if previous == 0:
        return None if recent == 0 else 1.0
    return (recent - previous) / previous


def score_theme(stats: ThemeStats, max_complaints: int) -> Priority:
    reach = math.sqrt(stats.complaints / max_complaints) if max_complaints else 0.0
    severity = ((stats.severity_avg + stats.impact) / 2 - 1) / 3
    unresolved = stats.unresolved / stats.complaints if stats.complaints else 0.0
    change = growth(stats.recent, stats.previous)
    momentum = max(0.0, min(1.0, change or 0.0))

    factors = {
        "reach": round(reach, 3),
        "severity": round(max(0.0, min(1.0, severity)), 3),
        "unresolved": round(unresolved, 3),
        "momentum": round(momentum, 3),
    }
    score = round(100 * sum(WEIGHTS[k] * v for k, v in factors.items()))
    tier = next(t for threshold, t in TIERS if score >= threshold)
    share = 100 * stats.complaints / stats.total_feedback if stats.total_feedback else 0.0

    reasons: list[str] = [
        f"{stats.complaints:,} complaints — {share:.1f}% of all feedback in this period."
    ]
    if stats.impact >= 4:
        reasons.append("Direct financial harm to customers: the highest severity class.")
    elif factors["severity"] >= 0.6:
        reasons.append("High severity: customers are left without a working order or product.")
    if unresolved >= 0.6:
        reasons.append(
            f"{unresolved:.0%} of these customers describe no fix, refund or follow-up."
        )
    elif stats.complaints and unresolved <= 0.25:
        reasons.append(
            f"Mostly contained: only {unresolved:.0%} of complaints went unresolved."
        )
    if change is not None and change >= 0.15:
        reasons.append(f"Growing: up {change:.0%} versus the earlier half of the period.")
    elif change is not None and change <= -0.15:
        reasons.append(f"Easing: down {abs(change):.0%} versus the earlier half of the period.")

    return Priority(
        score=score,
        tier=tier,
        tier_label=TIER_LABEL[tier],
        factors=factors,
        reasons=reasons,
        change_pct=None if change is None else round(100 * change, 1),
        share_pct=round(share, 2),
        unresolved_pct=round(100 * unresolved, 1),
    )


def revenue_at_risk(unresolved_by_severity: dict[int, int], aov: float, churn: dict[int, float]) -> float:
    """Unresolved complainants x average order value x assumed churn for the severity band."""
    return round(
        sum(count * aov * churn.get(sev, 0.0) for sev, count in unresolved_by_severity.items()), 2
    )
