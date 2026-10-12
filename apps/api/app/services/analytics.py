"""Dashboard analytics.

One grouped query builds a small "cube" (day x category x sentiment x theme
x ...). Every chart and KPI is then derived from it in memory, so a dashboard
load costs a single round-trip regardless of how many widgets it has - which
matters on a free-tier Postgres an ocean away from the API.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.intelligence.priority import ThemeStats, growth, score_theme
from app.intelligence.taxonomy import BY_SLUG
from app.models import Analysis, Feedback, Theme
from app.services.filters import FeedbackFilters

SENTIMENTS = ("positive", "neutral", "mixed", "negative")


@dataclass(slots=True)
class Cell:
    day: date
    category: str
    source: str
    sentiment: str
    is_complaint: bool
    resolution: str
    severity: int
    theme_id: int | None
    count: int
    score_sum: float


@dataclass(slots=True)
class Window:
    start: date
    end: date
    mid: date  # first day of the "recent" half

    @property
    def days(self) -> int:
        return (self.end - self.start).days + 1


def fetch_cube(db: Session, filters: FeedbackFilters) -> list[Cell]:
    cols = (
        Feedback.day, Feedback.category, Feedback.source, Analysis.sentiment,
        Analysis.is_complaint, Analysis.resolution, Analysis.severity, Analysis.theme_id,
    )
    stmt = (
        select(*cols, func.count(Feedback.id), func.sum(Analysis.score))
        .join(Analysis, Analysis.fingerprint == Feedback.fingerprint)
        .group_by(*cols)
    )
    return [Cell(*row) for row in db.execute(filters.apply(stmt)).all()]


def window_of(cells: list[Cell], filters: FeedbackFilters) -> Window | None:
    if not cells:
        return None
    start = filters.date_from or min(c.day for c in cells)
    end = filters.date_to or max(c.day for c in cells)
    if end < start:
        start, end = end, start
    mid = start + timedelta(days=((end - start).days + 1) // 2)
    return Window(start=start, end=end, mid=mid)


def _bucket(day: date, granularity: str) -> date:
    if granularity == "week":
        return day - timedelta(days=day.weekday())
    if granularity == "month":
        return day.replace(day=1)
    return day


def _granularity(window: Window) -> str:
    return "day" if window.days <= 45 else "week" if window.days <= 240 else "month"


def _kpis(cells: list[Cell]) -> dict:
    total = sum(c.count for c in cells)
    by_sent = defaultdict(int)
    complaints = unresolved = critical = 0
    score_sum = 0.0
    for c in cells:
        by_sent[c.sentiment] += c.count
        score_sum += c.score_sum or 0.0
        if c.is_complaint:
            complaints += c.count
            if c.resolution == "unresolved":
                unresolved += c.count
            if c.severity >= 4:
                critical += c.count
    def pct(n, d):
        return (round(100 * n / d, 1) if d else 0.0)
    return {
        "total": total,
        "positive": by_sent["positive"],
        "negative": by_sent["negative"],
        "mixed": by_sent["mixed"],
        "neutral": by_sent["neutral"],
        # Net Sentiment Score: % positive minus % negative, -100..100.
        "nss": round(100 * (by_sent["positive"] - by_sent["negative"]) / total, 1) if total else 0.0,
        "complaints": complaints,
        "complaint_rate": pct(complaints, total),
        "unresolved": unresolved,
        "unresolved_rate": pct(unresolved, complaints),
        "critical": critical,
        "avg_score": round(score_sum / total, 3) if total else 0.0,
    }


def theme_rollup(cells: list[Cell], window: Window, themes: dict[int, Theme]) -> list[dict]:
    """Per-theme stats + priority, the shared basis for dashboard and recommendations."""
    total_feedback = sum(c.count for c in cells)
    acc: dict[int | None, dict] = defaultdict(
        lambda: {"mentions": 0, "complaints": 0, "unresolved": 0, "sev_sum": 0, "recent": 0,
                 "previous": 0, "positive": 0, "unresolved_by_sev": defaultdict(int),
                 "series": defaultdict(int)}
    )
    granularity = _granularity(window)
    for c in cells:
        a = acc[c.theme_id]
        a["mentions"] += c.count
        if c.sentiment == "positive":
            a["positive"] += c.count
        if c.is_complaint:
            a["complaints"] += c.count
            a["sev_sum"] += c.severity * c.count
            a["series"][_bucket(c.day, granularity)] += c.count
            if c.resolution == "unresolved":
                a["unresolved"] += c.count
                a["unresolved_by_sev"][c.severity] += c.count
            if c.day >= window.mid:
                a["recent"] += c.count
            else:
                a["previous"] += c.count

    max_complaints = max((a["complaints"] for a in acc.values()), default=0)
    buckets = sorted({_bucket(c.day, granularity) for c in cells})
    rows: list[dict] = []
    for theme_id, a in acc.items():
        theme = themes.get(theme_id) if theme_id is not None else None
        definition = BY_SLUG.get(theme.slug) if theme else None
        impact = definition.impact if definition else 2
        stats = ThemeStats(
            mentions=a["mentions"], complaints=a["complaints"], unresolved=a["unresolved"],
            severity_avg=a["sev_sum"] / a["complaints"] if a["complaints"] else 1.0,
            impact=impact, recent=a["recent"], previous=a["previous"],
            total_feedback=total_feedback,
        )
        priority = score_theme(stats, max_complaints)
        rows.append(
            {
                "theme_id": theme_id,
                "slug": theme.slug if theme else "uncategorised",
                "label": theme.label if theme else "Uncategorised",
                "area": theme.area if theme else "General",
                "kind": theme.kind if theme else "known",
                "polarity": theme.polarity if theme else "neutral",
                "description": theme.description if theme else "",
                "mentions": a["mentions"],
                "complaints": a["complaints"],
                "unresolved": a["unresolved"],
                "positive": a["positive"],
                "severity_avg": round(stats.severity_avg, 2),
                "unresolved_by_severity": dict(a["unresolved_by_sev"]),
                "series": [a["series"].get(b, 0) for b in buckets],
                "priority": priority.as_dict(),
            }
        )
    return rows


def load_themes(db: Session) -> dict[int, Theme]:
    return {t.id: t for t in db.scalars(select(Theme)).all()}


def facets(db: Session) -> dict:
    """Filter options, independent of the active filters."""
    categories = db.execute(
        select(Feedback.category, func.count()).group_by(Feedback.category).order_by(func.count().desc())
    ).all()
    sources = db.execute(
        select(Feedback.source, func.count()).group_by(Feedback.source).order_by(func.count().desc())
    ).all()
    themes = db.execute(
        select(Theme.id, Theme.label, Theme.area, Theme.polarity, Theme.kind, func.count(Feedback.id))
        .join(Analysis, Analysis.theme_id == Theme.id)
        .join(Feedback, Feedback.fingerprint == Analysis.fingerprint)
        .group_by(Theme.id, Theme.label, Theme.area, Theme.polarity, Theme.kind)
        .order_by(func.count(Feedback.id).desc())
    ).all()
    bounds = db.execute(select(func.min(Feedback.day), func.max(Feedback.day))).one()
    return {
        "categories": [{"value": v, "count": n} for v, n in categories],
        "sources": [{"value": v, "count": n} for v, n in sources],
        "themes": [
            {"id": i, "label": label, "area": area, "polarity": pol, "kind": kind, "count": n}
            for i, label, area, pol, kind, n in themes
        ],
        "date_min": bounds[0].isoformat() if bounds[0] else None,
        "date_max": bounds[1].isoformat() if bounds[1] else None,
    }


def dashboard(db: Session, filters: FeedbackFilters) -> dict:
    cells = fetch_cube(db, filters)
    window = window_of(cells, filters)
    meta = dataset_meta(db)
    if window is None:
        return {"empty": True, "meta": meta, "kpis": _kpis([]), "sentiment": [], "trend": [],
                "by_category": [], "by_source": [], "top_issues": [], "top_praise": [],
                "severity": [], "window": None}

    recent = [c for c in cells if c.day >= window.mid]
    previous = [c for c in cells if c.day < window.mid]
    kpis, k_recent, k_prev = _kpis(cells), _kpis(recent), _kpis(previous)
    change = None
    if previous and recent:
        vol = growth(k_recent["total"], k_prev["total"])
        change = {
            "total_pct": None if vol is None else round(100 * vol, 1),
            "nss_pts": round(k_recent["nss"] - k_prev["nss"], 1),
            "complaint_rate_pts": round(k_recent["complaint_rate"] - k_prev["complaint_rate"], 1),
            "unresolved_rate_pts": round(k_recent["unresolved_rate"] - k_prev["unresolved_rate"], 1),
            "critical_pct": (
                None if (g := growth(k_recent["critical"], k_prev["critical"])) is None
                else round(100 * g, 1)
            ),
        }

    granularity = _granularity(window)
    trend_acc: dict[date, dict] = defaultdict(lambda: {s: 0 for s in SENTIMENTS} | {"complaints": 0})
    cat_acc: dict[str, dict] = defaultdict(lambda: {s: 0 for s in SENTIMENTS} | {"complaints": 0})
    src_acc: dict[str, int] = defaultdict(int)
    sev_acc: dict[int, int] = defaultdict(int)
    for c in cells:
        t = trend_acc[_bucket(c.day, granularity)]
        t[c.sentiment] += c.count
        k = cat_acc[c.category]
        k[c.sentiment] += c.count
        src_acc[c.source] += c.count
        if c.is_complaint:
            t["complaints"] += c.count
            k["complaints"] += c.count
            sev_acc[c.severity] += c.count

    def with_totals(row: dict) -> dict:
        total = sum(row[s] for s in SENTIMENTS)
        return row | {
            "total": total,
            "nss": round(100 * (row["positive"] - row["negative"]) / total, 1) if total else 0.0,
            "complaint_rate": round(100 * row["complaints"] / total, 1) if total else 0.0,
        }

    themes = theme_rollup(cells, window, load_themes(db))
    issues = sorted(
        (t for t in themes if t["complaints"] > 0),
        key=lambda t: (-t["priority"]["score"], -t["complaints"]),
    )
    praise = sorted(
        (t for t in themes if t["polarity"] == "praise" and t["positive"] > 0),
        key=lambda t: -t["positive"],
    )
    return {
        "empty": False,
        "meta": meta,
        "window": {"start": window.start.isoformat(), "end": window.end.isoformat(),
                   "mid": window.mid.isoformat(), "days": window.days, "granularity": granularity},
        "kpis": kpis,
        "change": change,
        "sentiment": [{"sentiment": s, "count": kpis[s]} for s in SENTIMENTS],
        "trend": [
            {"bucket": b.isoformat()} | with_totals(row) for b, row in sorted(trend_acc.items())
        ],
        "by_category": sorted(
            ({"category": name} | with_totals(row) for name, row in cat_acc.items()),
            key=lambda r: -r["total"],
        ),
        "by_source": sorted(
            ({"source": s, "count": n} for s, n in src_acc.items()), key=lambda r: -r["count"]
        ),
        "severity": [{"severity": s, "count": sev_acc.get(s, 0)} for s in (4, 3, 2, 1)],
        "top_issues": issues[:10],
        "top_praise": praise[:6],
    }


def dataset_meta(db: Session) -> dict:
    total, voices, simulated = db.execute(
        select(
            func.count(Feedback.id),
            func.count(func.distinct(Feedback.fingerprint)),
            func.sum(case((Feedback.time_simulated.is_(True), 1), else_=0)),
        )
    ).one()
    engines = dict(db.execute(select(Analysis.engine, func.count()).group_by(Analysis.engine)).all())
    return {
        "total_feedback": total or 0,
        "distinct_voices": voices or 0,
        "timeline_simulated": bool(simulated),
        "simulated_rows": int(simulated or 0),
        "engines": engines,
        "adaption_enriched": engines.get("adaption", 0),
    }

# InsightFlow build iteration: commit 176
