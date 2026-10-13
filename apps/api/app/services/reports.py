"""Insight reports: frozen snapshots that can be shared by link or exported."""

from __future__ import annotations

import csv
import io
import secrets
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.models import Report
from app.models.mixins import iso
from app.services.analytics import dashboard
from app.services.filters import FeedbackFilters
from app.services.issues import list_issues
from app.services.recommendations import build_recommendations


def _inr(value: float) -> str:
    """Indian digit grouping: 12,34,567."""
    whole = f"{int(round(value))}"
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        whole = ",".join(parts + [tail])
    return f"₹{whole}"


def _day(value: str) -> str:
    """2026-04-15 -> 15 Apr 2026."""
    return f"{date.fromisoformat(value):%d %b %Y}".lstrip("0")


def executive_summary(dash: dict, recs: dict) -> list[str]:
    """The findings in plain sentences: used by reports and the dashboard brief."""
    k = dash["kpis"]
    lines = [
        f"{k['total']:,} pieces of feedback analysed between {_day(dash['window']['start'])} and "
        f"{_day(dash['window']['end'])}. Net sentiment is {k['nss']:+.0f} "
        f"({k['positive']:,} positive, {k['negative']:,} negative).",
        f"{k['complaint_rate']:.0f}% of feedback is a complaint and {k['unresolved_rate']:.0f}% of "
        f"those complaints describe no resolution.",
    ]
    if k["critical"]:
        lines.append(
            f"{k['critical']:,} complaints are critical: they involve fraud, lost money or "
            f"counterfeit goods."
        )
    top = recs["items"][:3]
    if top:
        lines.append(
            "Fix first: " + "; ".join(
                f"{r['theme']['label']} ({r['metrics']['complaints']:,} complaints, "
                f"priority {r['priority']['score']})" for r in top
            ) + "."
        )
        insight = top[0].get("adaption") or {}
        if insight.get("root_causes"):
            cause = insight["root_causes"][0].rstrip(".")
            lines.append(f"Likely root cause of the top issue, from Adaption's analysis: {cause}.")
    if recs["totals"]["revenue_at_risk"]:
        lines.append(
            f"Estimated revenue at risk from unresolved complaints: "
            f"{_inr(recs['totals']['revenue_at_risk'])} (at an average order value of "
            f"{_inr(recs['assumptions']['average_order_value'])}; an estimate, not a forecast)."
        )
    return lines


def create_report(db: Session, title: str | None, filters: FeedbackFilters) -> Report:
    dash = dashboard(db, filters)
    recs = build_recommendations(db, filters)
    now = datetime.now(timezone.utc)
    payload = {
        "generated_at": now.isoformat(),
        "summary": [] if dash["empty"] else executive_summary(dash, recs),
        "dashboard": dash,
        "recommendations": recs,
        "issues": list_issues(db),
        "methodology": [
            "Sentiment, complaint and resolution signals come from an explainable rule-based "
            "engine; messages enriched by Adaption use its generated analysis instead.",
            "Identical messages are analysed once and counted every time they occur.",
            "Priority = 35% reach + 30% severity + 20% unresolved rate + 15% growth, on a 0-100 scale. "
            "Growth is only scored for feedback that came with real dates.",
            "Revenue at risk = unresolved complainants x average order value x assumed churn "
            "for the severity band. Change the assumptions in Settings.",
        ]
        + (
            ["The source data had no timestamps for some rows; their dates were derived from "
             "row order, so trend lines for those rows are indicative only."]
            if dash["meta"]["timeline_simulated"] else []
        ),
    }
    report = Report(
        title=(title or f"Customer feedback insights — {now:%d %b %Y}")[:200],
        share_token=secrets.token_urlsafe(18),
        filters=filters.as_dict(),
        payload=payload,
    )
    db.add(report)
    db.flush()
    return report


