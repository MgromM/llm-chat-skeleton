# LLM Chat App

Czat oparty na Anthropic Claude z automatycznym trackingiem kosztu (usage
tokenów) i jakości odpowiedzi (LLM-as-judge).

## Struktura

- `backend/` — Express + PostgreSQL + `@anthropic-ai/sdk`, JWT auth, jeden MCP
  tool (BigQuery), system slash-komend, eksport xlsx.
- `frontend/` — Next.js 15 (App Router) + React 18 + TS, Tailwind CSS 3
  (`@tailwindcss/typography`), `lucide-react`, `react-markdown` + `remark-gfm`
  do renderowania odpowiedzi czatu, `swr` do fetchowania metryk w panelu
  admina.

## Uruchomienie lokalne

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run migrate
node src/db/seedAdmin.js admin@example.com haslo123
npm run dev
```

Wymaga lokalnego PostgreSQL (`DATABASE_URL` w `.env`) oraz klucza
`ANTHROPIC_API_KEY` (z `USE_LOCAL_SECRETS=true` czyta go wprost z `.env`,
zamiast z GCP Secret Manager).

### Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Frontend proxuje `/api/*` do backendu (domyślnie `:8080`, zmienna `BACKEND_URL`
w `.env.local`) — patrz `next.config.mjs` (`rewrites`).

## Dostępne slash-komendy w czacie

- `/pomoc` — lista komend (bypass, koszt = 0).
- `/koszt-dzisiaj` — dzienne podsumowanie kosztu (bypass, koszt = 0).
- `/analiza-bigquery <pytanie>` — pyta Claude z narzędziem BigQuery (continue → LLM).

## Deploy (docelowo, GCP)

Cloud Run (backend + frontend), Cloud SQL Postgres, sekrety w Secret Manager
(`ANTHROPIC_API_KEY`, `JWT_SECRET`, connection string).
