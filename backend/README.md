# servermend-backend

Plain JavaScript (ESM, no TypeScript) Node/Express/MongoDB API. Authenticates agent reports, runs the deterministic rules engine, and serves the dashboard read API. LLM remediation (B2) isn't built yet.

## Layout

```
backend/
├── src/
│   ├── app.js                    # Express app factory — see the mount-order comment before touching routing
│   ├── index.js                  # real entry point: connects Mongo, starts listening
│   ├── routes/                    # auth.js, servers.js (user-facing), reports.js (agent ingest)
│   ├── models/                     # Mongoose schemas: User, Server, Report, CheckDefinition
│   ├── services/
│   │   └── rulesEngine.js          # pure function: findings + CheckDefinition severities -> per-category + overall score
│   ├── middleware/
│   │   ├── agentAuth.js             # per-server API key (SHA-256 hash lookup)
│   │   ├── userAuth.js               # dashboard JWT
│   │   └── asyncHandler.js            # see "A bug worth knowing about" below
│   ├── data/checkCatalog.js            # all 60 check definitions — severity, rationale, fix commands
│   ├── scripts/seedCheckDefinitions.js  # upserts checkCatalog.js into MongoDB
│   └── config/env.js
├── test/                          # see Tests below
└── package.json
```

## Status

**B0 (foundations) and B1 (ingest + rules engine) are done.** B3 (dashboard read API) is done as part of the same pass — server list, findings, report history. B2 (LLM remediation layer) is not built.

## Auth model

- **Agents** authenticate with a per-server API key: `Authorization: Bearer <key>`. The key is stored as a SHA-256 hash (not bcrypt — API keys are high-entropy random tokens, not human passwords, so a fast hash with a unique index is the correct pattern; bcrypt's slow-hash property defends against brute-forcing *weak* secrets, which isn't the threat model here). Issued once via `POST /api/v1/servers`, shown exactly once in the response.
- **Dashboard users** authenticate with a JWT from `/api/v1/auth/login` or `/api/v1/auth/signup`.

## API

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/v1/auth/signup`, `/auth/login` | none | dashboard account creation / login |
| `POST /api/v1/servers` | user JWT | register a server, get back `{serverId, apiKey}` |
| `GET /api/v1/servers` | user JWT | list owned servers with latest score |
| `GET /api/v1/servers/:id`, `/servers/:id/reports`, `/servers/:id/findings` | user JWT | detail, report history, latest findings |
| `POST /api/v1/reports` | agent API key | ingest a report — the actual scoring entry point |

## Scoring

`services/rulesEngine.js` is a pure function (no DB access) that takes raw findings plus a `Map` of `CheckDefinition` lookups and returns per-category scores (each floors independently at 0, per the roadmap's decision — one collapsing global number couldn't distinguish "somewhat bad" from "catastrophic") and a simple-average overall. A finding whose `checkId` has no matching `CheckDefinition` (agent/backend version skew) is recorded as `scored: false` rather than guessing a severity.

## A bug worth knowing about

Two real bugs surfaced only once the integration tests ran against a real HTTP request → Express routing → MongoDB round trip (not caught by anything short of that):

1. **Router-mounting bug**: `servers.js` originally applied `router.use(requireUserAuth)` with no path filter. Since `authRouter`, `serversRouter`, and `reportsRouter` are all mounted at the same `/api/v1` prefix in `app.js`, Express tries each in registration order — and a path-unfiltered `router.use()` intercepts *every* request that reaches that router, including ones meant for a sibling router that just happens to share the prefix. `POST /api/v1/reports` was being swallowed by `serversRouter`'s blanket auth middleware and 401'd with a JWT-auth error message before Express ever checked whether `/reports` matched any route actually defined in `servers.js`. Fixed by applying auth per-route instead of via blanket `router.use()` — see the comments in `app.js` and `routes/servers.js`.
2. **Async-handler bug**: Express 4 (unlike 5) does not automatically catch a rejected promise from an async route handler — it just hangs the request forever instead of producing an error response. A Mongoose `ValidationError` inside `POST /reports` reproduced this exactly: the request hung until the test's own timeout fired. Fixed with a small local `asyncHandler` wrapper (`middleware/asyncHandler.js`) applied to every async handler — not a dependency, five lines.

Related: the `ScoredFinding` subschema originally marked `title`/`detail` as `required: true`. Mongoose's built-in `required` validator treats an empty string as "missing" (a well-known footgun) — so any finding with terse detail text threw a `ValidationError`. Fixed by dropping `required` from those two fields; `id`/`category`/`status` remain required since those actually need to always be present.

## Check catalog / seed data

`src/data/checkCatalog.js` holds all 60 check definitions (severity, rationale, fix commands, reference) as plain data — no DB dependency, so the rules engine and its tests can use it directly. **Its `checkId`/`category` values are verified to match the Go agent's actual output exactly** (`test/checkCatalog.test.js` asserts against a snapshot; see that file's header comment for the manual re-verification command whenever a check is added on either side — the backend's test suite has no Go toolchain to check this live).

Seed a running MongoDB with it:

```
npm run seed
```

## Local run

```
npm install
cp .env.example .env   # set JWT_SECRET, MONGO_URI
npm run seed
npm run dev
```

## Tests

```
npm test
```

35 tests across three files:
- `test/rulesEngine.test.js` — pure scoring logic, no DB
- `test/checkCatalog.test.js` — seed-data integrity + the agent-ID snapshot check, no DB
- `test/api.test.js` — full HTTP integration tests (signup/login, server creation, ownership isolation, report ingestion and scoring, unscored-checkId handling) against a real MongoDB via `mongodb-memory-server`, which downloads its own portable `mongod` binary on first use (no system-wide MongoDB or Docker install needed — confirmed working in a sandboxed dev environment with neither available)

`.github/workflows/backend-ci.yml` runs the full suite on `ubuntu-latest` on every push/PR touching `backend/**`.
