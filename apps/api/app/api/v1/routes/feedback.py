from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.errors import AppError, NotFoundError
from app.intelligence.text import clean, fingerprint
from app.models import Analysis, Feedback, ImportBatch, Theme
from app.models.mixins import iso
from app.schemas.requests import FeedbackCreate
from app.services import ingest
from app.services.analytics import facets
from app.services.filters import FeedbackFilters, filter_params
from app.services.pipeline import analyze_pending

router = APIRouter(prefix="/feedback", tags=["feedback"])


def _analysis_dict(a: Analysis, themes: dict[int, Theme]) -> dict:
    theme = themes.get(a.theme_id) if a.theme_id else None
    return {
        "sentiment": a.sentiment, "score": a.score, "confidence": a.confidence,
        "is_complaint": a.is_complaint, "resolution": a.resolution, "severity": a.severity,
        "theme": {"id": theme.id, "label": theme.label, "area": theme.area, "kind": theme.kind,
                  "polarity": theme.polarity} if theme else None,
        "keywords": a.keywords, "signals": a.signals, "engine": a.engine,
        "summary": a.summary, "root_cause": a.root_cause, "suggested_action": a.suggested_action,
    }


async def _read_upload(file: UploadFile) -> bytes:
    limit = get_settings().max_upload_mb * 1024 * 1024
    raw = await file.read(limit + 1)
    if len(raw) > limit:
        raise AppError(
            f"File is larger than the {get_settings().max_upload_mb} MB limit on this deployment.",
            code="file_too_large", status_code=413,
        )
    return raw


