"""The instruction InsightFlow gives Adaption for every feedback row.

Adaptive Data runs in *universal-prompt* mode: one shared instruction is
folded into each row together with that row's context columns, and Adaption
generates the completion. We ask for strict JSON so the completion can be
merged straight back into the analytics store.
"""

from __future__ import annotations

from app.intelligence.taxonomy import TAXONOMY

DATASET_COLUMNS = ("ref", "feedback", "category", "occurrences")
CONTEXT_COLUMNS = ["ref", "feedback", "category"]

_THEMES = "\n".join(f'- "{t.slug}": {t.label} ({t.polarity})' for t in TAXONOMY)

UNIVERSAL_PROMPT = f"""You are a senior customer-experience analyst for an Indian e-commerce marketplace.
Analyse the single piece of customer feedback given in the context and reply with ONE JSON object and nothing else.

Keys (all required):
- "ref": copy the ref value from the context exactly.
- "sentiment": "positive" | "negative" | "neutral" | "mixed".
- "sentiment_score": number from -1 (very negative) to 1 (very positive).
- "is_complaint": true if the customer reports a problem, even one that was later fixed.
- "resolved": true if the feedback says the problem was fixed, refunded, replaced or compensated; false if it was not; null if there was no problem.
- "severity": 1 (no problem), 2 (inconvenience), 3 (order or product unusable, or issue left unresolved), 4 (fraud, lost money, counterfeit goods).
- "theme": the best-fitting slug from the list below, or "new: <3-5 word label>" if none fits.
- "root_cause": one sentence naming the most likely operational root cause; null for praise.
- "suggested_action": one sentence with the single most useful fix the business can make; null for praise.
- "summary": at most 15 words, plain English.

Themes:
{_THEMES}
"""

BLUEPRINT = (
    "Write for a busy operations manager. Be specific and practical, never generic. "
    "Do not invent order numbers, names, amounts or facts that are not in the feedback. "
    "Feedback may be written in English, Hindi or Hinglish; always answer in English. "
    "Output valid JSON only - no markdown fences, no commentary."
)


def adapt_request(*, max_rows: int | None, reasoning_traces: bool, idempotency_key: str) -> dict:
    """Keyword arguments for ``client.datasets.adapt``."""
    job: dict = {"idempotency_key": idempotency_key}
    if max_rows:
        job["max_rows"] = max_rows
    return {
        "column_mapping": {"universal_prompt": UNIVERSAL_PROMPT, "context": CONTEXT_COLUMNS},
        # Rows are already de-duplicated by fingerprint and must map 1:1 back to
        # our records, so Adaption's own dedup and prompt rephrasing stay off.
        "recipe_specification": {
            "recipes": {
                "deduplication": False,
                "prompt_rephrase": False,
                "reasoning_traces": reasoning_traces,
            }
        },
        "job_specification": job,
        "brand_controls": {"length": "concise", "blueprint": BLUEPRINT},
        "training_type": "instruction_dataset",
    }

# InsightFlow build iteration: commit 184

# InsightFlow build iteration: commit 185
