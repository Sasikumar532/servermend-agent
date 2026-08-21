# servermend-user-dashboard

React app for end customers: server list, score breakdown by category, findings, drift-review queue, remediation detail. Plain JavaScript/JSX (no TypeScript) — matches the backend's own convention. Built on [HeroUI](https://www.heroui.com) v3 (React 19 + Tailwind CSS v4) rather than hand-rolled CSS — see `docs/design-system.md` for the full component-usage reference.

## Layout

```
user-dashboard/
├── index.html               # <html class="dark"> — HeroUI's dark-mode trigger
├── vite.config.js             # react() + tailwindcss() (@tailwindcss/vite) plugins
├── eslint.config.js
├── .env.example                 # VITE_API_BASE_URL
└── src/
    ├── main.jsx                  # imports @fontsource/inter before index.css
    ├── App.jsx                    # routes
    ├── index.css                   # @import "tailwindcss"; @import "@heroui/styles"; + brand accent override
    ├── lib/
    │   └── severity.js               # severity -> Chip {color, variant} mapping, shared by SeverityPill + alert list
    ├── auth/
    │   ├── AuthContext.jsx            # token + email state, login/signup/logout
    │   └── tokenStore.js                # localStorage-backed, read synchronously by api/client.js
    ├── api/
    │   ├── client.js                      # fetch wrapper: base URL, auth header, JSON + error handling
    │   ├── auth.js                          # signup/login
    │   └── servers.js                        # servers/reports/findings/baseline/alerts/remediation
    ├── components/
    │   ├── SeverityPill.jsx                    # HeroUI Chip, colored/labeled per lib/severity.js
    │   ├── ScoreBars.jsx                         # overall ring + per-category bars (custom — no HeroUI progress-ring)
    │   ├── FindingsTable.jsx                      # plain <table>, not HeroUI's Table — see docs/design-system.md
    │   ├── PasswordField.jsx                       # HeroUI TextField/Input + custom show/hide toggle overlay
    │   ├── CopyButton.jsx                           # plain <button>, clipboard copy + "Copied" feedback
    │   ├── AddServerModal.jsx                        # HeroUI Modal; register a server, one-time API key reveal
    │   ├── ProtectedRoute.jsx                          # redirects to /login when signed out
    │   └── Layout.jsx                                   # sidebar shell (HeroUI Button for logout, plain NavLink for nav)
    └── pages/
        ├── LoginPage.jsx, SignupPage.jsx                  # HeroUI TextField/Input/Button
        ├── ServerListPage.jsx                              # HeroUI Table; GET /servers, opens AddServerModal
        ├── ServerDetailPage.jsx                             # HeroUI Card sections: score, findings, baseline drift, alerts
        └── ServerReportsPage.jsx                             # HeroUI Table; GET /servers/:id/reports
```

## Status

**D0 implemented**: auth (login/signup, JWT persisted in localStorage), a sidebar-navigated shell, server list with a modal registration flow (one-time API key reveal, matching the backend's own can't-retrieve-it-again design), server detail (score breakdown, findings table with on-demand remediation, baseline drift review with confirm, recent alerts), and per-server report history. This covers everything the README originally scoped for D0–D3 except the admin-only pieces (account management, `CheckDefinition` editing — those belong in admin-dashboard).

Every page talks to the real backend routes documented in `backend/openapi.yaml` — `api/servers.js`'s functions map 1:1 to that spec.

**Migrated from a hand-rolled CSS design system to HeroUI v3 + Tailwind v4** (React bumped `^18` → `^19`, a HeroUI v3 requirement). `npm run build` (a real Vite + esbuild + Tailwind bundle) and `npm run lint` both pass clean, and every HeroUI compound-component path used here (`Table.*`, `Modal.*`, `Card.*`, `TextField`+`Label`+`Input`) was cross-checked against the installed package's own `.d.ts` declarations, not just its docs site — but **this migration has not yet been visually confirmed in a browser**, only built/linted (the environment this was built in can't reach the Windows-native Vite dev server from its own shell to even smoke-test HTML serving — a known networking quirk, not a code issue). Load it against a running backend and click all the way through — including the parts already confirmed working on the pre-migration version (auth, CORS) — before considering the migration done.

Registering a server is a modal (`AddServerModal`) opened from the Servers page, not a separate routed page — a one-off, short-lived action doesn't need its own URL and back-button history entry.

## Design system

Colors, typography, layout, and component conventions — including which HeroUI component to reach for and the couple of documented exceptions that stay custom — are in [`../docs/design-system.md`](../docs/design-system.md), with the one deliberate brand override (a custom accent color layered on HeroUI's own palette) in [`../shared/design-tokens.css`](../shared/design-tokens.css). `admin-dashboard` is expected to run the same HeroUI/Tailwind setup and reuse the same component patterns rather than inventing its own — see that doc's "Applying this to admin-dashboard" section.

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
npm run build   # vite build — includes the Tailwind v4 CSS build via @tailwindcss/vite
```
