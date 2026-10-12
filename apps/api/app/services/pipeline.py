"""Analysis pipeline: raw feedback -> sentiment, signals, themes.

Work is done once per *distinct* message (fingerprint). On the sample dataset
that turns 7,000 rows into 320 analyses, which is what keeps re-analysis and
Adaption runs cheap.
"""

from __future__ import annotations

import hashlib
import logging
from collections import Counter

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.intelligence.clustering import get_clusterer
from app.intelligence.sentiment import analyze_sentiment
from app.intelligence.taxonomy import TAXONOMY, match_theme
from app.intelligence.text import tokenize
from app.models import Analysis, Feedback, Theme

logger = logging.getLogger("insightflow.pipeline")
MIN_EMERGING_DOCS = 3
MIN_CLUSTER_SIZE = 2


def engine_name() -> str:
    return f"local-{get_clusterer().name}"


def ensure_known_themes(db: Session) -> dict[str, int]:
    existing = {t.slug: t for t in db.scalars(select(Theme)).all()}
    for definition in TAXONOMY:
        theme = existing.get(definition.slug)
        if theme is None:
            theme = Theme(slug=definition.slug, kind="known")
            db.add(theme)
            existing[definition.slug] = theme
        theme.label = definition.label
        theme.area = definition.area
        theme.polarity = definition.polarity
        theme.description = definition.description
    db.flush()
    return {slug: theme.id for slug, theme in existing.items()}


def analyze_pending(db: Session, *, force: bool = False) -> int:
    """Analyse every distinct message that has no analysis yet.

    ``force`` re-runs the local engine over everything except messages
    Adaption has already enriched (its output is never overwritten locally).
    """
    theme_ids = ensure_known_themes(db)
    if force:
        db.execute(delete(Analysis).where(Analysis.engine != "adaption"))
        db.flush()

    pending = db.execute(
        select(Feedback.fingerprint, func.min(Feedback.text))
        .outerjoin(Analysis, Analysis.fingerprint == Feedback.fingerprint)
        .where(Analysis.fingerprint.is_(None))
        .group_by(Feedback.fingerprint)
    ).all()

    engine = engine_name()
    for fp, text in pending:
        result = analyze_sentiment(text)
        theme = match_theme(text, sentiment=result.label, is_complaint=result.is_complaint)
        db.add(
            Analysis(
                fingerprint=fp,
                sentiment=result.label,
                score=result.score,
                confidence=result.confidence,
                is_complaint=result.is_complaint,
                resolution=result.resolution,
                severity=result.severity,
                theme_id=theme_ids[theme.slug] if theme else None,
                keywords=[w for w, _ in Counter(tokenize(text)).most_common(6)],
                signals=result.signals,
                engine=engine,
            )
        )
    db.flush()
    if pending or force:
        rebuild_emerging_themes(db)
    logger.info("Analysed %d distinct messages with %s", len(pending), engine)
    return len(pending)


def rebuild_emerging_themes(db: Session) -> int:
    """Stage two: cluster what the taxonomy could not place into emerging themes."""
    emerging_ids = set(db.scalars(select(Theme.id).where(Theme.kind == "emerging")).all())
    candidates = db.execute(
        select(Analysis, func.min(Feedback.text), func.count(Feedback.id))
        .join(Feedback, Feedback.fingerprint == Analysis.fingerprint)
        .where(Analysis.engine != "adaption")
        .where((Analysis.theme_id.is_(None)) | (Analysis.theme_id.in_(emerging_ids or {-1})))
        .group_by(Analysis.fingerprint)
    ).all()

    for analysis, _, _ in candidates:
        analysis.theme_id = None
    created = 0
    if len(candidates) >= MIN_EMERGING_DOCS:
        texts = [text for _, text, _ in candidates]
        weights = [count for _, _, count in candidates]
        for cluster in get_clusterer().cluster(texts, weights):
            if len(cluster.members) < MIN_CLUSTER_SIZE or not cluster.top_terms:
                continue
            unigrams = [t for t in cluster.top_terms if " " not in t][:3] or cluster.top_terms[:2]
            slug = "emerging-" + hashlib.sha1("|".join(sorted(unigrams)).encode()).hexdigest()[:10]
            members = [candidates[i][0] for i in cluster.members]
            complaints = sum(weights[i] for i in cluster.members if candidates[i][0].is_complaint)
            total = sum(weights[i] for i in cluster.members)
            theme = db.scalar(select(Theme).where(Theme.slug == slug)) or Theme(slug=slug)
            theme.kind = "emerging"
            theme.label = " · ".join(u.capitalize() for u in unigrams)
            theme.area = "Emerging"
            theme.polarity = "issue" if complaints * 2 >= total else "praise"
            theme.description = (
                "Discovered automatically by clustering feedback the taxonomy could not place."
            )
            theme.keywords = cluster.top_terms
            db.add(theme)
            db.flush()
            for analysis in members:
                analysis.theme_id = theme.id
            created += 1
    db.flush()
    # Drop emerging themes nothing points at any more.
    used = set(db.scalars(select(Analysis.theme_id).where(Analysis.theme_id.is_not(None))).all())
    stale = [tid for tid in emerging_ids if tid not in used]
    if stale:
        db.execute(delete(Theme).where(Theme.id.in_(stale)))
    return created

# InsightFlow build iteration: commit 175

# InsightFlow build iteration: commit 182
