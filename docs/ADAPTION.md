# How InsightFlow uses Adaption

## In one paragraph

Adaption's **Adaptive Data** pipeline is the generative layer of InsightFlow. The app de-duplicates
feedback, sends one row per distinct message to Adaption with a single shared instruction
(*universal prompt* mode), and Adaption generates a structured analysis for every row: sentiment,
severity, theme, **root cause** and **suggested fix**. InsightFlow merges that output back by
reference ID, so Adaption's read replaces the built-in engine's read for those messages, and the
root causes and fixes appear in the feedback detail view and on each recommendation.

## The workflow

```
feedback rows ──► de-duplicate by fingerprint ──► dataset CSV (ref, feedback, category, occurrences)
                                                        │
                              client.datasets.upload_file(csv)
                                                        │
                                   poll get_status until row_count
                                                        │
              client.datasets.adapt(estimate=True)  ──► credit quote shown to the user
                                                        │   user confirms
                         client.datasets.adapt(...)  ──► run starts
                                                        │
                                   poll get_status until succeeded
                                                        │
        client.datasets.download(file_format="jsonl") ──► parse ──► match by ref ──► update analyses
                                                        │
                     client.datasets.get_evaluation() ──► before/after quality grade stored on the run
```

### What is sent

| Setting | Value | Why |
|---|---|---|
| `column_mapping.universal_prompt` | The analyst instruction in [`prompts.py`](../apps/api/app/integrations/adaption/prompts.py) | There is no per-row prompt; every row gets the same task. |
| `column_mapping.context` | `ref`, `feedback`, `category` | The per-row content the instruction is applied to. |
| `recipes.deduplication` | `false` | Rows are already distinct and must map 1:1 back to our records. |
| `recipes.prompt_rephrase` | `false` | The instruction must stay exactly as written to keep output parseable. |
| `recipes.reasoning_traces` | optional toggle | Adds chain-of-thought to completions. |
| `brand_controls.blueprint` | Tone and safety rules (no invented facts, answer in English, JSON only) | Applies to every row. |
| `brand_controls.length` | `concise` | Short, structured output. |
| `job_specification.max_rows` | optional | Caps credit spend. |
| `job_specification.idempotency_key` | one per run | A retried launch cannot bill twice. |

The exact prompt is also shown in the app on the **Adaption** page.

### What comes back, and where it goes

Each completion is a JSON object. The mapper
([`mapper.py`](../apps/api/app/integrations/adaption/mapper.py)) validates every field before using it:

| Field | Used for |
|---|---|
| `sentiment`, `sentiment_score` | Dashboard sentiment, net sentiment score |
| `is_complaint`, `resolved`, `severity` | Complaint rate, unresolved rate, priority score |
| `theme` | Theme grouping. A taxonomy slug, or `new: <label>` which creates a theme marked as proposed by Adaption |
| `root_cause`, `suggested_action` | Shown per message and aggregated onto each recommendation |
| `summary` | Feedback detail view |

Rows are matched to records in three ways, in order: the `ref` echoed in the JSON, any `IF-…` ref
found anywhere in the row, then the fingerprint of the feedback text. Rows that cannot be matched
are counted and reported, never guessed. A completion that is not valid JSON is kept as a summary
only and does not change scores.

## Two ways to run it

**1. Through the API** (needs `ADAPTION_API_KEY` on the backend). On the Adaption page: choose the
scope, upload, review the credit quote, launch. Nothing is charged before launch. The run is a
resumable state machine (`ingesting → estimated → running → completed | failed`), so it survives a
free-tier server going to sleep: the browser polls `advance` in the cloud profile, a background
thread does in the local profile.

**2. By hand in the Adaption app** (no key needed). Download the prepared CSV from the Adaption
page, create a dataset from it in the Adaption app, map `ref`, `feedback`, `category` as Context,
paste the universal prompt, turn off Prompt Deduplication and Prompt Rephrasing, launch, then upload
the adapted file back. The same mapper merges it.

## Why this design

- **Cost.** The sample has 7,000 rows but 317 distinct messages. De-duplicating first means paying
  for 317 rows, not 7,000.
- **The app never depends on a long job.** Adaption runs can queue. The built-in engine gives
  instant results; Adaption upgrades them when it finishes. Its output is never overwritten by a
  later local re-analysis.
- **Honest provenance.** Every analysis records which engine produced it (`local-sklearn`,
  `local-lite` or `adaption`), and the UI shows it.

## What has and has not been verified

- Verified by tests: dataset export, the mapper (fenced JSON, missing refs, new themes, unmatched
  rows), merge behaviour, protection from local re-analysis, the not-configured error path.
- Verified against the installed SDK (`adaption` 0.14.0): every method name and parameter used.
- **Not yet run against the live Adaption service**, because no API key was available while
  building. The download format is therefore handled defensively (several possible completion
  column names, three matching strategies). Do one small run with `max_rows` set before a demo.

## Files

```
apps/api/app/integrations/adaption/
  prompts.py   universal prompt, blueprint, adapt() request
  client.py    wrapper over the official SDK, error translation
  mapper.py    parse export → validated enrichments → match to records
  service.py   dataset builder, run state machine, merge, manual import
apps/api/app/api/v1/routes/adaption.py
apps/web/src/features/adaption/adaption-view.tsx
```
