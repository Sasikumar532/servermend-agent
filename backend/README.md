# servermend-backend

Node/Express/MongoDB API. Authenticates agent reports, runs the deterministic rules engine, generates LLM remediation copy, and serves both dashboards.

## Layout

```
backend/
├── src/
│   ├── routes/                # POST /reports (agent ingest), GET /servers, /findings, ...
│   ├── models/                 # Mongoose schemas: Server, Report, CheckDefinition
│   ├── services/
│   │   ├── rules-engine/        # findings + severities -> per-category + overall score
│   │   └── llm/                  # plain-English remediation context (never generates fix commands)
│   ├── middleware/              # agent API-key auth, dashboard session/JWT auth
│   ├── config/
│   └── index.ts
├── package.json
└── tsconfig.json
```

## Status

Scaffold only — see the development roadmap for the milestone build order (B0–B3).

## Local run (once implemented)

```
npm install
npm run dev
```
