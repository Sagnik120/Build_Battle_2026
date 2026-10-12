import io
import json

from app.integrations.adaption.mapper import make_ref
from app.intelligence.text import fingerprint

API = "/api/v1"


def test_health(client):
    assert client.get(f"{API}/health").json() == {"status": "ok"}


def test_sample_import_dedupes(seeded):
    assert seeded["rows_imported"] == 7000
    assert seeded["distinct_voices"] < 400
    assert seeded["timeline_simulated"] is True


def test_dashboard_totals_are_consistent(client, seeded):
    data = client.get(f"{API}/analytics/dashboard").json()
    kpis = data["kpis"]
    assert kpis["total"] == 7000
    assert kpis["positive"] + kpis["negative"] + kpis["mixed"] + kpis["neutral"] == 7000
    assert sum(row["total"] for row in data["trend"]) == 7000
    assert sum(row["total"] for row in data["by_category"]) == 7000
    assert data["top_issues"][0]["priority"]["score"] >= data["top_issues"][-1]["priority"]["score"]


def test_filters_narrow_results(client, seeded):
    data = client.get(f"{API}/analytics/dashboard", params={"category": "Fraud and Scam"}).json()
    assert 0 < data["kpis"]["total"] < 7000
    assert [row["category"] for row in data["by_category"]] == ["Fraud and Scam"]

    page = client.get(f"{API}/feedback", params={"q": "counterfeit", "page_size": 5}).json()
    assert page["total"] > 0 and all("counterfeit" in item["text"].lower() for item in page["items"])

    grouped = client.get(f"{API}/feedback", params={"collapse": True, "sort": "most_repeated", "page_size": 1}).json()
    assert grouped["items"][0]["occurrences"] > 100


def test_recommendations_explain_and_cite_evidence(client, seeded):
    recs = client.get(f"{API}/recommendations").json()
    top = recs["items"][0]
    assert top["priority"]["reasons"] and top["actions"] and top["evidence"]
    assert top["revenue_at_risk"] > 0


def test_submit_feedback_is_analysed(client, seeded):
    response = client.post(f"{API}/feedback", json={"text": "They charged me twice and refused to refund.", "source": "support"})
    assert response.status_code == 201
    analysis = response.json()["analysis"]
    assert analysis["sentiment"] == "negative" and analysis["severity"] == 4


def test_csv_import_with_dates_and_custom_columns(client, seeded):
    csv_bytes = (
        b"Comment;Dept;Submitted\n"
        b"App crashed during payment;Tech;05/03/2026\n"
        b"Loved the quick delivery;Logistics;06/03/2026\n"
    )
    preview = client.post(f"{API}/feedback/import/preview", files={"file": ("x.csv", io.BytesIO(csv_bytes))}).json()
    assert preview["mapping"]["text"] == "Comment" and preview["has_dates"] is True
    batch = client.post(
        f"{API}/feedback/import",
        files={"file": ("x.csv", io.BytesIO(csv_bytes))},
        data={"mapping": json.dumps({"category": "Dept"})},
    ).json()
    assert batch["rows_imported"] == 2 and batch["timeline_simulated"] is False
    # 05/03/2026 is 5 March in India, not 3 May.
    march = client.get(f"{API}/feedback", params={"date_from": "2026-03-05", "date_to": "2026-03-05"}).json()
    assert march["total"] == 1


def test_issue_lifecycle(client, seeded):
    theme_id = client.get(f"{API}/recommendations").json()["items"][0]["theme"]["theme_id"]
    issue = client.post(f"{API}/issues", json={"theme_id": theme_id}).json()
    assert issue["baseline"]["complaints"] > 0 and issue["current"]["complaints"] > 0
    updated = client.patch(f"{API}/issues/{issue['id']}", json={"status": "resolved", "note": "Fixed"}).json()
    assert updated["status"] == "resolved" and len(updated["activity"]) == 3
    assert client.delete(f"{API}/issues/{issue['id']}").status_code == 204


