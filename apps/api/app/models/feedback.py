from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import utcnow


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(24), default="csv")  # csv | sample | manual
    rows_total: Mapped[int] = mapped_column(Integer, default=0)
    rows_imported: Mapped[int] = mapped_column(Integer, default=0)
    rows_skipped: Mapped[int] = mapped_column(Integer, default=0)
    distinct_voices: Mapped[int] = mapped_column(Integer, default=0)
    timeline_simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Feedback(Base):
    """One raw feedback entry exactly as the customer sent it.

    AI output lives in :class:`~app.models.analysis.Analysis`, keyed by
    ``fingerprint`` – identical messages are analysed once and share the result.
    """

    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    text: Mapped[str] = mapped_column(Text)
    fingerprint: Mapped[str] = mapped_column(String(40), index=True)
    category: Mapped[str] = mapped_column(String(120), default="Uncategorised", index=True)
    source: Mapped[str] = mapped_column(String(40), default="review", index=True)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    customer: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # Calendar day of ``created_at``: lets every dashboard roll-up group in
    # portable SQL (no date_trunc/strftime dialect split).
    day: Mapped[date] = mapped_column(Date, index=True)
    # True when the source had no timestamp and one was derived from row order.
    time_simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    batch_id: Mapped[int | None] = mapped_column(
        ForeignKey("import_batches.id", ondelete="SET NULL"), nullable=True
    )

    __table_args__ = (Index("ix_feedback_day_category", "day", "category"),)

# InsightFlow build iteration: commit 203
