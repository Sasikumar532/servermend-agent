# servermend-admin-dashboard

React app for internal use: user/account management, per-server support view, and tuning `CheckDefinition` records (severity, rationale, fix commands) without shipping a new agent release.

## Layout

```
admin-dashboard/
├── src/
│   ├── pages/        # accounts, servers, check-definition editor
│   ├── components/
│   └── api/            # backend API client (elevated-scope endpoints)
└── package.json
```

## Status

Scaffold only — not covered by the current roadmap's D0–D3 milestones (those are user-dashboard). Sequence this after the user dashboard ships, once `CheckDefinition` editing is needed operationally.

## Local run (once implemented)

```
npm install
npm run dev
```
