# InsightFlow

**Turn raw customer feedback into a ranked list of what to fix, why, and how.**

Built for Build Battle 2026 (Frontend Arena) — *InsightFlow: Intelligent Customer Feedback & Decision Platform*.

InsightFlow ingests reviews, survey answers and support messages, reads each one for sentiment and
topic, groups them into recurring themes, scores every theme for priority, and produces
recommendations with owners, effort and success metrics. It is built for Indian commerce teams:
amounts in ₹ with lakh/crore formatting, Hinglish-aware sentiment, day-first dates, and compliance
notes tied to the Consumer Protection (E-Commerce) Rules, 2020.

## What it does

| Requirement | Where | How |
|---|---|---|
| Feedback management | **Feedback** | Add entries by hand, import any CSV (auto column detection + manual mapping), search, filter, sort, group identical messages, export. Sample dataset loads on first run. |
| AI-powered analysis | **Feedback**, **Adaption** | Sentiment, complaint, resolution and severity per message; two-stage theme detection (taxonomy, then clustering for emerging themes); Adaption generates structured analysis, root causes and fixes. |
| Analytics dashboard | **Dashboard** | KPIs with period-over-period change, sentiment over time, sentiment split, category mix, severity, most-reported issues, what customers like. Filters live in the URL. |
| Intelligent recommendations | **Priorities** | 0–100 priority score with its four factors shown, plain-English reasons, action playbook, customer quotes as evidence, ₹ revenue at risk, India compliance notes. |
| Reports & issue tracking | **Issues**, **Reports** | Track an insight as an issue (status, owner, due date, notes, live complaint counts vs. baseline). Reports are frozen snapshots: public share link, print/PDF, Markdown, CSV, JSON. |

## Quick start

Requirements: Python 3.11+, Node 20+, pnpm.

```bash
make setup     # backend venv + frontend deps + env files
make dev       # API on :8787, web on :3000
```

Open http://localhost:3000. The sample dataset (7,000 reviews) is loaded and analysed on first start.

Without `make`:

```bash
cd apps/api && python3 -m venv .venv && .venv/bin/pip install -r requirements/local.txt
.venv/bin/uvicorn app.main:app --reload --port 8787

cd apps/web && pnpm install && cp .env.example .env.local && pnpm dev
```

To use Adaption through its API, put your key in `apps/api/.env` as `ADAPTION_API_KEY` and restart
the API. See [docs/ADAPTION.md](docs/ADAPTION.md).

## Two profiles: local and cloud

One codebase, switched by `APP_PROFILE`. Free-tier hosts have 512 MB of RAM, sleep when idle and
have no persistent disk, so the cloud profile trades some capability for reliability.

| | `local` (best) | `cloud` (free tier) |
|---|---|---|
| Clustering engine | scikit-learn: TF-IDF 1–2 grams, k-means++, cluster count chosen by silhouette | Pure Python: TF-IDF + spherical k-means, no numpy |
| Database | SQLite (zero setup) or Postgres via `docker compose` | Postgres (Neon free tier) |
| Adaption run sync | Background thread, runs with no browser open | Browser-driven polling, survives a sleeping server |
| Import limits | 250,000 rows / 50 MB | 25,000 rows / 8 MB |
| Install size | ~250 MB with scikit-learn | ~60 MB |

Sentiment, theme taxonomy, priority scoring, recommendations, issues and reports are identical in
both. Details in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Repository layout

```
apps/
  api/                         FastAPI backend
    app/
      core/                    settings (profiles), database, error handling
      models/                  SQLAlchemy models
      schemas/                 request schemas
      api/v1/routes/           HTTP endpoints, one module per area
      services/                ingest, pipeline, analytics, recommendations, issues, reports
      intelligence/            sentiment, lexicon, taxonomy, clustering/, priority, playbooks
      integrations/adaption/   client, prompts, mapper, run state machine
      seed/                    sample dataset
    tests/                     31 tests (pytest)
    requirements/              base / local / cloud
  web/                         Next.js 16 + React 19 + Tailwind v4 frontend
    src/
      app/                     routes: (app)/dashboard, feedback, insights, issues, reports, adaption, settings; share/[token]
      features/                one folder per screen
      components/
        ui/                    shadcn/ui primitives
        jyotirmoydas/          components from the jyotimoydas.in registry
        layout/, shared/       app shell, filter bar, badges, sparkline
      hooks/, lib/             URL filters, API client, types, formatting
docs/                          architecture, Adaption integration, deployment
render.yaml                    Render blueprint for the API
docker-compose.yml             optional local Postgres stack
```

## Tech

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui (Radix),
  TanStack Query, Recharts, Motion. UI components from the
  [jyotimoydas.in registry](https://jyotimoydas.in/components): Command Box (⌘K), Status Button,
  Shimmering Text, Scroll Fade Effect, Theme Switcher, Status Indicator.
- **Backend:** FastAPI, SQLAlchemy 2, Pydantic 2, scikit-learn (local profile), official `adaption` SDK.
- **Data:** SQLite or Postgres.

## Notes on the sample data

The provided dataset has two columns, `review` and `category`, and no dates. 7,000 rows contain
317 distinct messages, so each distinct message is analysed once and counted every time it occurs.
Because trend charts need dates, the sample is spread over 180 days **in file order**; the app says
so wherever a trend is shown. When you import your own file with a date column, real dates are used.

## Testing

```bash
make test    # backend: sentiment, themes, clustering, priority, API, Adaption merge
make lint    # ruff + eslint + tsc
```

The suite passes on SQLite and on Postgres under both profiles.
