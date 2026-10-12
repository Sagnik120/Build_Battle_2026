"""Thin wrapper over the official ``adaption`` SDK.

Keeps SDK types out of the rest of the codebase and converts SDK failures
into :class:`IntegrationError` so the API returns a readable 502.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, TypeVar

from app.core.config import get_settings
from app.core.errors import AppError, IntegrationError

T = TypeVar("T")


@dataclass(slots=True)
class RemoteStatus:
    status: str  # pending | running | awaiting_input | succeeded | failed
    row_count: int | None
    percent: float | None
    error: str | None


@dataclass(slots=True)
class Estimate:
    credits: float | None
    minutes: float | None
    run_id: str | None


def sdk_version() -> str | None:
    try:
        import adaption

        return adaption.__version__
    except ImportError:
        return None


class AdaptionClient:
    def __init__(self, api_key: str, base_url: str | None = None):
        from adaption import Adaption

        kwargs: dict[str, Any] = {"api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
        self._sdk = Adaption(**kwargs)

    def _call(self, action: str, fn: Callable[[], T]) -> T:
        import adaption

        try:
            return fn()
        except adaption.AuthenticationError as exc:
            raise IntegrationError(
                "Adaption rejected the API key. Check ADAPTION_API_KEY.", code="adaption_auth"
            ) from exc
        except adaption.RateLimitError as exc:
            raise IntegrationError(
                "Adaption rate limit reached. Try again shortly.", code="adaption_rate_limit"
            ) from exc
        except adaption.APIStatusError as exc:
            detail = getattr(exc, "message", None) or str(exc)
            raise IntegrationError(
                f"Adaption could not {action}: {detail}", code="adaption_error"
            ) from exc
        except adaption.APIConnectionError as exc:
            raise IntegrationError(
                f"Could not reach Adaption to {action}.", code="adaption_unreachable"
            ) from exc

    def upload_csv(self, path: Path, name: str) -> str:
        return self._call("upload the dataset", lambda: self._sdk.datasets.upload_file(path, name=name)).dataset_id

    def status(self, dataset_id: str) -> RemoteStatus:
        s = self._call("read the dataset status", lambda: self._sdk.datasets.get_status(dataset_id))
        return RemoteStatus(
            status=s.status,
            row_count=s.row_count,
            percent=getattr(s.progress, "percent", None) if s.progress else None,
            error=(s.error_data.message if s.error_data else None),
        )

    def current_run_id(self, dataset_id: str) -> str | None:
        return self._call("read the dataset", lambda: self._sdk.datasets.get(dataset_id)).run_id

    def adapt(self, dataset_id: str, request: dict, *, estimate: bool) -> Estimate:
        r = self._call(
            "estimate the run" if estimate else "start the run",
            lambda: self._sdk.datasets.adapt(dataset_id, estimate=estimate, **request),
        )
        return Estimate(
            credits=r.estimated_credits_consumed, minutes=r.estimated_minutes, run_id=r.run_id
        )

    def download_jsonl(self, dataset_id: str) -> bytes:
        return self._call(
            "download the results",
            lambda: self._sdk.datasets.download(dataset_id, file_format="jsonl").read(),
        )

    def evaluation(self, dataset_id: str) -> dict | None:
        e = self._call("read the quality evaluation", lambda: self._sdk.datasets.get_evaluation(dataset_id))
        if e.quality is None:
            return {"status": e.status} if e.status else None
        return {"status": e.status, **e.quality.model_dump()}


@lru_cache
def get_client() -> AdaptionClient:
    settings = get_settings()
    if not settings.adaption_api_key:
        raise AppError(
            "Adaption is not connected. Set ADAPTION_API_KEY on the API, or use the manual "
            "export/import path.",
            code="adaption_not_configured",
            status_code=409,
        )
    if sdk_version() is None:
        raise AppError("The adaption SDK is not installed on the API.", code="adaption_sdk_missing")
    return AdaptionClient(settings.adaption_api_key, settings.adaption_base_url)

# InsightFlow build iteration: commit 183