def test_report_share_and_export(client, seeded):
    report = client.post(f"{API}/reports", json={"filters": {}}).json()
    assert report["payload"]["summary"]
    shared = client.get(f"{API}/public/reports/{report['share_token']}").json()
    assert shared["id"] == report["id"]
    assert client.get(f"{API}/public/reports/not-a-token").status_code == 404
    markdown = client.get(f"{API}/reports/{report['id']}/export", params={"format": "md"}).text
    assert "## Executive summary" in markdown
    assert client.get(f"{API}/reports/{report['id']}/export", params={"format": "csv"}).text.startswith("rank,")


def test_adaption_requires_key_for_api_runs(client, seeded):
    assert client.get(f"{API}/adaption/status").json()["configured"] is False
    response = client.post(f"{API}/adaption/runs", json={"scope": "all"})
    assert response.status_code == 409 and response.json()["error"]["code"] == "adaption_not_configured"


def test_adaption_manual_import_merges_by_ref_and_by_text(client, seeded):
    dataset = client.get(f"{API}/adaption/dataset.csv").text.splitlines()
    assert dataset[0] == "ref,feedback,category,occurrences"

    by_ref = "The delivery was delayed by two weeks, which was very inconvenient."
    by_text = "My order was processed incorrectly, and I received the wrong items."
    rows = [
        {  # matched through the echoed ref, JSON wrapped in a code fence
            "enhanced_prompt": "…",
            "enhanced_completion": "```json\n" + json.dumps({
                "ref": make_ref(fingerprint(by_ref)), "sentiment": "negative", "sentiment_score": -0.8,
                "is_complaint": True, "resolved": False, "severity": 3, "theme": "delivery-delay",
                "root_cause": "Courier SLA breaches on long-haul lanes.",
                "suggested_action": "Recalibrate promised dates by pincode.", "summary": "Two-week delivery delay.",
            }) + "\n```",
        },
        {  # no ref anywhere: matched through the feedback text, proposes a new theme
            "feedback": by_text,
            "completion": json.dumps({"sentiment": "negative", "is_complaint": True, "resolved": False,
                                      "severity": 3, "theme": "new: Warehouse picking errors",
                                      "root_cause": "Look-alike SKUs stored side by side."}),
        },
        {"enhanced_completion": "{}", "feedback": "text that is not in the workspace"},
    ]
    payload = "\n".join(json.dumps(r) for r in rows).encode()
    run = client.post(f"{API}/adaption/import", files={"file": ("adapted.jsonl", io.BytesIO(payload))}).json()
    assert (run["rows_merged"], run["rows_unmatched"], run["stage"]) == (2, 1, "completed")

    item = client.get(f"{API}/feedback", params={"q": "delayed by two weeks", "page_size": 1}).json()["items"][0]
    assert item["analysis"]["engine"] == "adaption"
    assert item["analysis"]["root_cause"].startswith("Courier SLA")

    proposed = client.get(f"{API}/feedback", params={"q": "processed incorrectly", "page_size": 1}).json()["items"][0]
    assert proposed["analysis"]["theme"]["label"] == "Warehouse picking errors"
    assert proposed["analysis"]["theme"]["kind"] == "adaption"

    # Re-running the local engine must not overwrite Adaption's output.
    client.post(f"{API}/analysis/run")
    again = client.get(f"{API}/feedback", params={"q": "delayed by two weeks", "page_size": 1}).json()["items"][0]
    assert again["analysis"]["engine"] == "adaption"
    assert client.get(f"{API}/adaption/status").json()["enriched"] == 2


def test_unmatched_adaption_file_is_rejected(client, seeded):
    payload = json.dumps({"completion": json.dumps({"sentiment": "positive"}), "feedback": "unknown text"}).encode()
    response = client.post(f"{API}/adaption/import", files={"file": ("bad.jsonl", io.BytesIO(payload))})
    assert response.status_code == 400 and response.json()["error"]["code"] == "adaption_no_match"

# InsightFlow build iteration: commit 207

# InsightFlow build iteration: commit 208

# InsightFlow build iteration: commit 348
