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

## New feedback goes to Adaption automatically

When feedback is submitted or imported and an API key is set, the messages Adaption has not read yet
are queued for it in the background. The person sees the built-in engine's read instantly, and
Adaption's theme, root cause and fix replace it when the job finishes (typically 10–20 minutes; a
notice appears in the app and every screen refreshes).

Because the deployment has no sign-in, spending is bounded:

| Limit | Default | Setting |
|---|---|---|
| Runs at once | 1 (later messages join the next run) | — |
| Credits per automatic run | 2; a dearer quote waits for a click on the Adaption page | `ADAPTION_AUTO_MAX_CREDITS` |
| Automatic runs per 24 hours | 10 | `ADAPTION_AUTO_DAILY_RUNS` |
| Switch | on | `ADAPTION_AUTO_ENRICH=false` turns it off |

A message Adaption could not answer is not resent in a loop: a finished run only triggers another
for feedback added after it started.

## Two rules applied when merging

- **Specific beats catch-all.** If Adaption files a message under the catch-all `fraud-other` theme
  and the message plainly names a concrete problem (a duplicate charge, a missing order, a
  misdescribed product), the specific theme is used. Adaption's sentiment, severity, root cause and
  fix are kept as returned. The prompt also asks Adaption to prefer the specific theme.
- **Repeated wording is collapsed.** Root causes and fixes shown on a recommendation are weighted by
  how many customers sent the message, and near-identical sentences are dropped.

## Saved output for the sample dataset

The output of the live runs on the bundled sample is saved in
[`adaption_sample.jsonl`](../apps/api/app/seed/adaption_sample.jsonl) (317 rows, in the same format
as an Adaption download). When the sample dataset is loaded into an empty or reset workspace, that
file is merged through the normal mapper and recorded as a run of type "saved output". A fresh
deployment therefore shows Adaption's analysis immediately instead of waiting 15–20 minutes on a
queued job. Anything imported or submitted afterwards is not covered by it and goes to Adaption
through a live run. Turn it off with `ADAPTION_SAMPLE_SNAPSHOT=false`.

## What has and has not been verified

- Verified by tests: dataset export, the mapper (fenced JSON, missing refs, new themes, unmatched
  rows), merge behaviour, protection from local re-analysis, the not-configured error path.
- Verified against the installed SDK (`adaption` 0.14.0): every method name and parameter used.
- Verified against the live Adaption service on 13 Oct 2026, through the API path, on the sample
  dataset:

  | Run | Scope | Rows sent | Rows merged | Unmatched | Credits quoted | Quality grade (before → after) |
  |---|---|---|---|---|---|---|
  | 1 | complaints, `max_rows=10` | 71 | 10 | 0 | 1 | A (9.0) → A (9.5) |
  | 2 | all not yet enriched | 307 | 307 | 0 | 4 | A (10.0) → A (9.7) |

  All 317 distinct messages (7,000 rows) now carry Adaption's analysis. Every completion came back
  as valid JSON and matched by `ref`. Adaption kept to the supplied theme list and proposed no new
  themes on this dataset.
- Automatic enrichment verified live on 13 Oct 2026: one submitted message was uploaded, quoted
  (1 credit), launched and merged with no clicks; it came back with a root cause and a fix.
- Not exercised against the live service: the manual export/import path (covered by tests only).

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
