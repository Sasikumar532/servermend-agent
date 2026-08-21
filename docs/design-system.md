# ServerMend design system

Shared visual language for `user-dashboard` and `admin-dashboard`. Both are
information-dense operational UIs (security findings, scores, account/server
management) — not marketing pages — so the system optimizes for scannability
and semantic clarity over decoration.

Built on **[HeroUI](https://www.heroui.com) v3** (React 19 + Tailwind CSS
v4 + React Aria Components under the hood) — not a hand-rolled CSS system.
Reach for a HeroUI component first; only write custom Tailwind-styled
markup for the handful of things documented below that don't have a
HeroUI equivalent or don't fit its component model.

## Setup (required in every dashboard)

```bash
npm i @heroui/styles @heroui/react
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

`src/index.css` — import order matters (Tailwind first, then HeroUI's
styles, then the brand accent override):

```css
@import "tailwindcss";
@import "@heroui/styles";

/* paste the contents of shared/design-tokens.css here */
```

`index.html` — dark mode is on by default; HeroUI reads a `dark` class or
`data-theme="dark"` on `<html>`:

```html
<html lang="en" class="dark"></html>
```

**HeroUI v3 needs no Provider** — components work directly after the
import/install above. **Requires React 19+** — both dashboards must be on
`react`/`react-dom` `^19.0.0`, not the `^18` line other parts of this repo
may still reference.

## Color tokens

HeroUI's own palette (defined by `@heroui/styles`, not redeclared per-app)
exposes these as Tailwind utility classes directly — no custom token
plumbing needed:

| Utility | Role |
|---|---|
| `bg-background` / `text-foreground` | Page background / primary text |
| `bg-surface` / `text-surface-foreground` | Card/panel background |
| `bg-default` / `text-default-foreground` | Neutral surface — hover states, tracks, subtle fills |
| `text-muted` | Secondary/meta text |
| `border-border` | Hairline borders, table rules |
| `bg-accent` / `text-accent-foreground` | Brand color — buttons, links, focus |
| `bg-success` / `text-success-foreground` | Good/pass status |
| `bg-warning` / `text-warning-foreground` | Caution/medium status |
| `bg-danger` / `text-danger-foreground` | Bad/critical status |

**Deliberate customizations** on top of HeroUI's stock palette — see
[`shared/design-tokens.css`](../shared/design-tokens.css), copied into
each dashboard's `index.css` after the two `@import` lines (no shared
build tooling between the two independent Vite apps to import it
directly — same manual-mirror pattern used elsewhere in this repo, e.g.
`backend/openapi.yaml` vs. the Go agent's structs):

- **Both themes**: `--accent`/`--accent-foreground` set to a warm amber
  (`#ffb454`) instead of HeroUI's default.
- **Dark mode only**: `--background`/`--surface`/`--overlay`/`--default`/
  `--foreground`/`--muted`/`--border`/`--separator` are all overridden to
  a genuine near-black "terminal" palette — reads as an amber-phosphor
  terminal, not just HeroUI's stock dark grays. Light mode is untouched
  HeroUI apart from the accent.

**Never touch `success`/`warning`/`danger`** in either theme — those are
HeroUI's own accessible palette, and redefining them risks a contrast
mistake this environment can't visually catch.

### Finding severity scale

HeroUI's `Chip` ships exactly three status colors (`success`/`warning`/`danger`)
plus `accent`/`default` — but the backend reports **four** severity levels
(critical/high/medium/low) plus "no severity." Rather than inventing a
color outside HeroUI's palette, `critical` and `high` share `danger`,
distinguished by `variant` (solid vs. soft) instead of hue. The mapping
lives in one place — [`src/lib/severity.js`](../user-dashboard/src/lib/severity.js)
— reused by both `SeverityPill` and the alert list, so it's never
duplicated:

| Severity | `color` | `variant` |
|---|---|---|
| critical | `danger` | `primary` (solid) |
| high | `danger` | `soft` |
| medium | `warning` | `primary` |
| low | `default` | `secondary` |
| *(none)* | `accent` | `soft` — labeled "Info" |

**Never rely on color alone to convey severity.** `SeverityPill` always
renders the text label ("Critical", "High", …) alongside the color —
critical/high sharing a hue makes this doubly true. This matters for
colorblind users and for anyone glancing at a printed/screenshotted view.

## Typography

Inter, self-hosted via `@fontsource/inter` (not a Google Fonts `<link>`) —
weights 400/500/600/700, imported once in `main.jsx` before `index.css`.
Self-hosted rather than CDN-linked so the app has no external runtime
dependency for its own typeface:

```css
body {
  font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
}
```

admin-dashboard should `npm install @fontsource/inter` and import the same
four weight files rather than linking a CDN font.

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
- **Sidebar collapse** — toggles between `w-56` (full: icon + label) and
  `w-16` (icon-only, `title` attribute standing in for the hidden label)
  via a `transition-[width]` class and a plain state boolean persisted to
  `localStorage` (`servermend_sidebar_collapsed`) so it doesn't reset on
  every page load. Every nav item — and any future one — needs an icon
  precisely because of this: collapsed mode has nothing else to show.
  Icons are inline SVG (`ServerIcon`, `PanelToggleIcon`, `LogoutIcon` in
  `Layout.jsx`), matching every other icon in this app — no icon library
  anywhere in the project.
- **The sidebar stays dark regardless of the app-wide theme** — it has its
  own `dark` class applied directly on the `<aside>`, not just relying on
  `<html>`'s class. HeroUI's tokens are defined under
  `.dark,[data-theme=dark] { --surface: ...; ... }`, and CSS custom
  properties resolve by DOM proximity — the *nearest* matching ancestor
  (or the element itself) wins — so a `.dark`-classed element nested
  inside a light-mode tree correctly scopes dark values to just that
  subtree without touching anything outside it. No extra tokens or
  overrides needed; every `bg-surface`/`text-muted`/`border-border`/etc.
  utility already used inside the sidebar automatically resolves dark.
