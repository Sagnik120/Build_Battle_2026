"""Maps Adaption's adapted dataset back onto InsightFlow analyses.

The export format is treated defensively: rows are matched to our records by
the echoed ``ref``, then by any ``IF-...`` ref found in the row, then by the
fingerprint of the feedback text itself. Unparseable completions are counted,
never guessed at.
"""

from __future__ import annotations

import csv
import io
import json
import re
from dataclasses import dataclass, field

from app.intelligence.text import fingerprint

COMPLETION_KEYS = (
    "enhanced_completion", "completion", "adapted_completion", "generated_completion",
    "response", "output", "answer",
)
REF_PREFIX = "IF-"
_REF = re.compile(r"IF-[0-9a-f]{12}")
_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.I)
_SENTIMENTS = {"positive", "negative", "neutral", "mixed"}


def make_ref(fp: str) -> str:
    return f"{REF_PREFIX}{fp[:12]}"


@dataclass(slots=True)
class Enrichment:
    fingerprint: str
    fields: dict = field(default_factory=dict)
    theme: str | None = None  # taxonomy slug or "new: label"
    structured: bool = False


def parse_export(raw: bytes) -> list[dict]:
    """Accept the JSONL, JSON or CSV that Adaption's download/export produces."""
    text = raw.decode("utf-8-sig", errors="replace").strip()
    if not text:
        return []
    if text[0] == "[":
        data = json.loads(text)
        return [r for r in data if isinstance(r, dict)]
    if text[0] == "{":
        rows = []
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(obj, dict):
                rows.append(obj)
        return rows
    return list(csv.DictReader(io.StringIO(text)))


def extract_json(value: object) -> dict | None:
    if isinstance(value, dict):
        return value
    if not isinstance(value, str):
        return None
    text = _FENCE.sub("", value.strip())
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        obj = json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return None
    return obj if isinstance(obj, dict) else None


def _strings(value: object, depth: int = 0):
    if isinstance(value, str):
        yield value
    elif depth < 3 and isinstance(value, dict):
        for v in value.values():
            yield from _strings(v, depth + 1)
    elif depth < 3 and isinstance(value, list):
        for v in value:
            yield from _strings(v, depth + 1)


def _completion(row: dict) -> object | None:
    lowered = {str(k).lower(): v for k, v in row.items()}
    for key in COMPLETION_KEYS:
        if lowered.get(key) not in (None, ""):
            return lowered[key]
    return None


def _clean_text(value: object, limit: int = 600) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value[:limit] if value and value.lower() not in ("null", "none", "n/a") else None


def _match(row: dict, obj: dict | None, ref_index: dict[str, str], known: set[str]) -> str | None:
    if obj and isinstance(obj.get("ref"), str) and obj["ref"].strip() in ref_index:
        return ref_index[obj["ref"].strip()]
    strings = list(_strings(row))
    for s in strings:
        for ref in _REF.findall(s):
            if ref in ref_index:
                return ref_index[ref]
    for s in strings:
        if 3 < len(s) < 6000 and (fp := fingerprint(s)) in known:
            return fp
    return None


def map_rows(rows: list[dict], ref_index: dict[str, str]) -> tuple[list[Enrichment], int]:
    """Returns (enrichments, unmatched_row_count)."""
    known = set(ref_index.values())
    results: dict[str, Enrichment] = {}
    unmatched = 0
    for row in rows:
        completion = _completion(row)
        obj = extract_json(completion)
        fp = _match(row, obj, ref_index, known)
        if fp is None or completion is None:
            unmatched += 1
            continue
        enrichment = Enrichment(fingerprint=fp)
        if obj is None:
            # Free-text completion: keep it as a summary, leave local scores alone.
            if text := _clean_text(completion):
                enrichment.fields["summary"] = text
        else:
            enrichment.structured = True
            sentiment = str(obj.get("sentiment", "")).lower().strip()
            if sentiment in _SENTIMENTS:
                enrichment.fields["sentiment"] = sentiment
            try:
                enrichment.fields["score"] = max(-1.0, min(1.0, float(obj["sentiment_score"])))
            except (KeyError, TypeError, ValueError):
                pass
            if isinstance(obj.get("is_complaint"), bool):
                enrichment.fields["is_complaint"] = obj["is_complaint"]
            if "resolved" in obj and enrichment.fields.get("is_complaint") is not None:
                if not enrichment.fields["is_complaint"]:
                    enrichment.fields["resolution"] = "n/a"
                elif isinstance(obj["resolved"], bool):
                    enrichment.fields["resolution"] = "resolved" if obj["resolved"] else "unresolved"
            try:
                severity = int(obj["severity"])
                if 1 <= severity <= 4:
                    enrichment.fields["severity"] = severity
            except (KeyError, TypeError, ValueError):
                pass
            for key in ("summary", "root_cause", "suggested_action"):
                if text := _clean_text(obj.get(key)):
                    enrichment.fields[key] = text
            if isinstance(obj.get("theme"), str) and obj["theme"].strip():
                enrichment.theme = obj["theme"].strip()
        if enrichment.fields or enrichment.theme:
            results[fp] = enrichment
        else:
            unmatched += 1
    return list(results.values()), unmatched

# InsightFlow build iteration: commit 186