def serialize(report: Report, *, include_payload: bool = True) -> dict:
    data = {
        "id": report.id,
        "title": report.title,
        "share_token": report.share_token,
        "filters": report.filters,
        "created_at": iso(report.created_at),
    }
    if include_payload:
        data["payload"] = report.payload
    else:
        kpis = report.payload.get("dashboard", {}).get("kpis", {})
        data["kpis"] = {k: kpis.get(k) for k in ("total", "nss", "complaint_rate", "critical")}
        data["top_issue"] = next(
            (r["theme"]["label"] for r in report.payload.get("recommendations", {}).get("items", [])),
            None,
        )
    return data


def get_report(db: Session, report_id: int) -> Report:
    report = db.get(Report, report_id)
    if report is None:
        raise NotFoundError("Report not found.")
    return report


def get_report_by_token(db: Session, token: str) -> Report:
    report = db.scalar(select(Report).where(Report.share_token == token))
    if report is None:
        raise NotFoundError("This report link is not valid.")
    return report


def to_markdown(report: Report) -> str:
    p = report.payload
    dash, recs = p["dashboard"], p["recommendations"]
    out = [f"# {report.title}", "", f"_Generated {p['generated_at'][:10]} by InsightFlow_", ""]
    out += ["## Executive summary", ""] + [f"- {line}" for line in p["summary"]] + [""]
    if not dash["empty"]:
        k = dash["kpis"]
        out += [
            "## Key metrics", "",
            "| Metric | Value |", "|---|---|",
            f"| Feedback analysed | {k['total']:,} |",
            f"| Net sentiment score | {k['nss']:+.1f} |",
            f"| Complaint rate | {k['complaint_rate']}% |",
            f"| Unresolved complaints | {k['unresolved_rate']}% |",
            f"| Critical complaints | {k['critical']:,} |", "",
        ]
    out += ["## Priority issues and recommendations", ""]
    for r in recs["items"]:
        pr = r["priority"]
        out += [
            f"### {r['rank']}. {r['theme']['label']} — {pr['tier']} ({pr['score']}/100)", "",
            f"**{r['headline']}**", "",
            "Why it matters:", *[f"- {reason}" for reason in pr["reasons"]], "",
            f"Estimated revenue at risk: {_inr(r['revenue_at_risk'])}", "",
            "Recommended actions:",
            *[f"{i}. **{a['title']}** ({a['owner']}, effort {a['effort']}) — {a['detail']} "
              f"_Measure: {a['metric']}._" for i, a in enumerate(r["actions"], 1)], "",
        ]
        insight = r.get("adaption")
        if insight:
            out += [f"Root-cause analysis by Adaption ({insight['messages_enriched']} distinct messages):"]
            out += [f"- Cause: {c}" for c in insight["root_causes"]]
            out += [f"- Fix: {a}" for a in insight["suggested_actions"]] + [""]
        if r["evidence"]:
            out += ["What customers said:", *[f"> “{e['text']}” (×{e['count']})" for e in r["evidence"]], ""]
        if r["compliance"]:
            out += [f"Compliance note: {r['compliance']}", ""]
    if p["issues"]:
        out += ["## Tracked issues", "", "| Issue | Status | Priority | Owner |", "|---|---|---|---|"]
        out += [
            f"| {i['title']} | {i['status_label']} | {i['priority']} | {i['owner'] or '—'} |"
            for i in p["issues"]
        ] + [""]
    out += ["## Methodology", ""] + [f"- {m}" for m in p["methodology"]] + [""]
    return "\n".join(out)


def to_csv(report: Report) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["rank", "issue", "area", "tier", "priority_score", "complaints", "unresolved",
         "change_pct", "revenue_at_risk_inr", "headline", "top_action", "owner"]
    )
    for r in report.payload["recommendations"]["items"]:
        first = r["actions"][0] if r["actions"] else {}
        writer.writerow(
            [r["rank"], r["theme"]["label"], r["theme"]["area"], r["priority"]["tier"],
             r["priority"]["score"], r["metrics"]["complaints"], r["metrics"]["unresolved"],
             r["priority"]["change_pct"], r["revenue_at_risk"], r["headline"],
             first.get("title", ""), first.get("owner", "")]
        )
    return buffer.getvalue()
