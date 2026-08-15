# ServerMend

A security-audit platform for self-hosted servers (Coolify/Dokploy-style deployments): a read-only Go agent that runs checks against a host, a backend that scores findings and generates plain-English remediation, and two dashboards for viewing results.

## Layout

```
servermend-agent/
├── agent/              # Go audit agent — collects raw findings, no scoring logic
├── backend/             # Node/Express/MongoDB — ingest API, rules engine, LLM remediation layer
├── user-dashboard/       # React — customer-facing: server scores, findings, remediation
├── admin-dashboard/      # React — internal: account/server management, check-definition tuning
├── docs/                 # Reference specs (check catalog, playbook)
└── ServerMend_Check_Catalog_and_System_Spec.docx
```

Each subfolder has its own README with build/run instructions and maps to a track in the development roadmap.

## Design principles

- The agent is read-only and never auto-executes remediation without explicit opt-in.
- All scoring and AI logic lives server-side — the agent stays "dumb and safe," only collecting and reporting.
- Check definitions (id, severity, rationale, fix command, reference) are versioned in the backend, separate from the agent binary, so severity/copy can be tuned without shipping a new agent release.
