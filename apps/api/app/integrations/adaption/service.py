"""Adaption enrichment workflow.

API mode is a small resumable state machine so it survives free-tier dynos
that sleep mid-run (Adaption jobs can queue for a long time):

    ingesting --(rows counted, quote fetched)--> estimated
    estimated --(user confirms the credit cost)--> running
    running   --(succeeded: download, merge, evaluate)--> completed | failed

``advance`` moves a run at most one step and is safe to call repeatedly: the
browser polls it in the cloud profile, a background thread does in local.

Manual mode covers accounts without API access: export the prepared CSV,
run it in the Adaption app, upload the adapted file back.
"""

from __future__ import annotations

import csv
import io
import logging
import re
import tempfile
import uuid
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError, ConflictError, IntegrationError, NotFoundError
from app.integrations.adaption import mapper
from app.integrations.adaption.client import get_client, sdk_version
from app.integrations.adaption.prompts import (
    BLUEPRINT,
    CONTEXT_COLUMNS,
    DATASET_COLUMNS,
    UNIVERSAL_PROMPT,
    adapt_request,
)
from app.intelligence.taxonomy import BY_SLUG
from app.models import AdaptionRun, Analysis, Feedback, Theme
from app.models.adaption import ACTIVE_STAGES
from app.models.mixins import iso
from app.services.pipeline import ensure_known_themes

logger = logging.getLogger("insightflow.adaption")
_SLUG = re.compile(r"[^a-z0-9]+")


# --------------------------------------------------------------------------- dataset
def dataset_rows(db: Session, scope: str = "all") -> list[dict]:
    """One row per distinct message, most frequent first."""
    stmt = (
        select(Feedback.fingerprint, func.min(Feedback.text), func.min(Feedback.category),
               func.count(Feedback.id))
        .join(Analysis, Analysis.fingerprint == Feedback.fingerprint)
        .group_by(Feedback.fingerprint)
        .order_by(func.count(Feedback.id).desc())
    )
    if scope == "complaints":
        stmt = stmt.where(Analysis.is_complaint.is_(True))
    elif scope == "pending":
        stmt = stmt.where(Analysis.engine != "adaption")
    return [
        {"ref": mapper.make_ref(fp), "feedback": text, "category": category, "occurrences": count}
        for fp, text, category, count in db.execute(stmt).all()
    ]


def dataset_csv(db: Session, scope: str = "all") -> str:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=DATASET_COLUMNS)
    writer.writeheader()
    writer.writerows(dataset_rows(db, scope))
    return buffer.getvalue()


def _ref_index(db: Session) -> dict[str, str]:
    return {mapper.make_ref(fp): fp for fp in db.scalars(select(Analysis.fingerprint)).all()}


# ----------------------------------------------------------------------------- merge
def _theme_id_for(db: Session, value: str, known: dict[str, int]) -> int | None:
    key = value.strip().strip('"').lower()
    if key in known and key in BY_SLUG:
        return known[key]
    label = re.sub(r"^new\s*:\s*", "", value.strip(), flags=re.I).strip(' "')
    if not label or len(label) > 80:
        return None
    slug = "adaption-" + _SLUG.sub("-", label.lower()).strip("-")[:60]
    if slug in known:
        return known[slug]
    theme = Theme(
        slug=slug, label=label[:1].upper() + label[1:], area="Emerging", kind="adaption",
        polarity="issue", description="Theme proposed by Adaption during enrichment.",
    )
    db.add(theme)
    db.flush()
    known[slug] = theme.id
    return theme.id


