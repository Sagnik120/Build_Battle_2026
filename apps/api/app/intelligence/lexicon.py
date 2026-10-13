"""Sentiment lexicon for customer-feedback English, plus the Hinglish that
Indian customers routinely mix in ("delivery bahut late thi", "bilkul bekar").

Weights are on a -3 .. +3 scale. Phrases are matched before single words so
"not as advertised" never gets scored as a positive "advertised".
"""

from __future__ import annotations

PHRASES: dict[str, float] = {
    # --- negative ---------------------------------------------------------
    "not as advertised": -2.5,
    "not as described": -2.5,
    "did not meet": -2.0,
    "didn't meet": -2.0,
    "does not meet": -2.0,
    "doesn't meet": -2.0,
    "top-notch": 2.4,
    "did not function": -2.5,
    "does not work": -2.5,
    "doesn't work": -2.5,
    "stopped working": -2.8,
    "remains unresolved": -2.8,
    "still unresolved": -2.8,
    "never received": -3.0,
    "never sent": -3.0,
    "never arrived": -3.0,
    "took my money": -3.0,
    "charged multiple times": -3.0,
    "charged twice": -3.0,
    "charged me twice": -3.0,
    "debited twice": -3.0,
    "double charged": -3.0,
    "additional payment": -2.2,
    "extra payment": -2.2,
    "refused to refund": -3.0,
    "no refund": -2.5,
    "not authentic": -2.8,
    "not genuine": -2.8,
    "not related to my order": -2.5,
    "wrong items": -2.5,
    "wrong item": -2.5,
    "wrong product": -2.5,
    "processed incorrectly": -2.2,
    "kept crashing": -2.6,
    "long time": -1.8,
    "waste of money": -3.0,
    "low-quality": -2.2,
    "low quality": -2.2,
    "poor quality": -2.5,
    "paisa barbad": -3.0,
    "bahut late": -2.2,
    "bilkul bekar": -3.0,
    # --- positive ---------------------------------------------------------
    "on time": 1.8,
    "value for money": 2.4,
    "worth the price": 2.2,
    "worth it": 1.8,
    "highly recommended": 2.6,
    "highly recommend": 2.6,
    "well-made": 2.2,
    "well made": 2.2,
    "must-have": 2.4,
    "game-changer": 2.6,
    "user-friendly": 2.0,
    "easy to use": 2.0,
    "easy to navigate": 2.0,
    "hassle-free": 2.2,
    "within minutes": 1.6,
    "quick resolution": 2.2,
    "as advertised": 1.6,
    "as described": 1.6,
    "exceeds my expectations": 2.6,
    "exceeded my expectations": 2.6,
    "exceeds expectations": 2.6,
    "met all my expectations": 2.2,
    "met my expectations": 2.0,
    "kept me informed": 1.6,
    "paisa vasool": 2.6,
    "bahut accha": 2.4,
    "bahut badhiya": 2.6,
}

WORDS: dict[str, float] = {
    # --- negative ---------------------------------------------------------
    "scam": -3.0, "scammed": -3.0, "fraud": -3.0, "fraudulent": -3.0, "counterfeit": -3.0,
    "fake": -2.8, "victim": -2.2, "cheated": -3.0, "stolen": -3.0, "beware": -2.2,
    "suspect": -1.5, "suspected": -1.5,
    "damaged": -2.2, "broken": -2.4, "defect": -2.0, "defects": -2.0, "defective": -2.4,
    "faulty": -2.4, "missing": -2.0, "delayed": -1.8, "delay": -1.8, "late": -1.5,
    "crashing": -2.4, "crash": -2.2, "crashed": -2.2, "glitches": -2.0, "glitch": -2.0,
    "difficult": -1.5, "difficulties": -1.5, "issues": -1.2, "issue": -1.0, "problem": -1.4,
    "problems": -1.4, "unresolved": -2.5, "unhelpful": -2.4, "unresponsive": -2.2,
    "rude": -2.6, "frustrating": -2.4, "frustrated": -2.4, "disappointed": -2.4,
    "disappointing": -2.4, "inconvenient": -1.8, "inconvenience": -1.6, "unfortunately": -1.2,
    "terrible": -3.0, "horrible": -3.0, "worst": -3.0, "awful": -3.0, "bad": -2.0,
    "poor": -2.0, "slow": -1.6, "average": -0.8, "mediocre": -1.4, "refused": -2.2, "useless": -2.6, "pathetic": -2.8,
    "bekar": -2.6, "bakwas": -2.8, "ghatiya": -2.8, "kharab": -2.4, "dhoka": -3.0,
    # --- positive ---------------------------------------------------------
    "excellent": 2.6, "outstanding": 2.8, "great": 2.2, "good": 1.6, "amazing": 2.6,
    "awesome": 2.6, "perfect": 2.4, "pristine": 2.2, "love": 2.4, "helpful": 2.0,
    "friendly": 1.8, "knowledgeable": 1.8, "professional": 1.6, "patient": 1.4,
    "attentive": 1.6, "responsive": 1.8, "efficient": 1.8, "efficiently": 1.8,
    "promptly": 1.6, "quick": 1.4, "smooth": 1.8, "durable": 2.0, "reliable": 2.0,
    "innovative": 2.0, "useful": 1.8, "intuitive": 1.8, "impressive": 2.2, "elegant": 1.8,
    "sleek": 1.6, "modern": 1.2, "comfortable": 1.6, "stable": 1.4, "consistent": 1.4,
    "powerful": 1.8, "satisfactory": 1.4, "satisfied": 1.8, "resolved": 1.6, "solution": 1.2,
    "replacement": 1.0, "compensation": 1.2, "transparent": 1.6, "genuine": 1.8,
    "recommend": 2.0, "recommended": 2.0, "exceeds": 2.0, "exceeded": 2.0, "intact": 1.4,
    "clear": 1.0, "comprehensive": 1.4, "versatile": 1.4, "groundbreaking": 2.2,
    "practical": 1.2, "timeless": 1.4, "essential": 1.4, "improved": 1.6, "improve": 1.2,
    "creative": 1.4, "vibrant": 1.4, "artistic": 1.2, "chic": 1.4, "robust": 1.6,
    "effective": 1.6, "fast": 1.4, "commendable": 1.8, "functional": 1.2, "stylish": 1.6,
    "accha": 2.0, "badhiya": 2.4, "mast": 2.2, "shandar": 2.6, "zabardast": 2.6,
}

NEGATORS = frozenset(
    {"not", "no", "never", "neither", "nor", "without", "wasn't", "isn't", "didn't", "don't",
     "doesn't", "couldn't", "won't", "cannot", "can't", "nahi", "nahin", "mat"}
)
# Hindi negators attach to the verb beside them ("order nahi aaya"), not to what follows.
SHORT_NEGATORS = frozenset({"nahi", "nahin", "mat"})
INTENSIFIERS: dict[str, float] = {
    "very": 1.3, "extremely": 1.5, "incredibly": 1.5, "highly": 1.3, "really": 1.25,
    "absolutely": 1.4, "totally": 1.3, "so": 1.15, "too": 1.2, "bahut": 1.4, "bilkul": 1.4,
    "slightly": 0.6, "minor": 0.5, "somewhat": 0.7, "little": 0.7, "thoda": 0.6,
}
CONTRAST = frozenset({"but", "however", "although", "though", "yet", "lekin", "par", "magar"})
