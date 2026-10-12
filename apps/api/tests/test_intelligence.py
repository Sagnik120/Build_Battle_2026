import pytest

from app.intelligence.clustering.lite import LiteClusterer
from app.intelligence.priority import ThemeStats, revenue_at_risk, score_theme
from app.intelligence.sentiment import analyze_sentiment
from app.intelligence.taxonomy import match_theme
from app.intelligence.text import fingerprint


@pytest.mark.parametrize(
    ("text", "label"),
    [
        ("The customer service was outstanding. They resolved my issue within minutes.", "positive"),
        ("Unfortunately, the customer service was not helpful. My issue remains unresolved.", "negative"),
        ("No fraudulent activity or scam during my transaction.", "positive"),
        ("I was not a victim of fraud, the seller provided a genuine product as advertised.", "positive"),
        ("This site is a scam. They took my money and never sent the product.", "negative"),
        ("Delivery was delayed, but the company provided a satisfactory explanation and compensation.", "mixed"),
        ("Delivery bahut late thi, bilkul bekar service.", "negative"),
    ],
)
def test_sentiment_labels(text, label):
    assert analyze_sentiment(text).label == label


def test_negation_is_not_praise():
    result = analyze_sentiment("The product was not as advertised.")
    assert result.label == "negative" and result.is_complaint


def test_fraud_is_critical_and_unresolved():
    result = analyze_sentiment("I suspect fraudulent activity as I was charged multiple times for a single purchase.")
    assert (result.severity, result.resolution) == (4, "unresolved")


def test_resolved_complaint_is_downgraded():
    result = analyze_sentiment("The delivery was delayed, but the seller provided regular updates and a compensation.")
    assert result.is_complaint and result.resolution == "resolved" and result.severity < 3


@pytest.mark.parametrize(
    ("text", "slug"),
    [
        ("Beware of fraudulent activities. I never received my order despite being charged.", "paid-not-delivered"),
        ("I suspect fraudulent activity as I was charged multiple times for a single purchase.", "duplicate-charge"),
        ("I faced several issues while placing my order on the website. It kept crashing.", "checkout-failure"),
        ("My order was processed incorrectly, and I received the wrong items.", "wrong-item"),
        ("The customer service was outstanding. They resolved my issue within minutes.", "support-praise"),
        ("No signs of fraudulent activity or scam during my purchase.", "safe-transaction"),
    ],
)
def test_theme_matching(text, slug):
    s = analyze_sentiment(text)
    theme = match_theme(text, sentiment=s.label, is_complaint=s.is_complaint)
    assert theme is not None and theme.slug == slug


def test_fingerprint_ignores_case_and_punctuation():
    assert fingerprint("Great product!") == fingerprint("  great   product ")


def test_lite_clusterer_separates_topics():
    texts = [
        "the mobile app login keeps failing with otp error",
        "otp never arrives so login on the app fails",
        "app login otp error again today",
        "loyalty points were not credited after my purchase",
        "my loyalty points vanished from the account",
        "reward loyalty points missing after purchase",
    ]
    clusters = LiteClusterer().cluster(texts)
    groups = sorted(sorted(c.members) for c in clusters)
    assert groups == [[0, 1, 2], [3, 4, 5]]


def test_priority_orders_by_harm_and_explains_itself():
    fraud = score_theme(ThemeStats(500, 500, 500, 4.0, 4, 300, 200, 7000), max_complaints=500)
    praise_adjacent = score_theme(ThemeStats(500, 60, 6, 2.0, 2, 30, 30, 7000), max_complaints=500)
    assert fraud.score > praise_adjacent.score
    assert fraud.tier == "P0" and fraud.reasons
    assert revenue_at_risk({4: 10}, 1000, {4: 0.5}) == 5000

# InsightFlow build iteration: commit 205

# InsightFlow build iteration: commit 206