def merge_export(db: Session, run: AdaptionRun, raw: bytes) -> None:
    """Parse an adapted dataset and write it over the matching analyses."""
    try:
        rows = mapper.parse_export(raw)
    except ValueError as exc:
        raise AppError(f"Could not read the adapted file: {exc}", code="adaption_bad_export") from exc
    if not rows:
        raise AppError("The adapted file contains no rows.", code="adaption_empty_export")

    enrichments, unmatched = mapper.map_rows(rows, _ref_index(db))
    known = ensure_known_themes(db)
    known.update({t.slug: t.id for t in db.scalars(select(Theme)).all()})
    analyses = {
        a.fingerprint: a
        for a in db.scalars(
            select(Analysis).where(Analysis.fingerprint.in_([e.fingerprint for e in enrichments]))
        ).all()
    }
    merged = 0
    for enrichment in enrichments:
        analysis = analyses.get(enrichment.fingerprint)
        if analysis is None:
            unmatched += 1
            continue
        for key, value in enrichment.fields.items():
            setattr(analysis, key, value)
        if enrichment.theme and (theme_id := _theme_id_for(db, enrichment.theme, known)):
            analysis.theme_id = theme_id
            theme = db.get(Theme, theme_id)
            if theme and theme.kind == "adaption" and not analysis.is_complaint:
                theme.polarity = "praise"
        analysis.adaption_run_id = run.id
        if enrichment.structured:
            analysis.engine = "adaption"
            analysis.confidence = max(analysis.confidence, 0.85)
        merged += 1

    run.rows_merged = merged
    run.rows_unmatched = unmatched
    if merged == 0:
        raise AppError(
            "None of the rows in the adapted file could be matched to feedback in this "
            "workspace. Export the dataset from this page and adapt that file.",
            code="adaption_no_match",
        )
    db.flush()


# ---------------------------------------------------------------------------- status
def integration_status(db: Session) -> dict:
    settings = get_settings()
    engines = dict(db.execute(select(Analysis.engine, func.count()).group_by(Analysis.engine)).all())
    total = sum(engines.values())
    return {
        "configured": settings.adaption_configured,
        "sdk_version": sdk_version(),
        "background_sync": bool(settings.background_sync),
        "distinct_messages": total,
        "enriched": engines.get("adaption", 0),
        "coverage_pct": round(100 * engines.get("adaption", 0) / total, 1) if total else 0.0,
        "engines": engines,
        "workflow": {
            "mode": "universal_prompt",
            "context_columns": CONTEXT_COLUMNS,
            "universal_prompt": UNIVERSAL_PROMPT,
            "blueprint": BLUEPRINT,
            "recipes": {"deduplication": False, "prompt_rephrase": False},
        },
    }


def serialize(run: AdaptionRun) -> dict:
    return {
        "id": run.id, "mode": run.mode, "stage": run.stage, "scope": run.scope,
        "dataset_id": run.dataset_id, "remote_run_id": run.remote_run_id,
        "options": run.options, "rows_sent": run.rows_sent, "rows_merged": run.rows_merged,
        "rows_unmatched": run.rows_unmatched, "progress_percent": run.progress_percent,
        "estimated_credits": run.estimated_credits, "estimated_minutes": run.estimated_minutes,
        "quality": run.quality, "error": run.error,
        "created_at": iso(run.created_at), "updated_at": iso(run.updated_at),
    }


def list_runs(db: Session, limit: int = 20) -> list[AdaptionRun]:
    return list(db.scalars(select(AdaptionRun).order_by(AdaptionRun.id.desc()).limit(limit)).all())


def get_run(db: Session, run_id: int) -> AdaptionRun:
    run = db.get(AdaptionRun, run_id)
    if run is None:
        raise NotFoundError("Adaption run not found.")
    return run


