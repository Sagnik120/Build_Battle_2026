"""Action playbooks: what a commerce team in India can actually do about each theme.

Each action names an owner, an effort band and the metric that proves it
worked. ``compliance`` flags obligations under Indian consumer and payments
regulation so legal exposure is visible next to the customer impact.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Action:
    title: str
    detail: str
    owner: str
    effort: str  # S (days) | M (weeks) | L (quarter)
    metric: str

    def as_dict(self) -> dict:
        return {
            "title": self.title, "detail": self.detail, "owner": self.owner,
            "effort": self.effort, "metric": self.metric,
        }


@dataclass(frozen=True, slots=True)
class Playbook:
    headline: str
    actions: tuple[Action, ...]
    compliance: str | None = None


_ECOM_RULES = (
    "Consumer Protection (E-Commerce) Rules, 2020: the grievance officer must acknowledge a "
    "complaint within 48 hours and redress it within one month."
)

PLAYBOOKS: dict[str, Playbook] = {
    "paid-not-delivered": Playbook(
        "Stop taking money for orders that never ship.",
        (
            Action("Hold seller payouts until delivery is confirmed",
                   "Move high-risk sellers to escrow-style settlement: release funds only on a "
                   "delivered scan or OTP-confirmed handover.", "Marketplace Ops", "M",
                   "Paid-not-delivered complaints per 1,000 orders"),
            Action("Auto-refund at SLA breach",
                   "If an order has no shipping scan 5 days after payment, refund to source "
                   "automatically and notify the customer on WhatsApp/SMS.", "Payments", "M",
                   "Median days from complaint to refund"),
            Action("Suspend repeat-offender sellers",
                   "Flag sellers with 3+ non-delivery complaints in 30 days for review and "
                   "delist on confirmation.", "Trust & Safety", "S",
                   "Share of complaints from repeat sellers"),
        ),
        _ECOM_RULES + " Point affected customers to the cyber-fraud helpline 1930 / "
        "cybercrime.gov.in where money was lost to a fraudulent seller.",
    ),
    "duplicate-charge": Playbook(
        "Make double debits impossible, and reverse them before the customer has to ask.",
        (
            Action("Add idempotency keys to payment capture",
                   "Send one idempotency key per order to the payment gateway so UPI/card "
                   "retries on timeouts cannot capture twice.", "Payments Engineering", "S",
                   "Duplicate captures per 10,000 transactions"),
            Action("Daily reconciliation with auto-reversal",
                   "Reconcile gateway settlements against orders every day and reverse "
                   "unmatched captures automatically.", "Finance Ops", "M",
                   "Hours from duplicate debit to reversal"),
            Action("Proactive apology message",
                   "Tell the customer the reversal is in progress before they contact support.",
                   "CX", "S", "Contacts per duplicate charge"),
        ),
        "RBI's 2019 framework on turnaround time for failed transactions sets auto-reversal "
        "timelines and Rs 100/day compensation when a debit does not complete; confirm with your "
        "payment aggregator how duplicate captures are treated. " + _ECOM_RULES,
    ),
    "extra-payment-demand": Playbook(
        "Close the off-platform payment loophole sellers are using.",
        (
            Action("Ban and detect off-platform payment requests",
                   "Scan seller-buyer chat for UPI IDs, phone numbers and payment links; block "
                   "the message and warn the buyer.", "Trust & Safety", "M",
                   "Extra-payment complaints per 1,000 orders"),
            Action("Lock the price at checkout",
                   "Show a 'price locked - never pay outside the app' banner on the order page "
                   "and in the confirmation message.", "Product", "S",
                   "Complaints mentioning additional payment"),
            Action("Seller penalty ladder",
                   "Warning, payout hold, then delisting for sellers confirmed asking for more "
                   "money after purchase.", "Marketplace Ops", "S",
                   "Repeat offences per seller"),
        ),
        "Charging more than the displayed price can be an unfair trade practice under the "
        "Consumer Protection Act, 2019. " + _ECOM_RULES,
    ),
    "counterfeit": Playbook(
        "Get counterfeits off the catalogue and refund buyers without a fight.",
        (
            Action("Verify sellers and brands before listing",
                   "Require GSTIN and brand-authorisation documents for branded categories.",
                   "Marketplace Ops", "M", "Counterfeit complaints per 1,000 orders"),
            Action("No-questions refund for authenticity claims",
                   "Refund on photo evidence and recover the amount from the seller.",
                   "CX", "S", "Resolution time for authenticity claims"),
            Action("Delist on the second confirmed case", "Two confirmed counterfeit cases "
                   "remove the listing; three remove the seller.", "Trust & Safety", "S",
                   "Listings removed / complaints received"),
        ),
        "E-Commerce Rules, 2020 require marketplaces to act on sellers of counterfeit goods "
        "and to record repeat offenders. " + _ECOM_RULES,
    ),
    "misrepresented": Playbook(
        "Make listings match what arrives.",
        (
            Action("Audit the listings behind the complaints",
                   "Pull the top complained-about listings and correct photos, specs and "
                   "claims, or take them down.", "Catalogue", "S",
                   "'Not as advertised' complaints per 1,000 orders"),
            Action("Return reason 'not as described' = seller-paid return",
                   "Free pickup and full refund, charged back to the seller.", "CX", "S",
                   "Return completion time"),
            Action("Listing quality score", "Rank down listings with high mismatch returns.",
                   "Product", "M", "Mismatch return rate"),
        ),
        "Misleading descriptions fall under 'misleading advertisement' in the Consumer "
        "Protection Act, 2019. " + _ECOM_RULES,
    ),
    "fraud-other": Playbook(
        "Triage unspecified fraud reports within a day.",
        (
            Action("Dedicated fraud queue with 24-hour first response",
                   "Route every message mentioning fraud or scam to a specialist queue.",
                   "Trust & Safety", "S", "First-response time on fraud tickets"),
            Action("Structured intake form", "Capture order ID, seller and amount so each "
                   "report can be classified and actioned.", "CX", "S",
                   "Share of fraud reports with a root cause"),
        ),
        _ECOM_RULES,
    ),
    "refund-denied": Playbook(
        "Remove agent discretion from refunds that policy already allows.",
        (
            Action("Auto-approve policy-eligible refunds", "Approve instantly when the order "
                   "meets the published refund policy.", "CX", "M", "Refund approval time"),
            Action("Publish refund status tracking", "Show refund stage and expected credit "
                   "date in the order page.", "Product", "S", "Refund-status contacts"),
        ),
        _ECOM_RULES,
    ),
    "delivery-delay": Playbook(
        "Promise dates you can keep, and tell customers before they have to ask.",
        (
            Action("Recalibrate delivery promises by pincode",
                   "Use actual courier performance per pincode and lane to set the promised "
                   "date instead of a flat estimate.", "Logistics", "M",
                   "On-time delivery rate"),
            Action("Proactive delay alerts with compensation",
                   "Notify on WhatsApp/SMS when an order will miss its date and attach a "
                   "coupon automatically, before the customer has to chase.", "CX", "S", "Complaints per delayed order"),
            Action("Courier scorecards", "Shift volume away from partners missing SLA on "
                   "specific lanes.", "Logistics", "M", "SLA breaches by courier"),
        ),
    ),
    "damaged-missing": Playbook(
        "Fix packing quality and make short-shipments provable.",
        (
            Action("Packaging standard by product fragility",
                   "Define packing specs per category and audit a sample at each "
                   "warehouse/seller daily.", "Fulfilment", "M", "Damage rate per 1,000 parcels"),
            Action("Weigh and photograph at dispatch",
                   "Record parcel weight and a packed photo so missing-item claims settle in "
                   "minutes.", "Fulfilment", "M", "Missing-item claim resolution time"),
            Action("Instant replacement for damage with photo", "Skip the return leg for "
                   "low-value damaged items.", "CX", "S", "Days to replacement"),
        ),
    ),
    "wrong-item": Playbook(
        "Catch pick errors before the parcel leaves.",
        (
            Action("Scan-to-pack verification", "Require a barcode scan of every item against "
                   "the order at the packing station.", "Fulfilment", "M",
                   "Wrong-item rate per 1,000 orders"),
            Action("Fix look-alike SKUs", "Separate bin locations and add clear labels for "
                   "the SKUs most often swapped.", "Warehouse", "S", "Mis-picks by SKU pair"),
            Action("One-touch exchange", "Deliver the right item and collect the wrong one in "
                   "a single visit.", "Logistics", "M", "Days to correct item"),
        ),
    ),
    "checkout-failure": Playbook(
        "Every checkout crash is a sale that did not happen - treat it as a revenue incident.",
        (
            Action("Instrument the checkout funnel",
                   "Add error tracking and step-level drop-off alerts for cart, address, "
                   "payment and confirmation.", "Engineering", "S", "Checkout completion rate"),
            Action("Load-test and fix the crash path",
                   "Reproduce on low-end Android and slow 4G - the conditions most Indian "
                   "shoppers are on - and fix the top crash signatures.", "Engineering", "M",
                   "Crash-free checkout sessions"),
            Action("Cart recovery", "Save the cart and send a resume link when a session dies "
                   "mid-payment.", "Growth", "S", "Recovered carts"),
        ),
    ),
    "product-failure": Playbook(
        "Find the failing products and stop selling them until they are fixed.",
        (
            Action("Rank SKUs by early-failure complaints", "Identify the products behind "
                   "'stopped working' reports and pause the worst.", "Category", "S",
                   "Failure complaints per 1,000 units"),
            Action("Supplier corrective action", "Send failure evidence to the supplier with "
                   "a fix deadline; add inbound QC sampling.", "Quality", "M",
                   "Defect rate at inbound QC"),
            Action("Simple warranty replacement", "Replace within 7 days on failure inside "
                   "the warranty window.", "CX", "S", "Days to replacement"),
        ),
        "Customers are entitled to remedy for defective goods under the Consumer Protection "
        "Act, 2019 (product liability).",
    ),
    "support-unresolved": Playbook(
        "Measure support on problems solved, not tickets closed.",
        (
            Action("Reopen-proof closure", "A ticket closes only when the customer confirms "
                   "the fix; track first-contact resolution.", "Support", "S",
                   "First-contact resolution rate"),
            Action("Escalation path with authority", "Give tier-2 the power to refund, "
                   "replace or compensate without further approval.", "Support", "S",
                   "Share of tickets resolved at tier 2"),
            Action("Weekly unresolved review", "Review the oldest open cases every week and "
                   "fix the policy gap behind each.", "CX Lead", "S", "Tickets open > 7 days"),
        ),
        _ECOM_RULES,
    ),
    "support-slow": Playbook(
        "Cut the wait before a human (or a good bot) answers.",
        (
            Action("Staff to the contact curve", "Match agent shifts to hourly contact "
                   "volume; add evening and weekend cover.", "Support", "M",
                   "Median first-response time"),
            Action("Self-serve for the top 5 intents", "Order status, refund status, return, "
                   "cancel and address change in WhatsApp and the app.", "Product", "M",
                   "Contacts deflected"),
            Action("Publish and honour a response SLA", "Show the expected wait and "
                   "acknowledge within 48 hours at the latest.", "Support", "S",
                   "SLA attainment"),
        ),
        _ECOM_RULES,
    ),
}

GENERIC = Playbook(
    "Investigate this emerging pattern before it grows.",
    (
        Action("Read the evidence and name a root cause", "Review the representative "
               "messages and assign an owner within a week.", "CX Lead", "S",
               "Complaints in this theme per week"),
        Action("Add it to the taxonomy", "Once understood, give it a name and a standard "
               "response so it is tracked from now on.", "Insights", "S",
               "Share of feedback left uncategorised"),
    ),
)


def get_playbook(slug: str) -> Playbook:
    return PLAYBOOKS.get(slug, GENERIC)

# InsightFlow build iteration: commit 166
