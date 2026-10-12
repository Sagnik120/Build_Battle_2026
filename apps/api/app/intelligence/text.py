"""Text normalisation shared by every engine."""

from __future__ import annotations

import hashlib
import re

_WS = re.compile(r"\s+")
_NON_WORD = re.compile(r"[^\w\s']", re.UNICODE)
_TOKEN = re.compile(r"[a-zA-Zऀ-ॿ][a-zA-Zऀ-ॿ']+")

STOPWORDS = frozenset(
    """
    a an and are as at be been being but by for from had has have he her his i if in into is it its
    me my of on or our she so that the their them there they this to was we were what when which
    who will with you your am do does did not no very just also than then too can could would should
    upon while during after before despite some any all more most much many got get one two
    """.split()
)


def clean(text: str) -> str:
    return _WS.sub(" ", text or "").strip()


def normalize(text: str) -> str:
    """Case/punctuation-insensitive form used for duplicate detection."""
    return _WS.sub(" ", _NON_WORD.sub(" ", (text or "").lower())).strip()


def fingerprint(text: str) -> str:
    return hashlib.sha1(normalize(text).encode("utf-8")).hexdigest()


def tokenize(text: str, *, drop_stopwords: bool = True) -> list[str]:
    tokens = [t.lower().strip("'") for t in _TOKEN.findall(text or "")]
    if drop_stopwords:
        tokens = [t for t in tokens if t not in STOPWORDS and len(t) > 2]
    return tokens


def terms(text: str) -> list[str]:
    """Unigrams + bigrams – the feature space both clustering engines share."""
    toks = tokenize(text)
    return toks + [f"{a} {b}" for a, b in zip(toks, toks[1:], strict=False)]
