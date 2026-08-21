# servermend-backend

Plain JavaScript (ESM, no TypeScript) Node/Express/MongoDB API. Authenticates agent reports, runs the deterministic rules engine, serves the dashboard read API, and generates remediation guidance for failed findings.

## Layout

```
backend/
├── src/
│   ├── app.js                    # Express app factory — see the mount-order comment before touching routing
│   ├── index.js                  # real entry point: connects Mongo, starts listening
│   ├── routes/                    # auth.js, servers.js (user-facing + remediation), reports.js (agent ingest), baseline.js
│   ├── models/                     # Mongoose schemas: User, Server, Report, CheckDefinition, Baseline
│   ├── services/
│   │   ├── rulesEngine.js          # pure function: findings + CheckDefinition severities -> per-category + overall score
│   │   ├── baselineDiff.js          # pure function: confirmed vs. observed baseline -> per-field additions
│   │   ├── llm/remediationClient.js  # B2 — see "LLM remediation" below
│   │   └── alerting/                  # detectNewCriticalFailures.js, alertService.js, emailTransport.js — see "Alerting" below
│   ├── middleware/
│   │   ├── agentAuth.js             # per-server API key (SHA-256 hash lookup)
│   │   ├── userAuth.js               # dashboard JWT
│   │   ├── asyncHandler.js            # see "A bug worth knowing about" below
│   │   └── rateLimit.js               # in-memory fixed-window limiter, no dependency
│   ├── data/checkCatalog.js            # all 60 check definitions — severity, rationale, fix commands
│   ├── scripts/seedCheckDefinitions.js  # upserts checkCatalog.js into MongoDB
│   └── config/env.js
├── openapi.yaml                    # served at GET /api/v1/openapi.yaml
├── test/                          # see Tests below
└── package.json
```

## Status

**B0 (foundations), B1 (ingest + rules engine), B2 (LLM remediation), and B3 (dashboard read API) are all done.**

## LLM remediation (B2)

`POST /api/v1/servers/:id/findings/:checkId/remediation` generates a plain-language explanation and next step for one failed finding, on demand (not baked into `GET /findings` — an LLM call per failed finding on every dashboard load would be slow and, with a real key configured, wastefully expensive).

`services/llm/remediationClient.js` is pluggable by design:
- If `ANTHROPIC_API_KEY` is set, it calls `claude-haiku-4-5` via the official `@anthropic-ai/sdk`, grounded in the finding's detail plus the check's known rationale and fix command (so it isn't inventing anything not already on file) — response `source: "llm"`.
- If no key is set, or the LLM call fails or errors for any reason (network, rate limit, empty response), it falls back to a deterministic explanation built straight from `checkCatalog.js`'s rationale/fix/reference fields — response `source: "template"`.

The fallback isn't a stub: the endpoint always returns a real, usable explanation either way, and a live-key outage degrades quality, not availability. `test/remediationClient.test.js` and the `remediation endpoint` block in `test/api.test.js` exercise both branches (including a genuinely-thrown LLM error) via `_setClientForTesting()`, which swaps in a fake Anthropic client — no real API key or network access needed to test the fallback logic, and the actual no-key path is verified separately (see the module's default export behavior with `ANTHROPIC_API_KEY` unset).

## Baseline confirmation (server-side mirror of the agent's local baseline)

The agent's persistence checks (cron entries, `authorized_keys`, systemd units, SUID binaries) diff against a local file on the host — that never changes. This is a **separate, additive** server-side mirror: `models/Baseline.js` holds one `{confirmed, pending}` document per server, and the agent pushes what it currently observes on *every* run (not just capture runs) via `POST /servers/:id/baseline`.