- **Navigation uses plain react-router `NavLink`/`Link`, styled with
  Tailwind, not HeroUI's `Link`** — HeroUI's docs don't confirm a working
  react-router integration (its `Link` takes `href`, with an unverified
  `render`-prop escape hatch for custom routing), while `NavLink`'s
  `isActive` callback is exactly what an active-nav-item highlight needs
  and is guaranteed to produce real client-side navigation.
- **Sections are `Card`** (`Card.Header` → `Card.Title` [+ `Card.Description`],
  `Card.Content`, optional `Card.Footer`) instead of a hand-rolled
  `<section>` — one `Card` per logical grouping (a score panel, a findings
  table, an alert list).
- Flat, no custom shadows — depth comes from HeroUI's own `background`/
  `surface`/`default` step sequence.

## Component patterns

Reuse these rather than inventing new ones when admin-dashboard needs the
same kind of information. Import everything from `@heroui/react`.

- **Buttons** — `<Button>`, click handler is `onPress` (not `onClick` — it
  comes from the underlying React Aria primitive), disabled state is
  `isDisabled`. `variant`: `primary | secondary | tertiary | outline | ghost | danger`.
  A `<Button>` should never be nested inside a `<Link>` or vice versa (two
  focusable elements for one action) — for a link that must look like a
  button, style the `<Link>` directly with Tailwind instead.
- **Forms** — `<TextField value={} onChange={(value) => ...}>` wrapping
  `<Label>` and `<Input>` (imported as flat top-level components, *not*
  `TextField.Label`/`TextField.Input` — `TextField` only exposes a
  `.Root`). `onChange` receives the value directly, not an event.
  `type="email"`/`type="password"`/etc. goes on `<Input>`, not `<TextField>`.
- **Password field** (`PasswordField`) — wraps `TextField`/`Input` with an
  absolutely-positioned show/hide toggle; HeroUI's `Input` docs don't show
  an `endContent`/adornment slot, so this stays a plain `<button>` overlay
  with inline SVG eye/eye-off icons (no icon library — two glyphs don't
  justify one).
- **Copy button** (`CopyButton`) — plain `<button>`, not HeroUI's, for the
  same reason: precise compact icon+label sizing that gets absolutely
  positioned over a `<pre>` block in places, which is simpler without a
  component library's own padding defaults to fight.
- **Theme toggle** (`ThemeToggle`) — a light/dark/system three-way switch
  built on HeroUI's own `useTheme("system")` hook (`{ theme, setTheme }`
  — it already persists the choice to `localStorage` and applies both the
  class and `data-theme` attribute to `<html>`, so this component has no
  storage logic of its own). Fixed-position top-right, rendered once at
  the `App` root outside `<Routes>` rather than inside `Layout`, so it
  stays in the same spot on every page including `/login` and `/signup`,
  which sit outside the sidebar shell entirely.
- **Data tables (plain grids)** — HeroUI's `Table` (`Table.ScrollContainer`
  → `Table.Content` → `Table.Header`/`Table.Column` + `Table.Body`/`Table.Row`/`Table.Cell`).
  First column gets `isRowHeader`. Used by `ServerListPage` and
  `ServerReportsPage`.
- **Findings table (expand-in-place)** — `FindingsTable` is a **plain
  semantic `<table>`, Tailwind-styled, not HeroUI's `Table`**. The
  per-row expand-to-show-remediation interaction doesn't fit an
  accessible data-table's fixed row/column model, and HeroUI's docs don't
  confirm support for an inserted full-width detail row. If admin-dashboard
  needs the same expand-in-place pattern, follow `FindingsTable`'s
  approach rather than fighting `Table` into it; use real `Table` for
  anything that's just a non-expanding grid.
- **Modal** — `<Modal>` wrapping `Modal.Backdrop` (`isOpen`/`onOpenChange`
  — inherited from the underlying React Aria `ModalOverlay` primitive) →
  `Modal.Container` → `Modal.Dialog` (size via `className`, e.g.
  `sm:max-w-190`) → `Modal.CloseTrigger`, `Modal.Header` → `Modal.Heading`,
  `Modal.Body`, `Modal.Footer`. Use a modal for a short-lived, one-off
  action that doesn't deserve its own URL/back-button history entry
  (registering a server is the current example); use a real routed page
  for anything a user would want to link to, bookmark, or navigate to
  directly.
- **Severity/status** — `<Chip color={} variant={}>` per the severity
  table above; plain-text children auto-wrap in `Chip.Label`.
- **Empty/error states** — empty states are a single `text-muted` sentence
  explaining what to do next (never a bare "No data"), and when that next
  step is an action rather than navigation, it's a plain `<button>` styled
  as inline text (opens a modal, so it isn't real navigation) embedded in
  the sentence. Errors are a `bg-danger/10 text-danger` banner with the
  actual message from the API, not a generic "Something went wrong."

## Applying this to admin-dashboard

When admin-dashboard is built: run the Setup steps above verbatim (same
HeroUI/Tailwind/React-19 install, same `vite.config.js`, same `index.html`
dark-mode class, same `index.css` import order plus
`shared/design-tokens.css`'s accent override), then reuse the component
patterns above — the account/server management UI and the
`CheckDefinition` editor are still fundamentally tables, forms, status
displays, and modals, just with different data. This keeps the two
dashboards visually and behaviorally consistent as one product without
requiring shared build tooling between two independently-deployed apps.
