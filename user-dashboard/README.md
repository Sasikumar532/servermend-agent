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
    ├── main.jsx             # imports @fontsource/inter before index.css
    ├── App.jsx               # routes
    ├── index.css              # design tokens + all styling — see docs/design-system.md
    ├── auth/
    │   ├── AuthContext.jsx     # token + email state, login/signup/logout
    │   └── tokenStore.js        # localStorage-backed, read synchronously by api/client.js
    ├── api/
    │   ├── client.js             # fetch wrapper: base URL, auth header, JSON + error handling
    │   ├── auth.js                 # signup/login
    │   └── servers.js               # servers/reports/findings/baseline/alerts/remediation
    ├── components/
    │   ├── SeverityPill.jsx          # critical/high/medium/low/info badge
    │   ├── ScoreBars.jsx               # overall ring + per-category bars
    │   ├── FindingsTable.jsx            # sortable-by-status table, on-demand remediation
    │   ├── PasswordField.jsx             # password input with show/hide eye-icon toggle
    │   ├── Modal.jsx                      # generic dialog: overlay, Esc-to-close, body scroll lock
    │   ├── AddServerModal.jsx              # register a server; one-time API key reveal
    │   ├── ProtectedRoute.jsx                # redirects to /login when signed out
    │   └── Layout.jsx                         # sidebar nav + signed-in-as + logout, wraps authenticated pages
    └── pages/
        ├── LoginPage.jsx, SignupPage.jsx
        ├── ServerListPage.jsx                  # GET /servers, opens AddServerModal
        ├── ServerDetailPage.jsx                 # score, findings + remediation, baseline drift review, alerts
        └── ServerReportsPage.jsx                 # GET /servers/:id/reports — score-over-time history
```

## Status

**D0 implemented**: auth (login/signup, JWT persisted in localStorage), a sidebar-navigated shell, server list with a modal registration flow (one-time API key reveal, matching the backend's own can't-retrieve-it-again design), server detail (score breakdown, findings table with on-demand remediation, baseline drift review with confirm, recent alerts), and per-server report history. This covers everything the README originally scoped for D0–D3 except the admin-only pieces (account management, `CheckDefinition` editing — those belong in admin-dashboard).

Every page talks to the real backend routes documented in `backend/openapi.yaml` — `api/servers.js`'s functions map 1:1 to that spec. `npm run build` (a real Vite + esbuild bundle, no TypeScript compile step) and `npm run lint` both pass clean.

Registering a server was originally its own route/page (`/servers/new`); it's now a modal opened from the Servers page instead — a one-off, short-lived action doesn't need its own URL and back-button history entry.

**Not yet exhaustively verified in a real browser** — built and validated primarily via `npm run build`/`npm run lint`/dev-server-boots-and-serves-HTML, since no browser automation tool is available in the environment this was built in. The core auth → server list → server detail flow, the dark theme, and the CORS fix (see `backend/src/middleware/cors.js`) have been confirmed working by hand in an actual browser; the newer additions (add-server modal, report history page) have not yet been clicked through.

## Design system

Colors, typography, layout, and component conventions are documented in [`../docs/design-system.md`](../docs/design-system.md), with the canonical token values in [`../shared/design-tokens.css`](../shared/design-tokens.css). `admin-dashboard` is expected to copy the same `:root` token block and reuse the same component patterns (severity pills, score bars, table conventions, the sidebar shell, the modal pattern) rather than inventing its own — see that doc's "Applying this to admin-dashboard" section.

## Local run

```
npm install
cp .env.example .env   # set VITE_API_BASE_URL if the backend isn't on localhost:4000
npm run dev
```

Requires the backend running (`cd ../backend && npm run dev`) and seeded (`npm run seed`), with `CORS_ORIGINS` either left unset (defaults to allowing any `localhost`/`127.0.0.1` origin — see `backend/src/middleware/cors.js`) or including this dashboard's dev origin explicitly. Sign up from the dashboard's `/signup` page, then use the "Add server" button on the Servers page and run the agent against the returned API key to have something to look at.

## Lint / build

```
npm run lint    # eslint . — flat config, eslint-plugin-react + react-hooks + react-refresh
npm run build   # vite build
```
