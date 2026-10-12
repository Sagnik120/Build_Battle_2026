"""Explainable sentiment + complaint signals.

A rule-based scorer is a deliberate choice for the always-on path: it runs in
microseconds on a 512 MB free-tier box, needs no model download, and every
score can be traced back to the phrases that produced it (``signals``).
Adaption's generative read, when available, overrides it per message.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.intelligence.lexicon import CONTRAST, INTENSIFIERS, NEGATORS, PHRASES, WORDS

_SPLIT = re.compile(r"[a-zA-Zऀ-ॿ][a-zA-Zऀ-ॿ'\-]*|[.,;!?]")
_PHRASES_BY_LEN = sorted(PHRASES.items(), key=lambda kv: -len(kv[0]))
_NEGATION_WINDOW = 6

_RESOLVED = re.compile(
    r"\b(resolved|replacement|compensation|refund(ed)? (was )?(issued|provided|processed)|"
    r"provided a (satisfactory )?solution|kept me informed|informed promptly|regular updates|"
    r"quick to resolve|was transparent)\b",
    re.I,
)
_UNRESOLVED = re.compile(
    r"\b(unresolved|not resolved|no (response|reply|refund)|refused|never (received|sent|arrived)|"
    r"still waiting|did not provide)\b",
    re.I,
)
_CRITICAL = re.compile(
    r"\b(scam(med)?|fraud(ulent)?|counterfeit|fake|not authentic|took my money|"
    r"charged (me |us )?(multiple times|twice)|double charged|never (received|sent)|cheated|dhoka|"
    r"refus\w+ to refund|debited twice|"
    r"unauthori[sz]ed)\b",
    re.I,
)
_HIGH = re.compile(
    r"\b(stopped working|did not function|wrong items?|missing|damaged|broken|defective|"
    r"unresolved|refus(ed|al)|kept crashing|crash(ed|ing)?|two weeks)\b",
    re.I,
)


@dataclass(slots=True)
class SentimentResult:
    label: str
    score: float
    confidence: float
    is_complaint: bool
    resolution: str
    severity: int
    signals: list[str] = field(default_factory=list)


def _mask_phrases(lower: str) -> tuple[str, list[tuple[str, float]]]:
    """Replace known phrases with placeholder tokens so word scoring skips them."""
    hits: list[tuple[str, float]] = []
    for phrase, weight in _PHRASES_BY_LEN:
        if phrase in lower:
            pattern = re.compile(rf"(?<![\w]){re.escape(phrase)}(?![\w])")
            if pattern.search(lower):
                idx = len(hits)
                lower = pattern.sub(f" phx{'q' * (idx + 1)}x ", lower)
                hits.append((phrase, weight))
    return lower, hits


def analyze_sentiment(text: str) -> SentimentResult:
    lower, phrase_hits = _mask_phrases((text or "").lower())
    tokens = _SPLIT.findall(lower)

    pos = neg = 0.0
    signals: list[str] = []
    negate_left = 0
    boost = 1.0
    saw_contrast = False

    for tok in tokens:
        if tok in ".;!?":
            negate_left, boost = 0, 1.0
            continue
        if tok == ",":
            boost = 1.0
            continue
        if tok in CONTRAST:
            saw_contrast, negate_left, boost = True, 0, 1.0
            continue
        if tok in NEGATORS:
            negate_left = _NEGATION_WINDOW
            continue
        if tok in INTENSIFIERS:
            boost = INTENSIFIERS[tok]
            continue

        weight: float | None = None
        label = tok
        if tok.startswith("phx") and tok.endswith("x") and set(tok[3:-1]) == {"q"}:
            label, weight = phrase_hits[len(tok) - 5]
        elif tok in WORDS:
            weight = WORDS[tok]

        if weight is not None:
            weight *= boost
            if negate_left > 0:
                # "not helpful" is a complaint; "no fraud" is reassurance, but a
                # negated word is weaker evidence than a direct statement.
                weight = -weight * 0.75
                label = f"not {label}"
            if weight > 0:
                pos += weight
            else:
                neg += -weight
            signals.append(f"{'+' if weight > 0 else '−'} {label}")
            boost = 1.0
        if negate_left > 0:
            negate_left -= 1

    total = pos + neg
    score = 0.0 if total == 0 else (pos - neg) / (total + 1.0)
    balance = 0.0 if total == 0 else min(pos, neg) / max(pos, neg)

    if total == 0:
        label = "neutral"
    elif balance >= 0.35 or (saw_contrast and min(pos, neg) > 0):
        label = "mixed"
    elif score > 0.12:
        label = "positive"
    elif score < -0.12:
        label = "negative"
    else:
        label = "neutral"

    is_complaint = neg >= 0.5 and label in ("negative", "mixed")
    resolution = "n/a"
    if is_complaint:
        if _UNRESOLVED.search(text):
            resolution = "unresolved"
        elif _RESOLVED.search(text):
            resolution = "resolved"
        else:
            # Silence about a fix is not a fix.
            resolution = "unresolved"

    severity = 1
    if is_complaint:
        if _CRITICAL.search(text):
            severity = 4
        elif _HIGH.search(text) or resolution == "unresolved":
            severity = 3
        else:
            severity = 2
        if resolution == "resolved":
            severity = max(1, severity - 1)

    confidence = min(1.0, total / 4.0) * (1.0 - 0.45 * balance)
    return SentimentResult(
        label=label,
        score=round(max(-1.0, min(1.0, score)), 3),
        confidence=round(max(0.15, confidence), 3),
        is_complaint=is_complaint,
        resolution=resolution,
        severity=severity,
        signals=signals[:8],
    )

# InsightFlow build iteration: commit 164
