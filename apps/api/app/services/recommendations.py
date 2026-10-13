"""Turns theme statistics into ranked, evidence-backed recommendations."""

from __future__ import annotations

from collections import Counter

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.intelligence.playbooks import get_playbook
from app.intelligence.priority import DEFAULT_CHURN, WEIGHTS, revenue_at_risk
from app.intelligence.text import tokenize
from app.models import Analysis, Feedback, Issue, Setting
from app.services.analytics import dataset_meta, fetch_cube, load_themes, theme_rollup, window_of
from app.services.filters import FeedbackFilters

ASSUMPTIONS_KEY = "business_assumptions"
DEFAULT_ASSUMPTIONS = {
    "currency": "INR",
    "average_order_value": 1500,
    "churn_by_severity": {str(k): v for k, v in DEFAULT_CHURN.items()},
}


def get_assumptions(db: Session) -> dict:
    row = db.get(Setting, ASSUMPTIONS_KEY)
    return {**DEFAULT_ASSUMPTIONS, **(row.value if row else {})}


def save_assumptions(db: Session, patch: dict) -> dict:
    merged = {**get_assumptions(db), **{k: v for k, v in patch.items() if v is not None}}
    row = db.get(Setting, ASSUMPTIONS_KEY)
    if row is None:
        db.add(Setting(key=ASSUMPTIONS_KEY, value=merged))
    else:
        row.value = merged
    db.flush()
    return merged


def _evidence(db: Session, theme_id: int | None, filters: FeedbackFilters, limit: int = 3) -> list[dict]:
    """Most-repeated complaint wordings for a theme: the customer's own words."""
    stmt = (
        select(func.min(Feedback.text), func.count(Feedback.id), Analysis.severity, Analysis.resolution)
        .join(Analysis, Analysis.fingerprint == Feedback.fingerprint)
        .where(Analysis.is_complaint.is_(True))
        .group_by(Feedback.fingerprint, Analysis.severity, Analysis.resolution)
        .order_by(func.count(Feedback.id).desc())
        .limit(limit)
    )
    stmt = stmt.where(Analysis.theme_id == theme_id if theme_id is not None else Analysis.theme_id.is_(None))
    return [
        {"text": text, "count": count, "severity": severity, "resolution": resolution}
        for text, count, severity, resolution in db.execute(filters.apply(stmt)).all()
    ]


def _distinct(weighted: Counter, limit: int = 3, overlap: float = 0.3) -> list[str]:
    """Most common statements first, skipping ones that mostly repeat an earlier one."""
    kept: list[tuple[str, set[str]]] = []
    for text, _ in weighted.most_common():
        tokens = set(tokenize(text))
        if any(len(tokens & seen) / max(1, len(tokens | seen)) >= overlap for _, seen in kept):
            continue
        kept.append((text, tokens))
        if len(kept) == limit:
            break
    return [text for text, _ in kept]


def _adaption_insight(db: Session, theme_id: int | None) -> dict | None:
    """Root causes and fixes Adaption generated for messages in this theme."""
    if theme_id is None:
        return None
    rows = db.execute(
        select(Analysis.root_cause, Analysis.suggested_action, func.count(Feedback.id))
        .join(Feedback, Feedback.fingerprint == Analysis.fingerprint)
        .where(Analysis.theme_id == theme_id, Analysis.engine == "adaption")
        .group_by(Analysis.fingerprint, Analysis.root_cause, Analysis.suggested_action)
    ).all()
    if not rows:
        return None
    causes: Counter = Counter()
    actions: Counter = Counter()
    for cause, action, occurrences in rows:
        if cause and cause.strip():
            causes[cause.strip()] += occurrences
        if action and action.strip():
            actions[action.strip()] += occurrences
    if not causes and not actions:
        return None
    return {
        "messages_enriched": len(rows),
        "root_causes": _distinct(causes),
        "suggested_actions": _distinct(actions),
    }


def build_recommendations(db: Session, filters: FeedbackFilters, *, limit: int = 12) -> dict:
    cells = fetch_cube(db, filters)
    window = window_of(cells, filters)
    assumptions = get_assumptions(db)
    if window is None:
        return {"items": [], "assumptions": assumptions, "weights": WEIGHTS, "window": None,
                "timeline_simulated": False,
                "totals": {"revenue_at_risk": 0, "complaints": 0}}

    churn = {int(k): float(v) for k, v in assumptions["churn_by_severity"].items()}
    aov = float(assumptions["average_order_value"])
    tracked = {
        theme_id: issue_id
        for theme_id, issue_id in db.execute(
            select(Issue.theme_id, func.max(Issue.id))
            .where(Issue.theme_id.is_not(None), Issue.status.notin_(("resolved", "wont_fix")))
            .group_by(Issue.theme_id)
        ).all()
    }

    themes = [t for t in theme_rollup(cells, window, load_themes(db)) if t["complaints"] > 0]
    themes.sort(key=lambda t: (-t["priority"]["score"], -t["complaints"]))

    items = []
    for rank, theme in enumerate(themes[:limit], start=1):
        playbook = get_playbook(theme["slug"])
        risk = revenue_at_risk(
            {int(k): v for k, v in theme["unresolved_by_severity"].items()}, aov, churn
        )
        items.append(
            {
                "rank": rank,
                "theme": {k: theme[k] for k in ("theme_id", "slug", "label", "area", "kind", "description")},
                "priority": theme["priority"],
                "metrics": {
                    "mentions": theme["mentions"],
                    "complaints": theme["complaints"],
                    "unresolved": theme["unresolved"],
                    "severity_avg": theme["severity_avg"],
                    "series": theme["series"],
                },
                "revenue_at_risk": risk,
                "headline": playbook.headline,
                "actions": [a.as_dict() for a in playbook.actions],
                "compliance": playbook.compliance,
                "evidence": _evidence(db, theme["theme_id"], filters),
                "adaption": _adaption_insight(db, theme["theme_id"]),
                "tracked_issue_id": tracked.get(theme["theme_id"]),
            }
        )
    return {
        "items": items,
        "assumptions": assumptions,
        "weights": WEIGHTS,
        "timeline_simulated": dataset_meta(db)["timeline_simulated"],
        "window": {"start": window.start.isoformat(), "end": window.end.isoformat(),
                   "mid": window.mid.isoformat(), "days": window.days},
        "totals": {
            "revenue_at_risk": round(sum(i["revenue_at_risk"] for i in items), 2),
            "complaints": sum(i["metrics"]["complaints"] for i in items),
            "p0": sum(1 for i in items if i["priority"]["tier"] == "P0"),
            "p1": sum(1 for i in items if i["priority"]["tier"] == "P1"),
        },
    }
