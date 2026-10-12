from __future__ import annotations

import json
from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Report
from app.schemas.requests import ReportCreate
from app.services import reports
from app.services.filters import FeedbackFilters

router = APIRouter(tags=["reports"])


@router.get("/reports")
def list_reports(db: Session = Depends(get_db, scope="function")) -> dict:
    rows = db.scalars(select(Report).order_by(Report.id.desc()).limit(50)).all()
    return {"items": [reports.serialize(r, include_payload=False) for r in rows]}


@router.post("/reports", status_code=201)
def create_report(body: ReportCreate, db: Session = Depends(get_db, scope="function")) -> dict:
    report = reports.create_report(db, body.title, FeedbackFilters.from_dict(body.filters))
    return reports.serialize(report)


@router.get("/reports/{report_id}")
def get_report(report_id: int, db: Session = Depends(get_db, scope="function")) -> dict:
    return reports.serialize(reports.get_report(db, report_id))


@router.delete("/reports/{report_id}", status_code=204)
def delete_report(report_id: int, db: Session = Depends(get_db, scope="function")) -> Response:
    db.delete(reports.get_report(db, report_id))
    return Response(status_code=204)


@router.get("/reports/{report_id}/export")
def export_report(
    report_id: int,
    format: Literal["md", "csv", "json"] = Query("md"),
    db: Session = Depends(get_db, scope="function"),
) -> Response:
    report = reports.get_report(db, report_id)
    name = f"insightflow-report-{report.id}"
    if format == "csv":
        body, media = reports.to_csv(report), "text/csv"
    elif format == "json":
        body, media = json.dumps(reports.serialize(report), indent=2), "application/json"
    else:
        body, media = reports.to_markdown(report), "text/markdown"
    return Response(
        body, media_type=f"{media}; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{name}.{format}"'},
    )


@router.get("/public/reports/{token}")
def get_shared_report(token: str, db: Session = Depends(get_db, scope="function")) -> dict:
    """Read-only access for anyone holding the share link."""
    return reports.serialize(reports.get_report_by_token(db, token))
