from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import utcnow

ISSUE_STATUSES = ("open", "investigating", "in_progress", "resolved", "wont_fix")
ISSUE_PRIORITIES = ("P0", "P1", "P2", "P3")


class Issue(Base):
    __tablename__ = "issues"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)
    priority: Mapped[str] = mapped_column(String(4), default="P2")
    owner: Mapped[str | None] = mapped_column(String(120), nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    theme_id: Mapped[int | None] = mapped_column(
        ForeignKey("themes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Theme metrics frozen at the moment tracking started – the baseline that
    # "since tracked" deltas are measured against.
    baseline: Mapped[dict] = mapped_column(JSON, default=dict)
    activity: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
