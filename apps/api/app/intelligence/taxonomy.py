"""Theme taxonomy for commerce feedback.

Stage one of theme detection: weighted pattern scoring against themes a
business already knows how to act on. Anything the taxonomy cannot place goes
to stage two (clustering) and surfaces as an *emerging* theme.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ThemeDef:
    slug: str
    label: str
    area: str
    polarity: str  # issue | praise
    description: str
    patterns: tuple[tuple[str, float], ...]
    # How damaging one unresolved occurrence is, 1 (annoyance) .. 4 (legal/financial harm).
    impact: int = 2

    def compiled(self) -> tuple[tuple[re.Pattern[str], float], ...]:
        return tuple((re.compile(p, re.I), w) for p, w in self.patterns)


TAXONOMY: tuple[ThemeDef, ...] = (
    # ------------------------------------------------------------- Trust & Safety
    ThemeDef(
        "paid-not-delivered", "Paid but order never arrived", "Trust & Safety", "issue",
        "Customers were charged and the order was never shipped or received.",
        ((r"never (received|sent|arrived|got)", 3), (r"took my money", 3),
         (r"despite being charged", 3), (r"did(n't| not) (receive|arrive)", 2)), 4,
    ),
    ThemeDef(
        "duplicate-charge", "Charged multiple times", "Payments", "issue",
        "A single purchase was debited more than once.",
        ((r"charged (me |us )?(multiple times|twice|again)", 3), (r"double[- ]charged?", 3),
         (r"(duplicate|multiple) (charge|payment|debit)", 3), (r"debited twice", 3)), 4,
    ),
    ThemeDef(
        "extra-payment-demand", "Seller demanded extra payment", "Trust & Safety", "issue",
        "Sellers asked for additional money after the order was placed.",
        ((r"(additional|extra) payment", 3), (r"asked for (more|additional) (money|payment)", 3)), 4,
    ),
    ThemeDef(
        "counterfeit", "Counterfeit or inauthentic product", "Trust & Safety", "issue",
        "Products received were fake or not authentic.",
        ((r"counterfeit", 3), (r"not (authentic|genuine|original)", 3), (r"\bfake\b", 3),
         (r"duplicate product", 2)), 4,
    ),
    ThemeDef(
        "misrepresented", "Product not as advertised", "Trust & Safety", "issue",
        "What arrived did not match the listing.",
        ((r"not as (advertised|described|shown)", 3), (r"not related to my order", 3),
         (r"low[- ]quality product", 2), (r"scam.*did not meet my expectations", 2.5),
         (r"(scam|fraud).*(did not function|low[- ]quality)", 2.5)), 3,
    ),
    ThemeDef(
        "fraud-other", "Suspected fraudulent activity", "Trust & Safety", "issue",
        "Unspecified fraud or scam reports.",
        ((r"\bscam", 2), (r"fraud", 2), (r"cheat", 2), (r"dhoka", 2)), 4,
    ),
    ThemeDef(
        "refund-denied", "Refund refused or stuck", "Payments", "issue",
        "Refunds were refused, delayed or never processed.",
        ((r"refus\w+ to refund", 3.5), (r"(no|never got|still waiting for)( a| my)? refund", 3),
         (r"refund (not|never|pending|delayed)", 3)), 4,
    ),
    # ------------------------------------------------------------------ Delivery
    ThemeDef(
        "delivery-delay", "Late delivery", "Delivery", "issue",
        "Orders arrived later than promised.",
        ((r"deliver\w* (was |process was )?(slightly |significantly )?delayed", 3),
         (r"delivery process had some operational issues", 3),
         (r"\bdelayed\b", 1.6), (r"late deliver", 3), (r"bahut late", 2)), 2,
    ),
    ThemeDef(
        "damaged-missing", "Damaged package or missing items", "Delivery", "issue",
        "Parcels arrived damaged or incomplete.",
        ((r"packag\w+ was damaged", 3), (r"damaged (upon|on) arrival", 3),
         (r"items? (were|was) missing", 3), (r"\bmissing\b", 1.5), (r"\bdamaged\b", 1.5)), 3,
    ),
    ThemeDef(
        "wrong-item", "Wrong item shipped", "Fulfilment", "issue",
        "The order was processed incorrectly and the wrong product was sent.",
        ((r"wrong (items?|product|order)", 3), (r"processed incorrectly", 3)), 3,
    ),
    # ------------------------------------------------------------------ Platform
    ThemeDef(
        "checkout-failure", "Website crashes at checkout", "Platform", "issue",
        "Site crashes or glitches blocked customers from completing a purchase.",
        ((r"website.*(crash|glitch|unresponsive|technical issues)", 3), (r"kept crashing", 3),
         (r"glitches", 2.5), (r"checkout process was difficult", 3),
         (r"issues while placing my order", 2.5), (r"difficult\w* (to complete|while placing)", 2.5),
         (r"app (crash|hang|not working)", 3)), 3,
    ),
    # ------------------------------------------------------------------- Product
    ThemeDef(
        "product-failure", "Product stopped working or defective", "Product", "issue",
        "Products failed early or arrived defective.",
        ((r"stopped working", 3.5), (r"did not function", 2), (r"defect", 3),
         (r"(minor )?issue with the product", 2.5), (r"\b(broken|faulty)\b", 3),
         (r"product did not meet my expectations", 2)), 3,
    ),
    # ------------------------------------------------------------------- Support
    ThemeDef(
        "support-unresolved", "Support left the issue unresolved", "Support", "issue",
        "Customers contacted support and the problem was not fixed.",
        ((r"remains unresolved", 3.5), (r"(not helpful|unhelpful)", 3),
         (r"did not provide a satisfactory", 3)), 3,
    ),
    ThemeDef(
        "support-slow", "Slow support response", "Support", "issue",
        "Long waits before support replied.",
        ((r"wait for a long time", 3.5), (r"took a long time", 3), (r"unresponsive", 2),
         (r"no (response|reply)", 3)), 2,
    ),
    # -------------------------------------------------------------------- Praise
    ThemeDef(
        "support-praise", "Helpful, fast support", "Support", "praise",
        "Support resolved issues quickly and courteously.",
        ((r"(customer service|support (team|staff)).*(outstanding|helpful|friendly|knowledgeable|"
          r"responsive|professional|patient|attentive|excellent)", 3),
         (r"resolved my (issue|concern)", 2), (r"quick resolution", 2)), 1,
    ),
    ThemeDef(
        "delivery-praise", "On-time delivery in good condition", "Delivery", "praise",
        "Orders arrived on time and intact.",
        ((r"on time", 3), (r"(perfect|excellent|good|pristine) condition", 2),
         (r"packaging was (intact|in)", 2)), 1,
    ),
    ThemeDef(
        "value-praise", "Great value for money", "Product", "praise",
        "Customers feel the price is justified.",
        ((r"value for money", 3), (r"worth the price", 3), (r"great (value|investment)", 3)), 1,
    ),
    ThemeDef(
        "design-praise", "Loved the design", "Product", "praise",
        "Positive comments on look and ergonomics.",
        ((r"product's design", 3.5), (r"\bdesign is\b", 3)), 1,
    ),
    ThemeDef(
        "features-praise", "Useful, innovative features", "Product", "praise",
        "Features are valued in day-to-day use.",
        ((r"features? (of this product )?(are|is|have)", 3), (r"innovative", 2),
         (r"must-have|game-changer", 2)), 1,
    ),
    ThemeDef(
        "quality-praise", "Quality and reliability", "Product", "praise",
        "Product quality, durability and performance exceeded expectations.",
        ((r"quality is (excellent|good|high|top)", 3), (r"durab|well-made", 3),
         (r"product's (performance|quality)", 3),
         (r"(exceed|met)\w* (all )?(my )?expectations", 2), (r"performs? (very |exceptionally )?well", 2)),
        1,
    ),
    ThemeDef(
        "safe-transaction", "Safe, transparent purchase", "Trust & Safety", "praise",
        "Customers explicitly reported no fraud and a trustworthy seller.",
        ((r"no (signs of )?fraud", 4), (r"not a victim", 4), (r"genuine product", 2),
         (r"clear refund policy", 2)), 1,
    ),
    ThemeDef(
        "smooth-ordering", "Smooth ordering experience", "Platform", "praise",
        "The site and ordering flow were easy to use.",
        ((r"user-friendly", 1.5), (r"easy to navigate", 1.5),
         (r"website.*(user-friendly|easy)", 3), (r"ordering process was smooth", 2.5),
         (r"hassle-free", 2.5)), 1,
    ),
)

_COMPILED = tuple((t, t.compiled()) for t in TAXONOMY)
BY_SLUG = {t.slug: t for t in TAXONOMY}
# Themes that only apply when nothing more specific does.
CATCH_ALL = frozenset({"fraud-other"})
MATCH_THRESHOLD = 2.0


def match_theme(text: str, *, sentiment: str, is_complaint: bool) -> ThemeDef | None:
    """Best-scoring theme whose polarity is compatible with the message tone."""
    best: tuple[float, ThemeDef] | None = None
    for theme, patterns in _COMPILED:
        if theme.polarity == "issue" and not is_complaint:
            continue
        if theme.polarity == "praise" and sentiment == "negative":
            continue
        score = sum(w for rx, w in patterns if rx.search(text))
        if score < MATCH_THRESHOLD:
            continue
        # A complaint that also contains kind words is still about the issue.
        if is_complaint and theme.polarity == "issue":
            score += 1.5
        if best is None or score > best[0]:
            best = (score, theme)
    return best[1] if best else None
