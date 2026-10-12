"""One filter object shared by the feedback list, dashboard, recommendations and reports."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date

from fastapi import Query
from sqlalchemy import Select

from app.models import Analysis, Feedback


@dataclass(slots=True)
class FeedbackFilters:
    date_from: date | None = None
    date_to: date | None = None
    categories: list[str] = field(default_factory=list)
    sentiments: list[str] = field(default_factory=list)
    theme_ids: list[int] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)
    severities: list[int] = field(default_factory=list)
    resolution: str | None = None
    complaints_only: bool = False
    q: str | None = None

    def apply(self, stmt: Select) -> Select:
        """Apply to a statement that already joins Feedback and Analysis."""
        if self.date_from:
            stmt = stmt.where(Feedback.day >= self.date_from)
        if self.date_to:
            stmt = stmt.where(Feedback.day <= self.date_to)
        if self.categories:
            stmt = stmt.where(Feedback.category.in_(self.categories))
        if self.sources:
            stmt = stmt.where(Feedback.source.in_(self.sources))
        if self.sentiments:
            stmt = stmt.where(Analysis.sentiment.in_(self.sentiments))
        if self.theme_ids:
            stmt = stmt.where(Analysis.theme_id.in_(self.theme_ids))
        if self.severities:
            stmt = stmt.where(Analysis.severity.in_(self.severities))
        if self.resolution:
            stmt = stmt.where(Analysis.resolution == self.resolution)
        if self.complaints_only:
            stmt = stmt.where(Analysis.is_complaint.is_(True))
        if self.q and self.q.strip():
            for word in self.q.strip().split()[:6]:
                stmt = stmt.where(Feedback.text.ilike(f"%{word}%"))
        return stmt

    def as_dict(self) -> dict:
        data = asdict(self)
        for key in ("date_from", "date_to"):
            data[key] = data[key].isoformat() if data[key] else None
        return data

    @classmethod
    def from_dict(cls, data: dict | None) -> FeedbackFilters:
        data = dict(data or {})
        for key in ("date_from", "date_to"):
            if data.get(key):
                data[key] = date.fromisoformat(data[key])
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


def filter_params(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    category: list[str] = Query(default_factory=list),
    sentiment: list[str] = Query(default_factory=list),
    theme: list[int] = Query(default_factory=list),
    source: list[str] = Query(default_factory=list),
    severity: list[int] = Query(default_factory=list),
    resolution: str | None = Query(None, pattern="^(resolved|unresolved)$"),
    complaints_only: bool = Query(False),
    q: str | None = Query(None, max_length=200),
) -> FeedbackFilters:
    return FeedbackFilters(
        date_from=date_from, date_to=date_to, categories=category, sentiments=sentiment,
        theme_ids=theme, sources=source, severities=severity, resolution=resolution,
        complaints_only=complaints_only, q=q,
    )

# InsightFlow build iteration: commit 178
