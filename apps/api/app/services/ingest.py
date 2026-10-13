"""Feedback ingestion: CSV parsing, column detection, bulk insert."""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

from sqlalchemy import insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.intelligence.text import clean, fingerprint
from app.models import Feedback, ImportBatch
from app.services.pipeline import analyze_pending

SAMPLE_CSV = Path(__file__).resolve().parents[1] / "seed" / "sample_feedback.csv"

FIELD_ALIASES: dict[str, tuple[str, ...]] = {
    "text": ("review", "feedback", "text", "comment", "comments", "message", "content",
             "description", "body", "response", "verbatim"),
    "category": ("category", "type", "topic", "label", "department", "area", "tag"),
    "date": ("date", "created_at", "created", "timestamp", "time", "submitted_at", "submitted",
             "datetime", "review_date"),
    "rating": ("rating", "stars", "star", "score", "nps", "csat"),
    "source": ("source", "channel", "platform", "origin"),
    "customer": ("customer", "customer_name", "name", "user", "username", "email", "customer_id"),
}
# Day-first formats come first: Indian exports write 05/03/2026 for 5 March.
_DATE_FORMATS = (
    "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y", "%d-%m-%Y %H:%M:%S", "%d-%m-%Y %H:%M",
    "%d-%m-%Y", "%d %b %Y", "%d %B %Y", "%Y/%m/%d", "%m/%d/%Y", "%d/%m/%y", "%b %d, %Y",
)
_CHUNK = 2000


@dataclass(slots=True)
class ParsedCsv:
    headers: list[str]
    rows: list[dict[str, str]]


def parse_csv(raw: bytes) -> ParsedCsv:
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    if not text.strip():
        raise AppError("The file is empty.", code="empty_file")
    try:
        dialect = csv.Sniffer().sniff(text[:8192], delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    headers = [h.strip() for h in (reader.fieldnames or []) if h and h.strip()]
    if not headers:
        raise AppError("Could not find a header row in the file.", code="no_header")
    rows = [{(k or "").strip(): (v or "") for k, v in row.items() if k} for row in reader]
    return ParsedCsv(headers=headers, rows=rows)


def detect_mapping(headers: list[str]) -> dict[str, str | None]:
    lowered = {h.lower().replace(" ", "_"): h for h in headers}
    mapping: dict[str, str | None] = {}
    for field, aliases in FIELD_ALIASES.items():
        match = next((lowered[a] for a in aliases if a in lowered), None)
        if match is None:
            match = next((h for key, h in lowered.items() if any(a in key for a in aliases)), None)
        mapping[field] = match
    return mapping


def parse_date(value: str) -> datetime | None:
    value = (value or "").strip()
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        parsed = None
        for fmt in _DATE_FORMATS:
            try:
                parsed = datetime.strptime(value, fmt)
                break
            except ValueError:
                continue
    if parsed is None:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _parse_rating(value: str) -> int | None:
    try:
        rating = round(float(value))
    except (TypeError, ValueError):
        return None
    return rating if 0 <= rating <= 10 else None


def _spread_timestamp(index: int, total: int, days: int, end: date) -> datetime:
    """Place row ``index`` on a timeline of ``days`` ending at ``end``, in file order."""
    start = datetime.combine(end - timedelta(days=days - 1), time(9, 0), tzinfo=timezone.utc)
    span_seconds = days * 86400 - 12 * 3600
    return start + timedelta(seconds=int(span_seconds * (index / max(total - 1, 1))))


def import_rows(
    db: Session,
    parsed: ParsedCsv,
    *,
    filename: str,
    mapping: dict[str, str | None] | None = None,
    kind: str = "csv",
    default_source: str = "review",
    timeline: str = "spread",
    timeline_days: int | None = None,
) -> ImportBatch:
    settings = get_settings()
    detected = detect_mapping(parsed.headers)
    mapping = {**detected, **{k: v for k, v in (mapping or {}).items() if v}}
    text_col = mapping.get("text")
    if not text_col or text_col not in parsed.headers:
        raise AppError(
            "Could not tell which column holds the feedback text. Choose it in the mapping step.",
            code="text_column_missing",
        )
    if len(parsed.rows) > settings.max_import_rows:
        raise AppError(
            f"This file has {len(parsed.rows):,} rows; the limit on this deployment is "
            f"{settings.max_import_rows:,}.",
            code="too_many_rows",
            status_code=413,
        )

    date_col = mapping.get("date")
    has_dates = bool(date_col) and any(parse_date(r.get(date_col, "")) for r in parsed.rows[:50])
    days = timeline_days or settings.seed_timeline_days
    now = datetime.now(timezone.utc)
    total = len(parsed.rows)

    batch = ImportBatch(filename=filename, kind=kind, rows_total=total)
    db.add(batch)
    db.flush()

    records: list[dict] = []
    fingerprints: set[str] = set()
    skipped = 0
    for index, row in enumerate(parsed.rows):
        text = clean(row.get(text_col, ""))
        if len(text) < 3:
            skipped += 1
            continue
        created = parse_date(row.get(date_col, "")) if has_dates else None
        simulated = False
        if created is None:
            if timeline == "spread" and total > 1:
                created, simulated = _spread_timestamp(index, total, days, now.date()), True
            else:
                created = now
        fp = fingerprint(text)
        fingerprints.add(fp)
        records.append(
            {
                "text": text[:5000],
                "fingerprint": fp,
                "category": clean(row.get(mapping.get("category") or "", ""))[:120] or "Uncategorised",
                "source": (clean(row.get(mapping.get("source") or "", "")) or default_source)[:40].lower(),
                "rating": _parse_rating(row.get(mapping.get("rating") or "", "")),
                "customer": clean(row.get(mapping.get("customer") or "", ""))[:160] or None,
                "created_at": created,
                "day": created.date(),
                "time_simulated": simulated,
                "batch_id": batch.id,
            }
        )

    if not records:
        raise AppError("No usable feedback rows were found in the file.", code="no_rows")
    for start in range(0, len(records), _CHUNK):
        db.execute(insert(Feedback), records[start:start + _CHUNK])

    batch.rows_imported = len(records)
    batch.rows_skipped = skipped
    batch.distinct_voices = len(fingerprints)
    batch.timeline_simulated = any(r["time_simulated"] for r in records)
    db.flush()
    analyze_pending(db)
    return batch


def load_sample(db: Session) -> ImportBatch:
    parsed = parse_csv(SAMPLE_CSV.read_bytes())
    batch = import_rows(db, parsed, filename="BuildBattle_2026_Customer_Feedback_Dataset.csv", kind="sample")
    from app.integrations.adaption.service import restore_sample_snapshot  # avoids an import cycle

    restore_sample_snapshot(db)
    return batch
