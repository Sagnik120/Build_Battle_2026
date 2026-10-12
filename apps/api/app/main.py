from __future__ import annotations

import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import func, select

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.database import init_db, session_scope
from app.core.errors import register_error_handlers
from app.models import AdaptionRun, Feedback
from app.models.adaption import ACTIVE_STAGES

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("insightflow")
settings = get_settings()


def _seed_if_empty() -> None:
    from app.services.ingest import load_sample

    with session_scope() as db:
        if db.scalar(select(func.count(Feedback.id))) == 0:
            batch = load_sample(db)
            logger.info("Seeded %d sample rows (%d distinct)", batch.rows_imported, batch.distinct_voices)


def _adaption_poller(stop: threading.Event, interval: float = 20.0) -> None:
    """Local profile only: advance active Adaption runs without a browser open."""
    from app.integrations.adaption import service

    while not stop.wait(interval):
        try:
            with session_scope() as db:
                for run in db.scalars(select(AdaptionRun).where(AdaptionRun.stage.in_(ACTIVE_STAGES))):
                    service.advance(db, run)
        except Exception:  # never let the poller die
            logger.exception("Adaption poller iteration failed")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    if settings.auto_seed:
        _seed_if_empty()
    stop = threading.Event()
    if settings.background_sync and settings.adaption_configured:
        threading.Thread(target=_adaption_poller, args=(stop,), daemon=True, name="adaption-poller").start()
    logger.info("InsightFlow API ready (profile=%s)", settings.app_profile)
    yield
    stop.set()


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Customer feedback intelligence: sentiment, themes, priorities, recommendations.",
    lifespan=lifespan,
)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)
register_error_handlers(app)
app.include_router(api_router, prefix="/api/v1")


@app.get("/", include_in_schema=False)
def root() -> dict:
    return {"name": settings.app_name, "docs": "/docs", "health": "/api/v1/health"}

# InsightFlow build iteration: commit 202
