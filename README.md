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

### One-time setup

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env   # fill in ANTHROPIC_API_KEY and NASA_API_KEY
```

### Every session

Open a new terminal → activate the venv → run the backend:

```bash
source .venv/bin/activate
uvicorn backend.main:app --reload
# → http://localhost:8000/health
```

### Tests

```bash
pytest
```

### About the virtual environment

`.venv/` is a local Python virtual environment — interpreter plus installed packages, scoped to this repo. It is listed in `.gitignore` and never pushed. Two things worth knowing:

1. **It is per-machine and per-path.** If you move or rename this repo, the venv breaks (it hardcodes absolute paths in shebangs and activation scripts).
2. **Nothing in the repo depends on it existing.** The code, tests, and deployment manifests are what matters. Recreating the venv from `pyproject.toml` takes roughly two minutes.

If the venv ever misbehaves (moved repo, corrupted install, Python version change), just rebuild it:

```bash
rm -rf .venv
python3.12 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
```

## License

MIT — see [LICENSE](./LICENSE).
