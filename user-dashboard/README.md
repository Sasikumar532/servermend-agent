# servermend-user-dashboard

React app for end customers: server list, score breakdown by category, findings, drift-review queue, remediation detail. Plain JavaScript/JSX (no TypeScript) — matches the backend's own convention.

## Layout

```
user-dashboard/
├── index.html
├── vite.config.js
├── eslint.config.js
├── .env.example          # VITE_API_BASE_URL
└── src/
    ├── main.jsx
    ├── App.jsx             # routes
    ├── index.css            # design tokens + all styling — see docs/design-system.md
    ├── auth/
    │   ├── AuthContext.jsx   # token state, login/signup/logout
    │   └── tokenStore.js      # localStorage-backed, read synchronously by api/client.js
    ├── api/
    │   ├── client.js           # fetch wrapper: base URL, auth header, JSON + error handling
    │   ├── auth.js               # signup/login
    │   └── servers.js             # servers/findings/baseline/alerts/remediation
    ├── components/
    │   ├── SeverityPill.jsx        # critical/high/medium/low/info badge
    │   ├── ScoreBars.jsx            # overall ring + per-category bars
    │   ├── FindingsTable.jsx         # sortable-by-status table, on-demand remediation
    │   ├── PasswordField.jsx          # password input with show/hide eye-icon toggle
    │   ├── ProtectedRoute.jsx           # redirects to /login when signed out
    │   └── Layout.jsx                    # header + logout, wraps authenticated pages
    └── pages/
        ├── LoginPage.jsx, SignupPage.jsx
        ├── ServerListPage.jsx           # GET /servers
        └── ServerDetailPage.jsx          # score, findings + remediation, baseline drift review, alerts
```

## Status

**D0 implemented**: auth (login/signup, JWT persisted in localStorage), server list, and server detail — score breakdown by category, findings table with on-demand remediation (calls the backend's B2 endpoint per finding, not baked into the page load), baseline drift review (shows pending drift and lets a user confirm it), and recent alerts. This covers everything the README originally scoped for D0–D3 except the admin-only pieces (account management, `CheckDefinition` editing — those belong in admin-dashboard).

Every page talks to the real backend routes documented in `backend/openapi.yaml` — `api/servers.js`'s functions map 1:1 to that spec. `npm run build` (a real Vite + esbuild bundle, no TypeScript compile step) and `npm run lint` both pass clean.

**Not yet verified in a real browser** — this was built and validated via `npm run build`/`npm run lint`/dev-server-boots-and-serves-HTML, not by clicking through it, since no browser automation tool was available in the environment it was built in. Load it against a running backend and click through login → server list → server detail (including expanding a failing finding's remediation and, if you have a server with pending baseline drift, the confirm flow) before considering it done.

## Design system

Colors, typography, layout, and component conventions are documented in [`../docs/design-system.md`](../docs/design-system.md), with the canonical token values in [`../shared/design-tokens.css`](../shared/design-tokens.css). `admin-dashboard` is expected to copy the same `:root` token block and reuse the same component patterns (severity pills, score bars, table conventions) rather than inventing its own — see that doc's "Applying this to admin-dashboard" section.

## Local run

```
npm install
cp .env.example .env   # set VITE_API_BASE_URL if the backend isn't on localhost:4000
npm run dev
```

Requires the backend running (`cd ../backend && npm run dev`) and seeded (`npm run seed`) — sign up from the dashboard's `/signup` page, then register a server and run the agent against it (or `POST /api/v1/servers` directly) to have something to look at.

## Lint / build

```
npm run lint    # eslint . — flat config, eslint-plugin-react + react-hooks + react-refresh
npm run build   # vite build
```
