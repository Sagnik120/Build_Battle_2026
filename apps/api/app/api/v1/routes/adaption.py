from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import AppError
from app.integrations.adaption import service
from app.schemas.requests import AdaptionRunCreate

router = APIRouter(prefix="/adaption", tags=["adaption"])
_MAX_EXPORT_BYTES = 25 * 1024 * 1024


@router.get("/status")
def status(db: Session = Depends(get_db, scope="function")) -> dict:
    return service.integration_status(db)


@router.get("/runs")
def list_runs(db: Session = Depends(get_db, scope="function")) -> dict:
    return {"items": [service.serialize(r) for r in service.list_runs(db)]}


@router.post("/runs", status_code=201)
def create_run(body: AdaptionRunCreate, db: Session = Depends(get_db, scope="function")) -> dict:
    """Upload the de-duplicated feedback to Adaption. Nothing is billed until launch."""
    run = service.create_run(
        db, scope=body.scope, max_rows=body.max_rows, reasoning_traces=body.reasoning_traces
    )
    return service.serialize(run)


@router.post("/runs/{run_id}/advance")
def advance_run(run_id: int, db: Session = Depends(get_db, scope="function")) -> dict:
    return service.serialize(service.advance(db, service.get_run(db, run_id)))


@router.post("/runs/{run_id}/launch")
def launch_run(run_id: int, db: Session = Depends(get_db, scope="function")) -> dict:
    return service.serialize(service.launch(db, service.get_run(db, run_id)))


@router.post("/runs/{run_id}/cancel")
def cancel_run(run_id: int, db: Session = Depends(get_db, scope="function")) -> dict:
    return service.serialize(service.cancel(db, service.get_run(db, run_id)))


@router.get("/dataset.csv")
def download_dataset(
    scope: Literal["all", "complaints", "pending"] = Query("all"), db: Session = Depends(get_db, scope="function")
) -> Response:
    """The exact CSV sent to Adaption - for running the workflow by hand in the Adaption app."""
    return Response(
        service.dataset_csv(db, scope), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="insightflow-for-adaption.csv"'},
    )


@router.post("/import", status_code=201)
async def import_adapted(file: UploadFile = File(...), db: Session = Depends(get_db, scope="function")) -> dict:
    """Merge a dataset adapted in the Adaption app (CSV, JSON or JSONL download)."""
    raw = await file.read(_MAX_EXPORT_BYTES + 1)
    if len(raw) > _MAX_EXPORT_BYTES:
        raise AppError("The adapted file is too large.", code="file_too_large", status_code=413)
    return service.serialize(service.import_manual(db, raw, file.filename or "adapted"))

# InsightFlow build iteration: commit 195
