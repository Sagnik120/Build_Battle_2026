from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import delete, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.errors import AppError
from app.integrations.adaption.client import sdk_version
from app.models import AdaptionRun, Analysis, Feedback, ImportBatch, Issue, Report, Theme
from app.services.analytics import dataset_meta
from app.services.pipeline import engine_name

router = APIRouter(tags=["system"])


@router.get("/health")
def health(db: Session = Depends(get_db, scope="function")) -> dict:
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


@router.get("/system/info")
def info(db: Session = Depends(get_db, scope="function")) -> dict:
    settings = get_settings()
    return {
        "name": settings.app_name,
        "profile": settings.app_profile,
        "engine": engine_name(),
        "database": "sqlite" if settings.is_sqlite else "postgres",
        "limits": {"max_import_rows": settings.max_import_rows, "max_upload_mb": settings.max_upload_mb},
        "adaption": {
            "configured": settings.adaption_configured,
            "sdk_version": sdk_version(),
            "background_sync": bool(settings.background_sync),
        },
        "data": dataset_meta(db),
    }


@router.post("/system/reset")
def reset(confirm: str = Query(...), db: Session = Depends(get_db, scope="function")) -> dict:
    """Delete all workspace data. Requires ``?confirm=delete-everything``."""
    if confirm != "delete-everything":
        raise AppError("Pass confirm=delete-everything to reset the workspace.", code="confirm_required")
    for model in (Issue, Report, AdaptionRun, Analysis, Feedback, ImportBatch, Theme):
        db.execute(delete(model))
    return {"status": "reset"}

# InsightFlow build iteration: commit 196

# InsightFlow build iteration: commit 197
