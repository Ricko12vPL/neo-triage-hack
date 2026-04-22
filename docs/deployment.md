# Deployment Guide

## Backend — Railway

### Prerequisites
- Railway account (railway.app)
- GitHub repo connected to Railway

### Steps

1. **New project** → Deploy from GitHub repo
2. Select `Ricko12vPL/neo-triage-hack`, branch `main`
3. Root directory: `/` (repo root)
4. **Start command:** `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
5. **Health check path:** `/health`

### Required environment variables (Railway → Variables tab)

| Variable | Value | Notes |
|----------|-------|-------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | **Secret** — set via Railway UI only |
| `NASA_API_KEY` | `...` | Optional |
| `ENVIRONMENT` | `production` | |
| `LOG_LEVEL` | `INFO` | |
| `CORS_ORIGINS` | `https://your-app.vercel.app` | Exact frontend URL |
| `DAILY_SPEND_CAP_USD` | `50` | Budget guard |

`PORT` is auto-provided by Railway — do not set it manually.

### Persistent data note

Railway's default filesystem is **ephemeral** — `data/agent_log.jsonl` and
`data/cost_ledger.json` reset on each redeploy. For the hackathon demo this is
acceptable (the live session accumulates evidence during the demo). A production
deployment would mount a Railway Volume at `/app/data`.

### Verification

```bash
curl https://<railway-url>.railway.app/health
# Expected: {"status":"ok","agent_running":true,"agent_cycle":N,...}
```

---

## Frontend — Vercel

### Prerequisites
- Vercel account (vercel.com)
- Railway backend URL confirmed working

### Steps

1. **Import** GitHub repo `Ricko12vPL/neo-triage-hack`
2. **Root directory:** `frontend/`
3. **Framework preset:** Vite
4. **Build command:** `npm run build`
5. **Output directory:** `dist`

### Required environment variables (Vercel → Settings → Environment Variables)

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://<railway-url>.railway.app` |
| `VITE_WS_URL` | `wss://<railway-url>.railway.app/ws/feed` |

### Verification checklist

- [ ] Vercel URL loads dashboard (no console errors)
- [ ] Candidates list populates from Railway backend
- [ ] Click candidate → briefing streams via SSE
- [ ] WebSocket `wss://` connects (status indicator turns green)
- [ ] YR4 Replay tab loads and timeline scrubs
- [ ] Alert generation at h+18 streams and never caches (NN-10)

---

## Rollback plan

| Failure | Backup |
|---------|--------|
| Railway deploy fails | Try Render.com — same start command |
| Vercel deploy fails | Netlify (build command: `npm run build`, publish: `dist`) |

---

## Local development (reference)

```bash
python3.12 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env  # fill in ANTHROPIC_API_KEY
uvicorn backend.main:app --reload
# → http://localhost:8000/health

cd frontend && npm install && npm run dev
# → http://localhost:5173
```
