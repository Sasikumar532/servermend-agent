# ServerMend design system

Shared visual language for `user-dashboard` and `admin-dashboard`. Both are
information-dense operational UIs (security findings, scores, account/server
management) — not marketing pages — so the system optimizes for scannability
and semantic clarity over decoration.

Matches the **"ServerMend User App" design** (imported from
claude.ai/design) value-for-value: same color tokens, same radii/spacing,
same component shapes. It is **not** built on a component library — plain
React + Tailwind CSS v4, styled directly to reproduce the design's own
(hand-authored, inline-styled) markup. This is a deliberate reversal of an
earlier HeroUI-based iteration of this system: HeroUI's own component
shapes (focus rings, shadows, built-in paddings) kept showing through and
fighting pixel-fidelity to the design, so the library was dropped in favor
of a handful of small local primitives (`Button`, `Card`, `Field`/
`TextInput`, `Modal`, `Tabs`, `SeverityPill`) that reproduce the design's
exact values.

## Setup (required in every dashboard)

```bash
npm i -D tailwindcss @tailwindcss/vite
```

`vite.config.js` — register the Tailwind Vite plugin:

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

`src/index.css` — Tailwind, then this app's own `@theme` token mapping and
palette (paste the contents of
[`shared/design-tokens.css`](../shared/design-tokens.css) — no shared
build tooling between the two independently-deployed apps to import it
directly, same manual-mirror pattern used elsewhere in this repo, e.g.
`backend/openapi.yaml` vs. the Go agent's structs):

```css
@import "tailwindcss";

@theme {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-surface: var(--surface);
  --color-overlay: var(--overlay);
  --color-default: var(--default);
  --color-muted: var(--muted);
  --color-border: var(--border);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-fg);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-danger: var(--danger);
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}

/* then shared/design-tokens.css's :root and .dark/[data-theme="dark"] blocks */
```

This `--color-x: var(--x)` indirection is what makes `bg-surface`,
`text-muted`, `border-border`, etc. work as Tailwind utilities while the
underlying `--surface`/`--muted`/`--border` values stay swappable per theme
— redefine the raw variable, not the utility.

No Provider, no framework-level setup beyond this — every component below
is a plain function exporting plain JSX.

## Color tokens

| Utility | Role |
|---|---|
| `bg-background` / `text-foreground` | Page background / primary text |
| `bg-surface` | Card/panel background |
| `bg-overlay` | Modal backdrop content well, code blocks |
| `bg-default` | Neutral surface — hover states, tracks, subtle fills |
| `text-muted` | Secondary/meta text |
| `border-border` | Hairline borders, table rules |
| `bg-accent` / `text-accent-foreground` | Brand color — buttons, links, focus |
| `bg-success` / `text-success` | Good/pass status |
| `bg-warning` / `text-warning` | Caution/medium status |
| `bg-danger` / `text-danger` | Bad/critical status |

Exact values — see [`shared/design-tokens.css`](../shared/design-tokens.css)
for the canonical copy:

| Token | Light | Dark |
|---|---|---|
| `--background` | `#ffffff` | `#0a0a0a` |
| `--foreground` | `#11181c` | `#e4e4e4` |
| `--surface` | `#ffffff` | `#1a1c1f` |
| `--overlay` | `#ffffff` | `#050505` |
| `--default` | `#f4f4f5` | `#232629` |
| `--muted` | `#71717a` | `#7d8280` |
| `--border` | `#e4e4e7` | `#2d3033` |
| `--accent` | `#ffb454` | `#ffb454` |
| `--accent-fg` | `#0e1116` | `#0a0a0a` |

`--success`/`--warning`/`--danger` (`#17c964`/`#f5a524`/`#f31260`) are
**theme-invariant** — same hex in both themes, matching the source design
exactly (its light-mode override never redefines them either).

### Finding severity scale

The backend reports four severity levels (critical/high/medium/low) plus
"no severity." `SeverityPill` (`src/components/SeverityPill.jsx`) is the
single source of truth — a local `SEV` lookup table matching the design's
own `SEV` object exactly:

| Severity | Background | Foreground |
|---|---|---|
| critical | `var(--danger)` (solid) | `#fff` |
| high | `rgba(243,18,96,.14)` | `var(--danger)` |
| medium | `var(--warning)` (solid) | `#1a1200` |
| low | `var(--default)` | `var(--muted)` |
| *(null)* | `rgba(255,180,84,.14)` | `var(--accent)` — labeled "Info" |

Critical/high share a hue, distinguished by fill weight (solid vs. a soft
14%-alpha tint) rather than inventing a fifth color. **Never rely on color
alone** — `SeverityPill` always renders the text label alongside the color;
this matters for colorblind users and for anyone glancing at a printed or
screenshotted view.

## Typography

Two self-hosted (not Google Fonts `<link>`) typefaces, imported once in
`main.jsx` before `index.css` so the app has no external runtime
dependency for either:

```js
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
```

- **Inter** — body text, set via `body { font-family: "Inter", ui-sans-serif, system-ui, sans-serif; }`.
- **JetBrains Mono** — everything using the `font-mono` utility (server
  IDs, API keys, check IDs, baseline entries, fix commands) — registered
  as Tailwind's `--font-mono` theme variable in `index.css`, not a
  one-off className, so every existing `font-mono` usage picked it up
  automatically.

admin-dashboard should install both packages and import the same weight
files rather than linking a CDN font.

## Layout conventions

- **Sidebar shell** (`Layout`) — a `bg-surface` sidebar (brand + collapse
  toggle at top, nav links, signed-in-as-email + log out pinned to the
  bottom via `mt-auto`) beside a full-width main content area (no
  `max-width` cap — content fills the space beside the sidebar). The whole
  authenticated app lives inside this shell (`ProtectedRoute` → `Layout` →
  page `Outlet`); only `/login` and `/signup` render outside it. Main
  content uses `pt-20` (not the usual `py-6` top value) specifically to
  clear the fixed `ThemeToggle` sitting top-right — a smaller top padding
  lets page-header content (e.g. "Add server") collide with it.
- **The sidebar is `fixed`, not a normal flex sibling** — `<aside>` is
  `fixed inset-y-0 left-0`, and `<main>` carries a matching `ml-56`/`ml-16`
  (synced to the same `collapsed` state) instead of relying on flexbox to
  keep them side by side. A tall page (Profile, a long findings list)
  would otherwise scroll the whole document — sidebar included — since
  the sidebar shared one normal-flow container with `<main>`; `fixed`
  pins it to the viewport regardless of how far the page scrolls.
- **Sidebar collapse** — toggles between `w-56` (full: icon + label) and
  `w-16` (icon-only, `title` attribute standing in for the hidden label)
  via a `transition-[width]` class and a plain state boolean persisted to
  `localStorage` (`servermend_sidebar_collapsed`) so it doesn't reset on
  every page load. Every nav item — and any future one — needs an icon
  precisely because of this: collapsed mode has nothing else to show.
  Icons are inline SVG (`DashboardIcon`, `FindingsIcon`, `ServerIcon`,
  `ProfileIcon`, `PanelToggleIcon`, `LogoutIcon` in `Layout.jsx`), matching
  every other icon in this app — no icon library anywhere in the project.
- **Nav badges** — a nav item can carry a `badgeKey` (see `NAV_ITEMS` in
  `Layout.jsx`); `Layout` fetches the count for any item that declares one
  once on mount (currently just Findings, via `listFleetFindings().length`)
  and renders it as a small `bg-danger` pill next to the label. Deliberately
  a real count from a real endpoint, not a static/decorative badge — if a
  future nav item's count isn't cheap to compute on every page load,
  don't wire it through this path.
- **The sidebar stays dark regardless of the app-wide theme** — it has its
  own `dark` class applied directly on the `<aside>`, not just relying on
  `<html>`'s `data-theme`. Tokens are defined under
  `.dark,[data-theme=dark] { --surface: ...; ... }` in `index.css`, and
  CSS custom properties resolve by DOM proximity — the *nearest* matching
  ancestor (or the element itself) wins — so a `.dark`-classed element
  nested inside a light-mode tree correctly scopes dark values to just
  that subtree without touching anything outside it.
- **Navigation uses plain react-router `NavLink`/`Link`**, styled with
  Tailwind — `NavLink`'s `isActive` callback is exactly what an
  active-nav-item highlight needs.
- **Sections are `Card`** (`Card.Header` → `Card.Title` [+
  `Card.Description`], `Card.Content`, optional `Card.Footer`) — one
  `Card` per logical grouping (a score panel, a findings table, an alert
  list). Radius `rounded-xl` (12px), padding `p-5` (20px) on `Card.Content`
  — both match the design's own values exactly.
- Flat, no custom shadows — depth comes from the `background`/`surface`/
  `default` step sequence, not elevation.

## Component patterns

Small local primitives in `src/components/`, styled to match the design
directly — reuse these rather than reaching for a component library or
inventing new markup when admin-dashboard needs the same kind of
information.

- **`Button`** (`Button.jsx`) — plain `<button>`. `variant`: `primary |
  outline | ghost | danger | danger-solid`; `size`: `sm | md`. Click
  handler is the native `onClick`, disabled state is the native
  `disabled` — no `onPress`/`isDisabled` translation layer. A `<Button>`
  should never be nested inside a `<Link>` or vice versa (two focusable
  elements for one action) — for a link that must look like a button,
  style the `<Link>` directly with Tailwind instead.
- **`Field`/`TextInput`** (`Field.jsx`) — `<Field label="…" hint="…">`
  wraps a muted-label `<span>`; `<TextInput>` is a plain `<input>`
  underneath, but its `onChange` hands back the new value directly (not
  an event) — `<TextInput value={x} onChange={setX} />` — kept
  deliberately, since every form in this app was already written against
  that ergonomic and it reads better than unwrapping `event.target.value`
  at every call site.
- **Password field** (`PasswordField.jsx`) — wraps `Field`/`TextInput`
  with an absolutely-positioned show/hide toggle button (inline SVG
  eye/eye-off icons — two glyphs don't justify an icon library).
- **Copy button** (`CopyButton.jsx`) — plain `<button>`, unrelated to the
  above — precise compact icon+label sizing that gets absolutely
  positioned over a `<pre>` block in places.
- **Theme toggle** (`ThemeToggle.jsx`) — a light/dark/system three-way
  switch with its own small `useTheme()` hook local to the file:
  persists the choice to `localStorage` (`servermend_theme`) and applies
  `data-theme` to `<html>` (or removes it for "system", letting
  `index.css`'s `prefers-color-scheme` media query decide). `index.html`
  carries a tiny blocking inline `<script>` that applies a stored
  explicit choice *before* first paint, so there's no flash of the wrong
  theme while React hydrates. Fixed-position top-right, rendered once at
  the `App` root outside `<Routes>` rather than inside `Layout`, so it
  stays in the same spot on every page including `/login` and `/signup`.
- **Data tables (plain grids)** — a semantic `<table>`, Tailwind-styled
  (`rounded-xl border border-border bg-surface` wrapper, uppercase
  `text-muted` header row, `border-b border-border` row rules). Used by
  `ServerListPage` and the Reports tab within `ServerDetailPage`. Kept as
  a real `<table>` rather than the design's own CSS-grid-of-`<div>`s
  markup — same visual result, better accessibility (table semantics for
  screen readers) for a grid with no expand-in-place row.
- **Tabs** (`Tabs.jsx`) — `<Tabs tabs={[{id,label}]} value={} onChange={}>`
  renders an underline tab bar only; state and panel content live in the
  parent (`{tab === "overview" && <…>}`), not a separate compound-panel
  API — there's no shared behavior between "which tab is active" and
  "what that tab renders" that would justify one. `ServerDetailPage` is
  the current example: Overview/Findings/Reports/Baseline/Settings all
  live on one page/route behind these tabs rather than as separate
  routes, since none of them individually need their own URL to link to
  or bookmark.
- **Findings table (expand-in-place)** — `FindingsTable` is a plain
  semantic `<table>`, same reasoning as the data-tables entry above, plus
  a per-row expand-to-show-remediation interaction that doesn't fit a
  non-expanding grid's fixed row model — it inserts a full-width detail
  `<tr>` when a row is expanded. If admin-dashboard needs the same
  expand-in-place pattern, follow `FindingsTable`'s approach.
- **Trend chart** (`ScoreTrendChart.jsx`) — a hand-built SVG line+area
  chart (`viewBox="0 0 640 180"`, three horizontal gridlines at the
  quarter marks, an accent-colored `polyline` for the line plus a second
  `polyline` closed to the bottom edge at 10% opacity for the fill under
  it), not a charting library — one chart, no interactivity beyond what's
  shown, doesn't justify the dependency. `x` is evenly spaced across the
  point count, `y` maps score `0–100` directly onto the viewBox height (no
  library, no arbitrary floor — a real score can be low). Used by
  `DashboardPage` for the fleet score trend; the design's own version of
  this chart used a hardcoded illustrative data array (no real endpoint
  existed for it yet) — `GET /dashboard/summary`'s `scoreTrend` field
  (the most recent reports across the whole fleet, oldest first) is what
  makes it real.
- **Modal** (`Modal.jsx`) — `<Modal title="…" onClose={} footer={}>`
  renders a fixed `inset-0 bg-black/60` backdrop (click closes; Escape
  closes) around a centered `rounded-2xl border border-border bg-surface
  shadow-2xl` dialog — matches the design's modal exactly (`border-radius:
  14px` ≈ `rounded-2xl`, `box-shadow:0 24px 60px rgba(0,0,0,.5)` ≈
  `shadow-2xl`). Use a modal for a short-lived, one-off action that
  doesn't deserve its own URL/back-button history entry (registering a
  server is the current example); use a real routed page for anything a
  user would want to link to, bookmark, or navigate to directly.
- **Severity/status** — `<SeverityPill severity={} />` per the severity
  table above.
- **Toasts** (`Toast.jsx`) — a small custom `ToastProvider`/`useToast()`
  for one-off transient success/error notices (e.g. "Profile saved." on
  `ProfilePage`) where a full queue/action-button toast API is more than
  needed. Mounted once at the `App` root (outermost, alongside
  `AuthProvider`) so any page can call `useToast()` without its own
  provider; renders fixed bottom-right (`ThemeToggle` already owns
  top-right), auto-dismisses after 4s, and stays a
  `role="status"`/`aria-live="polite"` region. Reach for this instead of
  an inline `bg-success/10`/`bg-danger/10` banner specifically for
  **transient action feedback** (a save, a copy); keep the inline banner
  style for **blocking state** the user still needs to see after acting
  on it (a page failing to load, a form the user hasn't fixed yet).
- **Empty/error states** — empty states are a single `text-muted` sentence
  explaining what to do next (never a bare "No data"), and when that next
  step is an action rather than navigation, it's a plain `<button>` styled
  as inline text (opens a modal, so it isn't real navigation) embedded in
  the sentence. Errors are a `bg-danger/10 text-danger` banner with the
  actual message from the API, not a generic "Something went wrong."
- **Destructive action confirm (inline, not a modal)** — for a single
  destructive button living inside its own card (e.g. "Remove server" in
  `ServerDetailPage`'s Settings tab), swap the button for a Cancel/Confirm
  pair via a local boolean rather than a browser `confirm()` or opening a
  whole `Modal` for one yes/no. Reach for a real `Modal` instead when the
  confirmation needs to show more than a sentence of context (the
  Add-server flow's one-time API key reveal is that case).

## Applying this to admin-dashboard

When admin-dashboard is built: run the Setup steps above verbatim (same
Tailwind install, same `vite.config.js`, same `index.css` `@theme` +
`shared/design-tokens.css` palette, same two self-hosted fonts), copy the
small `src/components/` primitives listed above rather than reinventing
them, then reuse the layout/component patterns — the account/server
management UI and the `CheckDefinition` editor are still fundamentally
tables, forms, status displays, and modals, just with different data. This
keeps the two dashboards visually and behaviorally consistent as one
product without requiring shared build tooling between two
independently-deployed apps.
