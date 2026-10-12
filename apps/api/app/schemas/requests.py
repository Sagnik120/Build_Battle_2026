from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class FeedbackCreate(BaseModel):
    text: str = Field(min_length=3, max_length=5000)
    category: str | None = Field(default=None, max_length=120)
    source: str = Field(default="manual", max_length=40)
    rating: int | None = Field(default=None, ge=0, le=10)
    customer: str | None = Field(default=None, max_length=160)
    created_at: datetime | None = None


class IssueCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    description: str | None = None
    theme_id: int | None = None
    priority: Literal["P0", "P1", "P2", "P3"] | None = None
    owner: str | None = Field(default=None, max_length=120)
    due_date: date | None = None


class IssueUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    description: str | None = None
    status: Literal["open", "investigating", "in_progress", "resolved", "wont_fix"] | None = None
    priority: Literal["P0", "P1", "P2", "P3"] | None = None
    owner: str | None = Field(default=None, max_length=120)
    due_date: date | None = None
    note: str | None = Field(default=None, max_length=2000)


class ReportCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    filters: dict = Field(default_factory=dict)


class AssumptionsUpdate(BaseModel):
    average_order_value: float | None = Field(default=None, gt=0, le=10_000_000)
    churn_by_severity: dict[str, float] | None = None


class AdaptionRunCreate(BaseModel):
    scope: Literal["all", "complaints", "pending"] = "all"
    max_rows: int | None = Field(default=None, ge=1, le=100_000)
    reasoning_traces: bool = False
