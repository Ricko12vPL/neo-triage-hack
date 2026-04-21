# neo-triage

> Bayesian Near-Earth Object follow-up prioritization, with Claude Opus 4.7 as the astronomy reasoning engine.

**Built during the [Built with Opus 4.7](https://cerebralvalley.ai/events/~/e/built-with-4-7-hackathon) hackathon** — Anthropic × Cerebral Valley, 21–28 April 2026.

When the Vera C. Rubin Observatory enters full operations, it will flood the planetary-defense community with roughly eight times more asteroid follow-up candidates than today — most of them false alarms. `neo-triage` helps observers decide, in real time, which candidates are worth the telescope time, with Claude 4.7 writing the briefings.

## Team

- Kacper Saks
- Paweł Kulak

## Status

🚧 In active development — hackathon week.

## Stack

- **Backend:** Python 3.12 + FastAPI + scikit-learn + Anthropic SDK
- **Frontend:** Next.js 14 + Tailwind + shadcn/ui *(Paweł — landing soon)*
- **Orchestration:** Claude Managed Agents (Opus 4.7)
- **Data:** Polars + SQLite

## Running locally

```bash
# Backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env  # fill in ANTHROPIC_API_KEY and NASA_API_KEY

uvicorn backend.main:app --reload
# → http://localhost:8000/health
```

## License

MIT — see [LICENSE](./LICENSE).