- The first push for a server becomes `confirmed` outright, matching the agent's own "captured automatically on first run" rule.
- After that, a push containing something not in `confirmed` (an addition — removals are never flagged, matching `agent/baseline/baseline.go`'s `Diff` semantics exactly, via `services/baselineDiff.js`) is held as `pending` and does **not** get applied automatically.
- A user reviews `GET /servers/:id/baseline` (confirmed + pending + the diff) from the dashboard and explicitly promotes it with `POST /servers/:id/baseline/confirm`. That's the actual point of this: an SSH key that appears on a server now gets a human decision recorded centrally, instead of the only "yes this is fine" path being a local `--update-baseline` run on the box itself — which a compromised host could just as easily run on its own.

Verified against a real backend + the real Go agent binary (not just `mongodb-memory-server`): first run correctly became `confirmed`; a second identical run produced no false drift; and a manually-pushed addition correctly went `pending`, showed up on `GET`, and `POST /confirm` promoted it and cleared `pending`. `test/baselineDiff.test.js` (pure diff logic) and `test/baseline.route.test.js` (full HTTP integration, both the agent-facing push and the dashboard-facing read/confirm) cover it in CI.

## Alerting (email on a new critical finding)

`POST /reports` now also checks, on every ingest, whether the new report contains a critical finding that is `status: fail` and **wasn't already failing on the immediately-previous report** for that server (`services/alerting/detectNewCriticalFailures.js` — a pure transition detector, not "every critical fail every report": a persistently-failing critical check would otherwise re-alert on every single run and train the recipient to ignore it). A server's first-ever report counts every current critical failure as new, on the theory that the first report is exactly when an operator most needs to hear about them.

Two things happen for each newly-critical-and-failing finding, and they're deliberately decoupled:

1. **An `Alert` row is always written** (`models/Alert.js`) — this is the source of truth `GET /servers/:id/alerts` reads, and it exists regardless of whether email delivery succeeds.
2. **One email is attempted per triggering report** (not one per finding — three new criticals in one report is one inbox item, not three), to the owning user's account email, via `services/alerting/emailTransport.js`. If `SMTP_HOST` isn't set, or the send throws for any reason, the `Alert` row still gets written with `emailStatus: "skipped_no_smtp"` or `"failed"` (plus `emailError`) — the alert itself is never lost just because a mail server is unreachable. Real SMTP delivery uses `nodemailer`; the transport is swappable via `_setTransportForTesting()` the same way `remediationClient.js`'s Anthropic client is, so both the real-send and no-SMTP-configured paths are tested without a real mail server.

The whole alerting step is wrapped in try/catch inside `routes/reports.js` and can never fail the report ingestion request itself — same non-fatal, best-effort principle as the agent's baseline push.

Verified for real, not just via injected fakes: ran the actual `nodemailer.createTransport` path against an unreachable host (`ECONNREFUSED`, correctly caught and recorded as `"failed"`) and against no `SMTP_HOST` at all (`"skipped_no_smtp"`), then a full backend+MongoDB run through `POST /reports` → `Alert` created → `GET /alerts` → a second identical report correctly did **not** duplicate the alert. `test/detectNewCriticalFailures.test.js`, `test/emailTransport.test.js`, and the `alerting on new critical findings` block in `test/api.test.js` cover it in CI.

## Auth model

- **Agents** authenticate with a per-server API key: `Authorization: Bearer <key>`. The key is stored as a SHA-256 hash (not bcrypt — API keys are high-entropy random tokens, not human passwords, so a fast hash with a unique index is the correct pattern; bcrypt's slow-hash property defends against brute-forcing *weak* secrets, which isn't the threat model here). Issued once via `POST /api/v1/servers`, shown exactly once in the response.
- **Dashboard users** authenticate with a JWT from `/api/v1/auth/login` or `/api/v1/auth/signup`.

## API

Full machine-readable spec: `GET /api/v1/openapi.yaml` (served straight from `openapi.yaml` in this directory).

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/v1/auth/signup`, `/auth/login` | none | dashboard account creation / login |
| `POST /api/v1/servers` | user JWT | register a server, get back `{serverId, apiKey}` |
| `GET /api/v1/servers` | user JWT | list owned servers with latest score |
| `GET /api/v1/servers/:id`, `/servers/:id/reports`, `/servers/:id/findings` | user JWT | detail, report history, latest findings |
| `POST /api/v1/servers/:id/findings/:checkId/remediation` | user JWT | B2 — generate a remediation explanation for one failed finding |
| `POST /api/v1/servers/:id/baseline` | agent API key | agent pushes its observed persistence baseline (every run) |
| `GET /api/v1/servers/:id/baseline` | user JWT | current confirmed baseline + any pending drift |
| `POST /api/v1/servers/:id/baseline/confirm` | user JWT | promote pending drift to confirmed |
| `GET /api/v1/servers/:id/alerts` | user JWT | alert history — see "Alerting" below |
| `POST /api/v1/reports` | agent API key | ingest a report — the actual scoring entry point |

## Rate limiting

`middleware/rateLimit.js` is a small in-memory fixed-window limiter (no dependency) applied per-route, never via a blanket `router.use()` — see "A bug worth knowing about" for why that distinction matters on this codebase. Limits: 10 req/min per IP on auth routes, 30 req/min per server on report ingestion, 120 req/min per user on dashboard routes. Every response carries `X-RateLimit-Limit`/`-Remaining`/`-Reset`; a 429 additionally carries `Retry-After`. State resets automatically on a rolling window and is cleared between test runs via `_resetRateLimitState()` (needed because `supertest` requests share one IP, so tests would otherwise start tripping each other's budgets).

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

77 tests across eleven files:
- `test/rulesEngine.test.js` — pure scoring logic, no DB
- `test/checkCatalog.test.js` — seed-data integrity + the agent-ID snapshot check, no DB
- `test/baselineDiff.test.js` — pure baseline diff logic (additions-only, matches the Go agent's `Diff` semantics), no DB
- `test/detectNewCriticalFailures.test.js` — pure alert-transition logic: new vs. repeat vs. resolved-then-recurred critical failures, no DB
- `test/remediationClient.test.js` — B2 remediation client, both the template-fallback and LLM branches, via an injected fake Anthropic client — no DB, no real API key
- `test/emailTransport.test.js` — alert email sending, both the no-SMTP-configured and real-send-attempt branches, via an injected fake transport — no DB, no real mail server
- `test/rateLimit.test.js` — the fixed-window limiter in isolation: under/over limit, headers, per-key isolation, window reset
- `test/openapi.test.js` — confirms `GET /api/v1/openapi.yaml` serves the spec
- `test/seedScript.test.js` — regression test for a real Windows bug (see below): spawns `seedCheckDefinitions.js` as an actual subprocess against `mongodb-memory-server`, not just calling the exported function
- `test/api.test.js` — full HTTP integration tests (signup/login, server creation, ownership isolation, report ingestion and scoring, unscored-checkId handling, the B2 remediation endpoint, alerting on new critical findings) against a real MongoDB via `mongodb-memory-server`, which downloads its own portable `mongod` binary on first use (no system-wide MongoDB or Docker install needed — confirmed working in a sandboxed dev environment with neither available, and separately re-verified against a real persistent local `mongod` instance)
- `test/baseline.route.test.js` — full HTTP integration for the baseline sync/read/confirm flow: first-push-becomes-confirmed, drift held as pending, confirm promotes it, a resolved-drift push clears a stale pending, ownership isolation

`.github/workflows/backend-ci.yml` runs the full suite on `ubuntu-latest` on every push/PR touching `backend/**`.

## A second bug worth knowing about (Windows-specific)

`npm run seed` silently did nothing on Windows: the script's direct-execution guard compared `import.meta.url` against a hand-built `` `file://${process.argv[1]}` `` string, which isn't a valid `file://` URL from a Windows backslash path (`C:\...`) via naive concatenation. The guard evaluated `false`, `main()` never ran, and the process exited 0 with zero output — indistinguishable from success unless you already knew what "seeded 60 check definitions" was supposed to print. Fixed with `pathToFileURL(process.argv[1]).href`, which builds the URL the same way Node's own module loader does on any platform. This class of bug can only be caught by actually spawning the script as a subprocess (`test/seedScript.test.js`) — every other test in this suite calls `seedCheckDefinitions()` directly, which bypasses the broken guard entirely.
