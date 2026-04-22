# Project Timeline Transparency

## About the first commit

The repository's first commit (`chore: initial scaffold`, hash `14fb965`) was authored at
**2026-04-21 20:39 Warsaw (18:39 UTC)** — approximately **3h 51min before the hackathon
kickoff at 22:30 UTC (18:30 EDT)**.

### What that commit contains

```
 .gitignore         |  36 +++
 .env.example       |  12 ++
 LICENSE            |   1 +
 README.md          |  14 ++
 pyproject.toml     |  34 +++
 backend/__init__.py|   3 +
 backend/main.py    |  36 +++   ← /health endpoint stub, no domain logic
 tests/__init__.py  |   1 +
 tests/test_health.py|  14 ++   ← smoke test: assert status == "ok"
```

**9 files, 151 lines.** Pure infrastructure: dependency manifest, liveness probe,
standard boilerplate. Zero domain code — no NEO classification, no Claude integration,
no astronomy logic, no ranker, no agent.

### Why we're documenting this

The hackathon's "New Work Only" rule targets the substance of the project. All competitive
work — Bayesian ranker, Claude Opus 4.7 integration, Managed Agent loop, YR4 replay,
WebSocket feed, live alert generation — was authored during the event window
(post-kickoff April 21 22:30 UTC, Warsaw April 22 00:30).

We document this proactively because we value the judges' time and trust. Rather than
leave an open question, we acknowledge it transparently and provide the full context.

If this is viewed as a rule violation, we fully accept the judges' decision.
We would rather be transparent and possibly penalized than opaque and possibly rewarded.

### Verification

```bash
# See all commits with author dates
git log --all --format="%H | %ai | %s"

# Inspect the scaffold commit contents
git show 14fb965 --stat

# See the first domain-code commit (Claude integration)
git log --all --format="%H | %ai | %s" | grep briefing
```

Every piece of domain code is in commits dated **2026-04-22 07:02 Warsaw or later**,
well within the hackathon window.