# --------------------------------------------------------------------------- API mode
def create_run(db: Session, *, scope: str, max_rows: int | None, reasoning_traces: bool) -> AdaptionRun:
    client = get_client()
    if db.scalar(select(func.count()).select_from(AdaptionRun).where(
            AdaptionRun.stage.in_((*ACTIVE_STAGES, "estimated")))):
        raise ConflictError("Another Adaption run is already in progress.")
    rows = dataset_rows(db, scope)
    if not rows:
        raise AppError("There is no feedback to send for this scope.", code="adaption_no_rows")

    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / f"insightflow-feedback-{uuid.uuid4().hex[:8]}.csv"
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=DATASET_COLUMNS)
            writer.writeheader()
            writer.writerows(rows)
        dataset_id = client.upload_csv(path, name=path.stem)

    run = AdaptionRun(
        mode="api", stage="ingesting", dataset_id=dataset_id, scope=scope, rows_sent=len(rows),
        options={
            "max_rows": max_rows, "reasoning_traces": reasoning_traces,
            "idempotency_key": uuid.uuid4().hex,
        },
    )
    db.add(run)
    db.flush()
    return run


def _request(run: AdaptionRun) -> dict:
    return adapt_request(
        max_rows=run.options.get("max_rows"),
        reasoning_traces=bool(run.options.get("reasoning_traces")),
        idempotency_key=run.options["idempotency_key"],
    )


def _fail(run: AdaptionRun, message: str) -> None:
    run.stage, run.error = "failed", message[:1000]


def advance(db: Session, run: AdaptionRun) -> AdaptionRun:
    """Move the run forward by at most one step. Idempotent."""
    if run.mode != "api" or run.stage not in ACTIVE_STAGES or not run.dataset_id:
        return run
    client = get_client()
    try:
        remote = client.status(run.dataset_id)
        if run.stage == "ingesting":
            if remote.status == "failed":
                _fail(run, remote.error or "Adaption could not ingest the dataset.")
            elif remote.row_count is not None:
                quote = client.adapt(run.dataset_id, _request(run), estimate=True)
                run.estimated_credits, run.estimated_minutes = quote.credits, quote.minutes
                run.stage = "estimated"
        elif run.stage == "running":
            run.progress_percent = remote.percent
            if remote.status == "failed":
                _fail(run, remote.error or "The Adaption run failed.")
            elif remote.status == "succeeded" and (
                # Guard against the pre-run "succeeded" left over from ingestion.
                remote.percent in (None, 100) and client.current_run_id(run.dataset_id) is not None
            ):
                merge_export(db, run, client.download_jsonl(run.dataset_id))
                try:
                    run.quality = client.evaluation(run.dataset_id)
                except IntegrationError as exc:  # evaluation is a bonus, never a blocker
                    logger.warning("Adaption evaluation unavailable: %s", exc.message)
                run.progress_percent = 100
                run.stage = "completed"
    except AppError as exc:
        if exc.code in ("adaption_rate_limit", "adaption_unreachable"):
            logger.info("Adaption temporarily unavailable; will retry: %s", exc.message)
        else:
            _fail(run, exc.message)
    db.flush()
    return run


def launch(db: Session, run: AdaptionRun) -> AdaptionRun:
    if run.stage != "estimated":
        raise ConflictError("This run is not waiting for confirmation.")
    started = get_client().adapt(run.dataset_id, _request(run), estimate=False)
    run.remote_run_id = started.run_id
    if started.credits is not None:
        run.estimated_credits = started.credits
    run.stage, run.progress_percent = "running", 0
    db.flush()
    return run


def cancel(db: Session, run: AdaptionRun) -> AdaptionRun:
    """Stop tracking a run that has not been launched (nothing is billed before launch)."""
    if run.stage not in ("ingesting", "estimated"):
        raise ConflictError("Only runs that have not been launched can be cancelled here.")
    _fail(run, "Cancelled before launch.")
    db.flush()
    return run


# ------------------------------------------------------------------------ manual mode
def import_manual(db: Session, raw: bytes, filename: str) -> AdaptionRun:
    run = AdaptionRun(mode="manual", stage="completed", scope="all", options={"filename": filename})
    db.add(run)
    db.flush()
    merge_export(db, run, raw)
    run.rows_sent = run.rows_merged + run.rows_unmatched
    db.flush()
    return run

# InsightFlow build iteration: commit 187

# InsightFlow build iteration: commit 188
