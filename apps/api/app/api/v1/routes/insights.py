"""Analytics, themes and recommendations."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.requests import AssumptionsUpdate
from app.services import analytics, recommendations, reports
from app.services.filters import FeedbackFilters, filter_params
from app.services.pipeline import analyze_pending, engine_name

router = APIRouter(tags=["insights"])


@router.get("/analytics/dashboard")
def get_dashboard(filters: FeedbackFilters = Depends(filter_params), db: Session = Depends(get_db, scope="function")) -> dict:
    return analytics.dashboard(db, filters)


@router.get("/analytics/brief")
def get_brief(filters: FeedbackFilters = Depends(filter_params), db: Session = Depends(get_db, scope="function")) -> dict:
    """The current findings as a few plain sentences."""
    dash = analytics.dashboard(db, filters)
    if dash["empty"]:
        return {"lines": []}
    return {"lines": reports.executive_summary(dash, recommendations.build_recommendations(db, filters))}


@router.get("/themes")
def get_themes(filters: FeedbackFilters = Depends(filter_params), db: Session = Depends(get_db, scope="function")) -> dict:
    cells = analytics.fetch_cube(db, filters)
    window = analytics.window_of(cells, filters)
    if window is None:
        return {"items": []}
    rows = analytics.theme_rollup(cells, window, analytics.load_themes(db))
    rows.sort(key=lambda r: -r["mentions"])
    return {"items": rows}


@router.post("/analysis/run")
def rerun_analysis(db: Session = Depends(get_db, scope="function")) -> dict:
    """Re-run the local engine (Adaption-enriched messages are left untouched)."""
    analysed = analyze_pending(db, force=True)
    return {"analysed": analysed, "engine": engine_name()}


@router.get("/recommendations")
def get_recommendations(
    filters: FeedbackFilters = Depends(filter_params), db: Session = Depends(get_db, scope="function")
) -> dict:
    return recommendations.build_recommendations(db, filters)


@router.get("/settings/assumptions")
def get_assumptions(db: Session = Depends(get_db, scope="function")) -> dict:
    return recommendations.get_assumptions(db)


@router.put("/settings/assumptions")
def put_assumptions(body: AssumptionsUpdate, db: Session = Depends(get_db, scope="function")) -> dict:
    return recommendations.save_assumptions(db, body.model_dump(exclude_none=True))
