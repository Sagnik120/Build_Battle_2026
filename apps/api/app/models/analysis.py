from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import utcnow


class Theme(Base):
    """A recurring topic. ``known`` themes come from the taxonomy, ``emerging``
    ones are discovered by clustering, ``adaption`` ones were proposed by Adaption."""

    __tablename__ = "themes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(160))
    area: Mapped[str] = mapped_column(String(60), default="General")
    kind: Mapped[str] = mapped_column(String(16), default="known")  # known | emerging | adaption
    polarity: Mapped[str] = mapped_column(String(12), default="issue")  # issue | praise | neutral
    description: Mapped[str] = mapped_column(Text, default="")
    keywords: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Analysis(Base):
    """AI read of one distinct message (shared by all of its duplicates)."""

    __tablename__ = "analyses"

    fingerprint: Mapped[str] = mapped_column(String(40), primary_key=True)
    sentiment: Mapped[str] = mapped_column(String(10), index=True)  # positive|negative|neutral|mixed
    score: Mapped[float] = mapped_column(Float, default=0.0)  # -1 .. 1
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    is_complaint: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    resolution: Mapped[str] = mapped_column(String(12), default="n/a")  # resolved|unresolved|n/a
    severity: Mapped[int] = mapped_column(Integer, default=1)  # 1 low .. 4 critical
    theme_id: Mapped[int | None] = mapped_column(
        ForeignKey("themes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    keywords: Mapped[list] = mapped_column(JSON, default=list)
    signals: Mapped[list] = mapped_column(JSON, default=list)  # evidence phrases behind the score
    # Which engine produced the fields above: local-sklearn | local-lite | adaption
    engine: Mapped[str] = mapped_column(String(24), default="local-lite", index=True)
    # Generative enrichment – only ever written from real Adaption output.
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    root_cause: Mapped[str | None] = mapped_column(Text, nullable=True)
    suggested_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    adaption_run_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