@router.get("")
def list_feedback(
    filters: FeedbackFilters = Depends(filter_params),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    sort: Literal["newest", "oldest", "most_negative", "most_positive", "most_repeated"] = "newest",
    collapse: bool = Query(False, description="Group identical messages into one row"),
    db: Session = Depends(get_db, scope="function"),
) -> dict:
    themes = {t.id: t for t in db.scalars(select(Theme)).all()}
    offset = (page - 1) * page_size
    join = Analysis.fingerprint == Feedback.fingerprint

    if collapse:
        occurrences = func.count(Feedback.id).label("occurrences")
        base = filters.apply(
            select(
                func.min(Feedback.id), func.min(Feedback.text), func.min(Feedback.category),
                func.min(Feedback.source), func.max(Feedback.created_at), occurrences, Analysis,
            ).join(Analysis, join).group_by(Analysis.fingerprint)
        )
        order = {
            "newest": func.max(Feedback.created_at).desc(),
            "oldest": func.max(Feedback.created_at).asc(),
            "most_negative": Analysis.score.asc(),
            "most_positive": Analysis.score.desc(),
            "most_repeated": occurrences.desc(),
        }[sort]
        total = db.scalar(
            filters.apply(select(func.count(func.distinct(Feedback.fingerprint))).join(Analysis, join))
        )
        rows = db.execute(base.order_by(order, func.min(Feedback.id)).offset(offset).limit(page_size)).all()
        items = [
            {"id": fid, "text": text, "category": category, "source": source, "rating": None,
             "customer": None, "created_at": iso(created), "time_simulated": False,
             "occurrences": count, "analysis": _analysis_dict(analysis, themes)}
            for fid, text, category, source, created, count, analysis in rows
        ]
    else:
        base = filters.apply(select(Feedback, Analysis).join(Analysis, join))
        order = {
            "newest": Feedback.created_at.desc(),
            "oldest": Feedback.created_at.asc(),
            "most_negative": Analysis.score.asc(),
            "most_positive": Analysis.score.desc(),
            "most_repeated": Feedback.created_at.desc(),
        }[sort]
        total = db.scalar(filters.apply(select(func.count(Feedback.id)).join(Analysis, join)))
        rows = db.execute(base.order_by(order, Feedback.id.desc()).offset(offset).limit(page_size)).all()
        items = [
            {"id": f.id, "text": f.text, "category": f.category, "source": f.source,
             "rating": f.rating, "customer": f.customer, "created_at": iso(f.created_at),
             "time_simulated": f.time_simulated, "occurrences": 1,
             "analysis": _analysis_dict(a, themes)}
            for f, a in rows
        ]
    total = total or 0
    return {"items": items, "total": total, "page": page, "page_size": page_size,
            "pages": max(1, -(-total // page_size))}


@router.get("/facets")
def get_facets(db: Session = Depends(get_db, scope="function")) -> dict:
    return facets(db)


@router.post("", status_code=201)
def submit_feedback(body: FeedbackCreate, db: Session = Depends(get_db, scope="function")) -> dict:
    text = clean(body.text)
    created = body.created_at or datetime.now(timezone.utc)
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    item = Feedback(
        text=text, fingerprint=fingerprint(text),
        category=clean(body.category or "") or "Uncategorised",
        source=body.source.lower(), rating=body.rating, customer=body.customer,
        created_at=created, day=created.date(),
    )
    db.add(item)
    db.flush()
    analyze_pending(db)
    analysis = db.get(Analysis, item.fingerprint)
    themes = {t.id: t for t in db.scalars(select(Theme)).all()}
    return {"id": item.id, "text": item.text, "category": item.category, "source": item.source,
            "created_at": iso(item.created_at), "analysis": _analysis_dict(analysis, themes)}


@router.delete("/{feedback_id}", status_code=204)
def delete_feedback(feedback_id: int, db: Session = Depends(get_db, scope="function")) -> Response:
    item = db.get(Feedback, feedback_id)
    if item is None:
        raise NotFoundError("Feedback not found.")
    db.delete(item)
    return Response(status_code=204)


@router.post("/import/preview")
async def preview_import(file: UploadFile = File(...)) -> dict:
    parsed = ingest.parse_csv(await _read_upload(file))
    mapping = ingest.detect_mapping(parsed.headers)
    date_col = mapping.get("date")
    return {
        "filename": file.filename,
        "headers": parsed.headers,
        "row_count": len(parsed.rows),
        "mapping": mapping,
        "has_dates": bool(date_col and any(ingest.parse_date(r.get(date_col, "")) for r in parsed.rows[:50])),
        "sample": parsed.rows[:5],
        "max_rows": get_settings().max_import_rows,
    }


@router.post("/import", status_code=201)
async def import_csv(
    file: UploadFile = File(...),
    mapping: str = Form("{}"),
    timeline: Literal["spread", "now"] = Form("spread"),
    timeline_days: int = Form(180, ge=7, le=730),
    default_source: str = Form("review"),
    db: Session = Depends(get_db, scope="function"),
) -> dict:
    try:
        mapping_dict = json.loads(mapping or "{}")
    except json.JSONDecodeError as exc:
        raise AppError("The column mapping is not valid JSON.", code="bad_mapping") from exc
    parsed = ingest.parse_csv(await _read_upload(file))
    batch = ingest.import_rows(
        db, parsed, filename=file.filename or "upload.csv", mapping=mapping_dict,
        timeline=timeline, timeline_days=timeline_days, default_source=default_source,
    )
    return _batch_dict(batch)


@router.post("/sample", status_code=201)
def load_sample(replace: bool = Query(False), db: Session = Depends(get_db, scope="function")) -> dict:
    """Load the Build Battle 2026 sample dataset (7,000 rows)."""
    already = db.scalar(select(func.count()).select_from(ImportBatch).where(ImportBatch.kind == "sample"))
    if already and not replace:
        raise AppError("The sample dataset is already loaded.", code="sample_loaded", status_code=409)
    if replace:
        ids = db.scalars(select(ImportBatch.id).where(ImportBatch.kind == "sample")).all()
        db.execute(delete(Feedback).where(Feedback.batch_id.in_(ids)))
        db.execute(delete(ImportBatch).where(ImportBatch.id.in_(ids)))
    return _batch_dict(ingest.load_sample(db))


@router.get("/batches")
def list_batches(db: Session = Depends(get_db, scope="function")) -> list[dict]:
    return [_batch_dict(b) for b in db.scalars(select(ImportBatch).order_by(ImportBatch.id.desc()).limit(20))]


@router.get("/export.csv")
def export_feedback(filters: FeedbackFilters = Depends(filter_params), db: Session = Depends(get_db, scope="function")) -> Response:
    themes = {t.id: t.label for t in db.scalars(select(Theme)).all()}
    stmt = filters.apply(
        select(Feedback, Analysis).join(Analysis, Analysis.fingerprint == Feedback.fingerprint)
    ).order_by(Feedback.created_at.desc()).limit(50_000)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["id", "date", "category", "source", "sentiment", "score", "complaint",
                     "resolution", "severity", "theme", "engine", "text"])
    for f, a in db.execute(stmt):
        writer.writerow([f.id, f.day.isoformat(), f.category, f.source, a.sentiment, a.score,
                         a.is_complaint, a.resolution, a.severity, themes.get(a.theme_id, ""),
                         a.engine, f.text])
    return Response(
        buffer.getvalue(), media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="insightflow-feedback.csv"'},
    )


def _batch_dict(b: ImportBatch) -> dict:
    return {
        "id": b.id, "filename": b.filename, "kind": b.kind, "rows_total": b.rows_total,
        "rows_imported": b.rows_imported, "rows_skipped": b.rows_skipped,
        "distinct_voices": b.distinct_voices, "timeline_simulated": b.timeline_simulated,
        "created_at": iso(b.created_at),
    }
