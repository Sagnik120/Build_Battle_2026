# Deployment

Target: **frontend on Vercel, API on Render's free tier, Postgres on Neon's free tier.**

## What the free tier changes

| Constraint | Effect | How InsightFlow handles it |
|---|---|---|
| 512 MB RAM | scikit-learn + numpy are heavy | `cloud` profile uses a pure-Python clustering engine and a smaller dependency set |
| Service sleeps after ~15 minutes idle | First request takes 30–60 s | The web app retries with back-off and shows "Waking the server…" |
| No persistent disk | A SQLite file is wiped on every restart | Use Postgres. Without `DATABASE_URL` the app still runs and re-seeds the sample, but issues, reports and imports are lost on restart |
| No background workers | Long Adaption runs cannot be polled server-side | The run is a resumable state machine advanced by the browser |

## 1. Database (Neon)

1. Create a project at neon.tech and copy the connection string.
2. Keep `?sslmode=require` on the end. Both `postgres://` and `postgresql://` forms work.

## 2. API (Render)

1. Push the repository to GitHub.
2. In Render: **New → Blueprint**, select the repository. `render.yaml` defines the service.
3. Set the three values it asks for:
   - `DATABASE_URL` — the Neon connection string
   - `CORS_ORIGINS` — your Vercel URL, e.g. `https://insightflow.vercel.app` (comma-separate several)
   - `ADAPTION_API_KEY` — optional
4. Deploy. Check `https://<service>.onrender.com/api/v1/health` returns `{"status":"ok"}`.

On first start the API creates its tables and loads the sample dataset.

Manual setup instead of the blueprint: root directory `apps/api`, build
`pip install -r requirements/cloud.txt`, start
`uvicorn app.main:app --host 0.0.0.0 --port $PORT`, env `APP_PROFILE=cloud`, `PYTHON_VERSION=3.12.7`.

## 3. Frontend (Vercel)

1. Import the repository. Set **Root Directory** to `apps/web`. The framework is detected.
2. Add the environment variable `NEXT_PUBLIC_API_URL=https://<service>.onrender.com` (no trailing slash).
3. Deploy, then make sure the resulting URL is in the API's `CORS_ORIGINS`.

`CORS_ORIGIN_REGEX=https://.*\.vercel\.app` is set in the blueprint so preview deployments work.
Remove it if you want only the production domain allowed.

## Environment reference

API (`apps/api/.env`):

| Variable | Default | Purpose |
|---|---|---|
| `APP_PROFILE` | `local` | `local` or `cloud` |
| `DATABASE_URL` | SQLite file | Postgres connection string |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins |
| `CORS_ORIGIN_REGEX` | — | Regex of allowed origins |
| `ADAPTION_API_KEY` | — | Enables Adaption API runs |
| `ANALYSIS_ENGINE` | profile | `auto`, `sklearn`, `lite` |
| `MAX_IMPORT_ROWS`, `MAX_UPLOAD_MB` | profile | Import limits |
| `BACKGROUND_SYNC` | profile | Server-side Adaption poller |
| `AUTO_SEED` | `true` | Load the sample into an empty database |

Web (`apps/web/.env.local`): `NEXT_PUBLIC_API_URL`.

## Known limits of this deployment

- **No sign-in.** The workspace is open to anyone with the URL, including the "Clear workspace"
  action in Settings. That is acceptable for a demo; add authentication before using real customer data.
- Shared report links are unguessable tokens, not access-controlled.
- Schema is created with `create_all`; there are no migrations yet.
- One API instance. The background poller (local profile) assumes a single process.

<!-- InsightFlow build iteration: commit 332 -->
