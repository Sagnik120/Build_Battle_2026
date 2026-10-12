.PHONY: setup api web dev test lint build

setup: ## Install backend (full local profile) and frontend dependencies
	cd apps/api && python3 -m venv .venv && .venv/bin/pip install -r requirements/local.txt
	cd apps/api && [ -f .env ] || cp .env.example .env
	cd apps/web && pnpm install && ([ -f .env.local ] || cp .env.example .env.local)

api: ## Run the API on http://localhost:8787
	cd apps/api && .venv/bin/uvicorn app.main:app --reload --port 8787

web: ## Run the web app on http://localhost:3000
	cd apps/web && pnpm dev

dev: ## Run both
	$(MAKE) -j2 api web

test:
	cd apps/api && .venv/bin/python -m pytest -q

lint:
	cd apps/api && .venv/bin/ruff check app tests
	cd apps/web && pnpm lint && pnpm exec tsc --noEmit

build:
	cd apps/web && pnpm build

# InsightFlow build iteration: commit 333
