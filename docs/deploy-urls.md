# Deployment URLs

Production deployment for the "Built with Opus 4.7" hackathon submission.

## Live URLs

- **Frontend (Vercel):** https://neo-triage-hack.vercel.app
- **Backend API (Railway):** https://neo-triage-backend-production.up.railway.app
- **Health check:** https://neo-triage-backend-production.up.railway.app/health

## Vercel

- **Project:** neo-triage-hack
- **Team:** kacper-s-projects-6495bf11 (Kacper's projects)
- **Framework:** Vite (auto-detected)
- **Deployment protection:** off (public)
- **Env vars (production):**
  - `VITE_API_BASE=https://neo-triage-backend-production.up.railway.app`
  - `VITE_WS_URL=wss://neo-triage-backend-production.up.railway.app/ws/feed`

## Railway

- **Project:** neo-triage-hack
- **Service:** neo-triage-backend
- **Region:** asia-southeast1 (default at deploy time)
- **Builder:** Nixpacks (python3.12 + gcc)
- **Start command:** `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
- **Health path:** `/health`
- **Env vars:**
  - `ANTHROPIC_API_KEY` (secret)
  - `ENVIRONMENT=production`
  - `CORS_ORIGINS=*` (dev-permissive; tighten post-demo if abuse observed)
  - `PYTHONUNBUFFERED=1`

## Post-deploy smoke test (verified 2026-04-23)

- `GET /health` → `{status: "ok", agent_running: true}`
- `GET /api/rank/` → 10 ranked candidates with full prediction payload
- `GET /api/replay/yr4` → 7 YR4 milestones
- `GET /api/agent/status` → running, cycle incrementing
- `GET /api/cost/` → session cost tracked
- Frontend shell renders (200)

## Known limitations on production instance

- Railway agent cycle count starts fresh per deploy (ephemeral FS). Local dev agent holds cumulative evidence across redeploys — see `data/agent_log.jsonl`.
- CORS temporarily wide open (`*`); no known abuse vector during hackathon window.
