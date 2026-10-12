"""Runtime configuration.

Two profiles ship with InsightFlow:

* ``local``  – everything on, tuned for a developer laptop (scikit-learn engine,
  background Adaption poller, generous import limits, SQLite or Postgres).
* ``cloud``  – tuned for free-tier hosts (512 MB RAM, sleeping dynos, ephemeral
  disk): pure-Python engine, request-driven Adaption sync, tighter limits.

Every profile default can still be overridden with an explicit env var.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

API_ROOT = Path(__file__).resolve().parents[2]

_PROFILE_DEFAULTS: dict[str, dict[str, object]] = {
    "local": {
        "analysis_engine": "auto",
        "max_import_rows": 250_000,
        "max_upload_mb": 50,
        "background_sync": True,
    },
    "cloud": {
        "analysis_engine": "lite",
        "max_import_rows": 25_000,
        "max_upload_mb": 8,
        "background_sync": False,
    },
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "InsightFlow API"
    app_profile: Literal["local", "cloud"] = "local"
    debug: bool = False

    database_url: str = f"sqlite:///{API_ROOT / 'data' / 'insightflow.db'}"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    cors_origin_regex: str | None = None

    # Adaption (https://docs.adaptionlabs.ai) – optional; the app degrades to
    # the local engine and the manual export/import path when it is absent.
    adaption_api_key: str | None = None
    adaption_base_url: str | None = None

    # Profile-driven knobs (None = take the profile default).
    analysis_engine: Literal["auto", "sklearn", "lite"] | None = None
    max_import_rows: int | None = None
    max_upload_mb: int | None = None
    background_sync: bool | None = None

    auto_seed: bool = True
    seed_timeline_days: int = Field(default=180, ge=7, le=730)

    @model_validator(mode="after")
    def _apply_profile_defaults(self) -> Settings:
        for key, value in _PROFILE_DEFAULTS[self.app_profile].items():
            if getattr(self, key) is None:
                setattr(self, key, value)
        # Render/Neon hand out postgres:// URLs; SQLAlchemy wants an explicit driver.
        for prefix in ("postgres://", "postgresql://"):
            if self.database_url.startswith(prefix):
                self.database_url = "postgresql+psycopg://" + self.database_url[len(prefix):]
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def adaption_configured(self) -> bool:
        return bool(self.adaption_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
