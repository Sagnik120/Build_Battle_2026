from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import utcnow

# ingesting -> estimated -> running -> completed | failed   (API mode)
# completed                                                  (manual import)
ACTIVE_STAGES = ("ingesting", "running")


class AdaptionRun(Base):
    """One enrichment pass through Adaption's Adaptive Data pipeline."""

    __tablename__ = "adaption_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mode: Mapped[str] = mapped_column(String(10), default="api")  # api | manual
    stage: Mapped[str] = mapped_column(String(16), default="ingesting", index=True)
    dataset_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    remote_run_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    scope: Mapped[str] = mapped_column(String(16), default="all")  # all | complaints
    options: Mapped[dict] = mapped_column(JSON, default=dict)
    rows_sent: Mapped[int] = mapped_column(Integer, default=0)
    rows_merged: Mapped[int] = mapped_column(Integer, default=0)
    rows_unmatched: Mapped[int] = mapped_column(Integer, default=0)
    progress_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    estimated_credits: Mapped[float | None] = mapped_column(Float, nullable=True)
    estimated_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Adaption's own before/after quality evaluation, stored verbatim.
    quality: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
