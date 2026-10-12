# Architecture

```
┌──────────────────────────┐        HTTPS / JSON         ┌───────────────────────────────┐
│  Next.js web app (Vercel) │ ─────────────────────────► │  FastAPI (Render / localhost)  │
│  React Query · URL filters│ ◄───────────────────────── │  /api/v1                       │
└──────────────────────────┘                             │                               │
                                                         │  services ── intelligence      │
                                                         │      │            │            │
                                                         │      ▼            ▼            │
                                                         │  SQLite/Postgres  Adaption SDK │──► Adaption
                                                         └───────────────────────────────┘
```

## Data model

| Table | Holds |
|---|---|
| `feedback` | One row per entry as received: text, category, source, rating, date, `fingerprint` |
| `analyses` | One row per **distinct** message (keyed by fingerprint): sentiment, score, complaint, resolution, severity, theme, evidence signals, engine, plus Adaption's summary / root cause / suggested action |
| `themes` | Recurring topics: `known` (taxonomy), `emerging` (clustering), `adaption` (proposed by Adaption) |
| `issues` | Tracked issues with status, owner, due date, baseline metrics, activity log |
| `reports` | Frozen report snapshots with a share token |
| `adaption_runs` | State, credits quote, row counts and quality grade for each run |
| `import_batches`, `settings` | Import history, business assumptions |

Separating `feedback` from `analyses` is the key decision. Identical messages share one analysis,
so re-analysing 7,000 sample rows means 317 computations, and an Adaption run costs 317 rows.

## Analysis pipeline

1. **Fingerprint.** Lower-case, strip punctuation, collapse whitespace, SHA-1.
2. **Sentiment and signals** (`intelligence/sentiment.py`). A rule-based scorer over a commerce
   lexicon with multi-word phrases, negation windows ("not helpful", "no fraud"), intensifiers and
   contrast ("delayed, but they compensated" → mixed). It also derives *complaint*, *resolution*
   (resolved / unresolved) and *severity* (1–4). Every score keeps the phrases that produced it.
   Hinglish terms are included.
3. **Themes, stage one** (`intelligence/taxonomy.py`). Weighted pattern scoring against 22 commerce
   themes, polarity-aware so praise and complaints about the same subject stay apart.
4. **Themes, stage two** (`intelligence/clustering/`). Anything the taxonomy cannot place is
   clustered and surfaced as an *emerging* theme named from its top terms.
5. **Adaption enrichment** (optional). Overrides steps 2–3 per message and adds root cause and fix.

Why rules for the always-on path: it runs in microseconds on a 512 MB server, needs no model
download, and is explainable. The generative work is delegated to Adaption.

## Priority score

`score = 100 × (0.35·reach + 0.30·severity + 0.20·unresolved + 0.15·growth)`

| Factor | Definition |
|---|---|
| Reach | √(complaints ÷ complaints of the largest issue) |
| Severity | Mean of observed complaint severity and the theme's inherent impact, scaled 0–1 |
| Unresolved | Share of complaints with no fix, refund or follow-up mentioned |
| Growth | Increase in the later half of the period over the earlier half, capped at +100% |

Tiers: P0 ≥ 85, P1 ≥ 70, P2 ≥ 50, P3 below. The API returns the factors and the reasons so the UI
can show its working.

**Revenue at risk** = unresolved complainants × average order value × assumed churn for the
severity band (5 / 15 / 35 / 60%). The order value is editable; the figure is labelled an estimate.

## Analytics

One grouped SQL query builds a small cube (day × category × source × sentiment × complaint ×
resolution × severity × theme). All KPIs, charts and theme roll-ups are derived from it in memory,
so the dashboard costs one database round-trip. A `day` column on `feedback` keeps the grouping
portable between SQLite and Postgres.

## Frontend

- **Routes** are thin; each screen lives in `src/features/<screen>/`.
- **Filters live in the URL** (`use-filters.ts`), so views can be shared and carried between screens.
- **Server state** is TanStack Query. Network failures retry with back-off to ride out cold starts.
- **Charts.** Sentiment colours were checked with a colour-blind separation validator in light and
  dark mode; stacked segments are separated by a surface-coloured gap, and every chart has a legend
  and tooltip so colour is never the only cue.
- **Design.** Neutral zinc palette, Geist, hairline borders, restrained motion, light and dark
  themes, print stylesheet for reports.

## API surface

```
GET  /api/v1/health · /system/info            POST /system/reset
GET  /feedback · /feedback/facets · /feedback/export.csv · /feedback/batches
POST /feedback · /feedback/import/preview · /feedback/import · /feedback/sample
GET  /analytics/dashboard · /themes · /recommendations
POST /analysis/run                             GET/PUT /settings/assumptions
GET/POST /issues   PATCH/DELETE /issues/{id}
GET/POST /reports  GET/DELETE /reports/{id}    GET /reports/{id}/export?format=md|csv|json
GET  /public/reports/{token}
GET  /adaption/status · /adaption/runs · /adaption/dataset.csv
POST /adaption/runs · /adaption/runs/{id}/advance|launch|cancel · /adaption/import
```

Interactive docs are served at `/docs` on the API.
