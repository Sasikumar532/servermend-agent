# servermend-user-dashboard

React app for end customers: dashboard, server list, score breakdown by category, findings, drift-review queue, remediation detail, profile. Plain JavaScript/JSX (no TypeScript) — matches the backend's own convention. Plain React + Tailwind CSS v4 — no component library; matches the "ServerMend User App" design (imported from claude.ai/design) value-for-value via a handful of small local primitives — see `docs/design-system.md` for the full component-usage reference.

## Layout

```
user-dashboard/
├── index.html                 # blocking inline script applies a stored theme before first paint
├── vite.config.js             # react() + tailwindcss() (@tailwindcss/vite) plugins
├── eslint.config.js
├── .env.example                 # VITE_API_BASE_URL
└── src/
    ├── main.jsx                  # imports @fontsource/inter + @fontsource/jetbrains-mono before index.css
    ├── App.jsx                    # routes, ToastProvider/AuthProvider/ThemeToggle at the root
    ├── index.css                   # @import "tailwindcss"; + @theme token mapping + color palette
    ├── auth/
    │   ├── AuthContext.jsx            # token + email state, login/signup/logout, syncEmail backfill
    │   └── tokenStore.js                # localStorage-backed, read synchronously by api/client.js
    ├── api/
    │   ├── client.js                      # fetch wrapper: base URL, auth header, JSON + error handling
    │   ├── auth.js                          # signup/login
    │   ├── me.js                              # GET/PATCH /me (profile fields)
    │   ├── dashboard.js                        # GET /dashboard/summary (fleet-wide aggregate)
    │   └── servers.js                            # servers/reports/findings/baseline/alerts/remediation
    ├── components/
    │   ├── Button.jsx                            # plain <button>, variant/size classes
    │   ├── Card.jsx                                # Card.Header/Title/Description/Content/Footer
    │   ├── Field.jsx                                 # Field (label wrapper) + TextInput
    │   ├── Modal.jsx                                   # fixed-overlay dialog, click-outside/Escape close
    │   ├── Tabs.jsx                                      # underline tab bar; panels rendered by the parent
    │   ├── SeverityPill.jsx                                # local SEV lookup table, colored/labeled pill
    │   ├── ScoreBars.jsx                                     # overall ring + per-category bars
    │   ├── FindingsTable.jsx                                   # plain <table>, expand-in-place remediation row
    │   ├── PasswordField.jsx                                     # Field/TextInput + custom show/hide toggle
    │   ├── CopyButton.jsx                                          # plain <button>, clipboard copy + "Copied" feedback
    │   ├── TerminalBlock.jsx                                         # terminal-styled command block for install commands
    │   ├── Toast.jsx                                                   # ToastProvider/useToast, custom (not a library)
    │   ├── ThemeToggle.jsx                                               # light/dark/system switch, own useTheme() hook
    │   ├── AddServerModal.jsx                                              # register a server, one-time API key reveal
    │   ├── ProtectedRoute.jsx                                                # redirects to /login when signed out
    │   └── Layout.jsx                                                         # fixed sidebar shell + collapsible nav
    └── pages/
        ├── LoginPage.jsx, SignupPage.jsx                                        # auth forms
        ├── DashboardPage.jsx                                                     # GET /dashboard/summary
        ├── ServerListPage.jsx                                                     # GET /servers, opens AddServerModal
        ├── ServerDetailPage.jsx                                                    # tabbed: Overview/Findings/Reports/Baseline/Settings
        └── ProfilePage.jsx                                                          # GET/PATCH /me
```

## Status

**D0 implemented**: auth (login/signup, JWT persisted in localStorage), a fixed sidebar-navigated shell, a fleet-wide dashboard, server list with a modal registration flow (one-time API key reveal, matching the backend's own can't-retrieve-it-again design), tabbed server detail (score breakdown, findings table with on-demand remediation, report history, full baseline review with confirm, rename/remove-server settings, recent alerts), and profile editing. This covers everything the README originally scoped for D0–D3 except the admin-only pieces (account management, `CheckDefinition` editing — those belong in admin-dashboard).

Every page talks to the real backend routes documented in `backend/openapi.yaml` — `api/servers.js`/`api/dashboard.js`/`api/me.js`'s functions map 1:1 to that spec. Nothing on any page shows placeholder/mock data — features from the source design with no backing endpoint yet (fleet-wide findings inbox, compliance, integrations, custom checks, team, billing, API keys — all marked `future: true` in the design's own source) are simply not built rather than faked.

`npm run build` (a real Vite + esbuild + Tailwind bundle) and `npm run lint` both pass clean — but **this has not yet been visually confirmed in a browser by an agent**, only built/linted (the environment this was built in can't reach the Windows-native Vite dev server from its own shell to even smoke-test HTML serving — a known networking quirk, not a code issue). Load it against a running backend and click all the way through before considering any change here done.

Registering a server is a modal (`AddServerModal`) opened from the Servers page, not a separate routed page — a one-off, short-lived action doesn't need its own URL and back-button history entry.

## Design system

Colors, typography, layout, and component conventions — the small local primitives to reach for, and the couple of documented exceptions (e.g. `FindingsTable` staying a plain `<table>`) — are in [`../docs/design-system.md`](../docs/design-system.md), with the canonical token values in [`../shared/design-tokens.css`](../shared/design-tokens.css). `admin-dashboard` is expected to reuse the same tokens and component primitives rather than inventing its own — see that doc's "Applying this to admin-dashboard" section.

## Local run

```
npm install
cp .env.example .env   # set VITE_API_BASE_URL if the backend isn't on localhost:4000
npm run dev
```

Requires the backend running (`cd ../backend && npm run dev`) and seeded (`npm run seed`), with `CORS_ORIGINS` either left unset (defaults to allowing any `localhost`/`127.0.0.1` origin — see `backend/src/middleware/cors.js`) or including this dashboard's dev origin explicitly. Sign up from the dashboard's `/signup` page, then use the "Add server" button on the Servers page and run the agent against the returned API key to have something to look at — or run `backend/src/scripts/seedDemoData.js` for a populated fleet without a real agent (see its own comment header).

## Lint / build

```
npm run lint    # eslint . — flat config, eslint-plugin-react + react-hooks + react-refresh
npm run build   # vite build — includes the Tailwind v4 CSS build via @tailwindcss/vite
```
