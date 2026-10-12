"""Issue tracking: turn an insight into owned, measurable work."""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, NotFoundError
from app.models import Issue
from app.models.issue import ISSUE_PRIORITIES, ISSUE_STATUSES
from app.models.mixins import iso
from app.services.analytics import fetch_cube, load_themes, theme_rollup, window_of
from app.services.filters import FeedbackFilters
from app.services.recommendations import build_recommendations

_STATUS_LABEL = {
    "open": "Open", "investigating": "Investigating", "in_progress": "In progress",
    "resolved": "Resolved", "wont_fix": "Won't fix",
}


def _event(kind: str, message: str) -> dict:
    return {"at": datetime.now(timezone.utc).isoformat(), "kind": kind, "message": message}


def _live_theme_stats(db: Session) -> dict[int, dict]:
    filters = FeedbackFilters()
    cells = fetch_cube(db, filters)
    window = window_of(cells, filters)
    if window is None:
        return {}
    return {t["theme_id"]: t for t in theme_rollup(cells, window, load_themes(db)) if t["theme_id"]}


def serialize(issue: Issue, live: dict[int, dict]) -> dict:
    theme = live.get(issue.theme_id) if issue.theme_id else None
    current = None
    if theme:
        current = {
            "label": theme["label"],
            "area": theme["area"],
            "complaints": theme["complaints"],
            "unresolved": theme["unresolved"],
            "score": theme["priority"]["score"],
            "tier": theme["priority"]["tier"],
            "change_pct": theme["priority"]["change_pct"],
            "series": theme["series"],
        }
    return {
        "id": issue.id,
        "title": issue.title,
        "description": issue.description,
        "status": issue.status,
        "status_label": _STATUS_LABEL[issue.status],
        "priority": issue.priority,
        "owner": issue.owner,
        "due_date": issue.due_date.isoformat() if issue.due_date else None,
        "overdue": bool(
            issue.due_date and issue.due_date < date.today()
            and issue.status not in ("resolved", "wont_fix")
        ),
        "theme_id": issue.theme_id,
        "baseline": issue.baseline or {},
        "current": current,
        "activity": list(reversed(issue.activity or [])),
        "created_at": iso(issue.created_at),
        "updated_at": iso(issue.updated_at),
    }


def list_issues(db: Session) -> list[dict]:
    live = _live_theme_stats(db)
    issues = db.scalars(select(Issue).order_by(Issue.priority, Issue.created_at.desc())).all()
    return [serialize(i, live) for i in issues]


def get_issue(db: Session, issue_id: int) -> Issue:
    issue = db.get(Issue, issue_id)
    if issue is None:
        raise NotFoundError("Issue not found.")
    return issue


def create_issue(db: Session, data: dict) -> dict:
    theme_id = data.get("theme_id")
    baseline: dict = {}
    title = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip()
    priority = data.get("priority")

    if theme_id is not None:
        rec = next(
            (r for r in build_recommendations(db, FeedbackFilters(), limit=200)["items"]
             if r["theme"]["theme_id"] == theme_id),
            None,
        )
        if rec:
            title = title or rec["theme"]["label"]
            description = description or rec["headline"]
            priority = priority or rec["priority"]["tier"]
            baseline = {
                "captured_at": datetime.now(timezone.utc).isoformat(),
                "complaints": rec["metrics"]["complaints"],
                "unresolved": rec["metrics"]["unresolved"],
                "score": rec["priority"]["score"],
                "tier": rec["priority"]["tier"],
                "revenue_at_risk": rec["revenue_at_risk"],
            }
    if not title:
        raise AppError("An issue needs a title.", code="title_required")
    priority = priority or "P2"
    if priority not in ISSUE_PRIORITIES:
        raise AppError("Unknown priority.", code="invalid_priority")

    issue = Issue(
        title=title[:200], description=description, priority=priority, theme_id=theme_id,
        owner=(data.get("owner") or None), due_date=data.get("due_date"), baseline=baseline,
        activity=[_event("created", "Issue tracked" + (" from an insight" if baseline else ""))],
    )
    db.add(issue)
    db.flush()
    return serialize(issue, _live_theme_stats(db))


def update_issue(db: Session, issue_id: int, patch: dict) -> dict:
    issue = get_issue(db, issue_id)
    activity = list(issue.activity or [])

    if "status" in patch and patch["status"] != issue.status:
        if patch["status"] not in ISSUE_STATUSES:
            raise AppError("Unknown status.", code="invalid_status")
        activity.append(
            _event("status", f"{_STATUS_LABEL[issue.status]} → {_STATUS_LABEL[patch['status']]}")
        )
        issue.status = patch["status"]
    if "priority" in patch and patch["priority"] != issue.priority:
        if patch["priority"] not in ISSUE_PRIORITIES:
            raise AppError("Unknown priority.", code="invalid_priority")
        activity.append(_event("priority", f"Priority {issue.priority} → {patch['priority']}"))
        issue.priority = patch["priority"]
    if "owner" in patch and (patch["owner"] or None) != issue.owner:
        issue.owner = patch["owner"] or None
        activity.append(_event("owner", f"Owner set to {issue.owner}" if issue.owner else "Owner cleared"))
    if "due_date" in patch:
        issue.due_date = patch["due_date"]
    if "title" in patch and patch["title"]:
        issue.title = patch["title"][:200]
    if "description" in patch and patch["description"] is not None:
        issue.description = patch["description"]
    if patch.get("note"):
        activity.append(_event("note", patch["note"].strip()[:2000]))

    issue.activity = activity
    db.flush()
    return serialize(issue, _live_theme_stats(db))


def delete_issue(db: Session, issue_id: int) -> None:
    db.delete(get_issue(db, issue_id))
    db.flush()

# InsightFlow build iteration: commit 180
