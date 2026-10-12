from __future__ import annotations

import logging
from functools import lru_cache

from app.core.config import get_settings
from app.intelligence.clustering.base import Cluster, Clusterer
from app.intelligence.clustering.lite import LiteClusterer

logger = logging.getLogger("insightflow.engine")

__all__ = ["Cluster", "Clusterer", "get_clusterer"]


@lru_cache
def get_clusterer() -> Clusterer:
    """Pick the clustering engine for the active profile.

    ``auto`` prefers scikit-learn and silently falls back to the pure-Python
    engine when it is not installed (the cloud requirements omit it).
    """
    choice = get_settings().analysis_engine
    if choice in ("auto", "sklearn"):
        try:
            import sklearn  # noqa: F401

            from app.intelligence.clustering.sklearn_engine import SklearnClusterer

            return SklearnClusterer()
        except ImportError:
            if choice == "sklearn":
                logger.warning("ANALYSIS_ENGINE=sklearn but scikit-learn is missing; using lite.")
    return LiteClusterer()
