# ServerMend design system

Shared visual language for `user-dashboard` and `admin-dashboard`. Both are
information-dense operational UIs (security findings, scores, account/server
management) — not marketing pages — so the system optimizes for scannability
and semantic clarity over decoration. Canonical token values live in
[`shared/design-tokens.css`](../shared/design-tokens.css); each dashboard
copies that exact `:root` block into its own `src/index.css` (see that
file's header comment for why — no monorepo/shared-package tooling exists
between the two independent Vite apps).

## Color tokens

Dark theme: near-black surfaces, a warm amber brand/accent color, and
green/red status colors with matching low-opacity "dim" variants for tinted
badges and banners. `--high`/`--high-dim` are the one addition beyond the
originally-specified palette — the backend reports four finding-severity
levels (critical/high/medium/low), not just ok/fail, so "high" needs its
own color; it's derived as a bridge between `--amber` and `--fail` on the
same warm hue family rather than introducing an unrelated color.

| Token | Hex | Role |
|---|---|---|
| `--ink` | `#0e1116` | Primary background (near-black) |
| `--panel` | `#151b23` | Card/panel background |
| `--panel-2` | `#1b222c` | Secondary panel background — hover states, nested surfaces, table-row expansion |
| `--line` | `#28303b` | Borders/dividers |
| `--text` | `#cbd5df` | Primary body text |
| `--muted` | `#8494a4` | Secondary/dim text |
| `--amber` | `#ffb454` | Primary brand/accent — links, buttons, highlights, the wordmark |
| `--amber-dim` | `rgba(255,180,84,.12)` | Amber tint background (tags, dashed borders) |
| `--ok` | `#7fd962` | Success/status green |
| `--ok-dim` | `rgba(127,217,98,.12)` | Success tint background |
| `--fail` | `#f26d78` | Error/status red |
| `--fail-dim` | `rgba(242,109,120,.12)` | Error tint background |
| `--high` *(derived)* | `#ee8b5c` | Bridges `--amber`→`--fail` for the "high" severity level |
| `--high-dim` *(derived)* | `rgba(238,139,92,.12)` | High-severity tint background |

**Text-on-fill rule:** dark ink text (`--ink`) on the bright/light fills
(`--amber`, `--ok`, `--muted`), light text (`--text`) on the darker or more
saturated ones (`--fail`, `--high`, `--line`). This is why buttons (amber
fill) use `color: var(--ink)` rather than white, and why `.pill-info`
(background `--line`, quite dark) uses `color: var(--text)` while
`.pill-medium` (background `--amber`) uses `color: var(--ink)`.

### Finding severity scale

| Token | Meaning |
|---|---|
| `--fail` | critical |
| `--high` | high |
| `--amber` | medium |
| `--muted` | low |
| `--line` | info — findings with no severity (informational checks like `open-ports-scan`) |

**Never rely on color alone to convey severity.** `SeverityPill` always
renders the text label ("Critical", "High", …) alongside the color — the
palette reinforces status, it doesn't carry it alone. This matters for
colorblind users and for anyone glancing at a printed/screenshotted view.
Any new severity-bearing component (admin-dashboard's account/server list,
for instance) must follow the same rule.

### Score/quality bands

| Token | Threshold (of a 0–100 score) |
|---|---|
| `--ok` | ≥ 90 |
| `--amber` | 70–89 |
| `--fail` | < 70 |

This reuses the same status tokens as the severity scale above (deliberately
— an aggregate score and a finding severity are both "how bad is this," so
sharing `--ok`/`--amber`/`--fail` keeps the vocabulary small) rather than
maintaining a separate parallel set of "good/warn/bad" tokens.

## Typography

Inter, self-hosted via `@fontsource/inter` (not a Google Fonts `<link>`) —
weights 400/500/600/700, imported once in `main.jsx` before `index.css`.
Self-hosted rather than CDN-linked so the app has no external runtime
dependency for its own typeface, consistent with the rest of this project
staying dependency-light. System-font fallback stays in place in case the
package ever fails to load:

```css
font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
```

admin-dashboard should `npm install @fontsource/inter` and import the same
four weight files rather than linking a CDN font.

- Body text: 15px, line-height 1.5.
- `h1`: 1.5rem, 600 weight — page titles only, one per page.
- `h2`: 1.05rem, 600 weight, `--muted`, uppercase with `0.03em`
  letter-spacing — section headers within a page (e.g. "Score", "Findings").
- Numeric columns (scores, counts) use `font-variant-numeric: tabular-nums`
  so digits align in a column.

## Layout conventions

- **Sidebar shell** (`Layout`) — a fixed `220px` `--panel` sidebar (brand at
  top, nav links, signed-in-as-email + log out pinned to the bottom via
  `margin-top: auto`) beside a flexible main content area. The whole
  authenticated app lives inside this shell (`ProtectedRoute` → `Layout` →
  page `Outlet`); only `/login` and `/signup` render outside it. Nav links
  use `NavLink`'s `isActive` for an `--amber-dim` background + `--amber`
  text highlight — reserve top-level sidebar entries for actual sections a
  user navigates *to* (e.g. "Servers"), not one-off actions (see Modal
  below for those).
- Content is capped at `max-width: 960px`, centered within the space beside
  the sidebar, `1.5rem 2rem` padding — a dashboard, not a document; the cap
  keeps tables and cards from stretching edge-to-edge on wide monitors
  while staying full-width on narrower ones.
- Sections are `--panel` cards: 1px `--line`, 8px radius, `1.25rem`
  padding. Use one section per logical grouping (a score panel, a findings
  table, an alert list) rather than one undifferentiated page of content.
- A `.page-header` (title + primary action, `justify-content: space-between`)
  opens a top-level page; a `.section-header` (same shape, smaller) opens a
  section that has its own secondary action or related-page link (e.g.
  Score → "Report history").
- Sibling spacing is layout-driven (flex/grid `gap`), not per-element
  margins — avoids the classic collapsing/doubling margin bug.
- Flat, no shadows — depth comes from the `ink`/`panel`/`panel-2` step
  sequence, not box-shadow. Keep it that way; don't introduce shadows for
  one component and not others.

## Component patterns

Reuse these patterns rather than inventing new ones when admin-dashboard
needs the same kind of information:

- **Severity pill** (`SeverityPill`) — a small rounded-pill badge, solid
  severity color, the severity name spelled out, text color per the
  text-on-fill rule above. `null` severity renders as an "Info" pill on
  `--line`.
- **Score display** (`ScoreBars`) — a ringed overall-score circle (border
  color from the `--ok`/`--amber`/`--fail` band) next to a list of
  per-category bars, each bar's fill width equal to its percentage and
  colored by the same band logic, on a `--line` track. Categories sorted
  alphabetically for stable ordering across reloads.
- **Data tables** — uppercase, `--muted`, `0.78rem` letter-spaced column
  headers; `1px` `--line` row rules; no zebra striping (the severity pill
  and status text already carry enough visual weight per row). Clickable
  rows (e.g. a failing finding that expands remediation guidance) get a
  `:hover` background of `--panel-2` and `cursor: pointer` — a lift, not a
  darkening, since darkening a hover state reads as "nothing happened" on
  a dark theme.
- **Form inputs** — must have an explicit `background: var(--panel-2)` and
  `color: var(--text)`. Native form controls default to a light background
  regardless of page theme, so omitting this is a real bug, not a style
  nicety — it renders as a broken white box on the dark page. Focus state
  is a 2px `--amber` outline.
- **Copy button** (`CopyButton`) — a small bordered icon+label button
  (`.copy-button`, `--line` border, `--muted` text) next to any value a
  user needs to paste elsewhere (an ID, a secret, a shell command). Uses
  `navigator.clipboard.writeText` and swaps to a checkmark + "Copied" for
  1.5s; a failed clipboard write (permission denied, insecure context) is
  a silent no-op — the value is still selectable by hand either way, so
  it's not worth surfacing as an error. Inline next to a value in a
  `dl`/flex row, or absolutely positioned top-right over a `<pre>` block
  for multi-line content (`.key-reveal-install-wrap`).
- **Password field** (`PasswordField`) — a password input with a show/hide
  eye-icon toggle absolutely positioned inside the field (`.password-field`
  wrapper, `position: relative`; the input gets `padding-right` to leave
  room for the icon). Icons are inline SVG, not an icon library — this
  project has none and two glyphs don't justify adding one. The toggle is
  a real `<button type="button">` with `aria-label`/`aria-pressed`
  reflecting the current state, not a bare clickable `<span>`.
- **Buttons** — solid `--amber` fill with `--ink` text (not white — amber
  is a bright fill) for primary actions; a bordered "ghost" variant
  (transparent fill, `--muted` text, `--line` outline) for secondary
  actions like "Log out". Hover is `filter: brightness(0.92)` — works for
  any accent color without a separate hover token. Disabled state is
  `opacity: 0.6` plus `cursor: default` — no separate disabled color
  token.
- **Empty/error states** — empty states are a single `--muted` sentence
  explaining what to do next (never a bare "No data"), and when that next
  step is an action rather than navigation, it's a `.link-button` (a real
  `<button>` styled as inline text, not a `<Link>`, since it opens a modal
  rather than navigating) embedded in the sentence itself. Errors are a
  `--fail`-on-`--fail-dim` banner with the actual message from the API,
  not a generic "Something went wrong" — this is exactly what the `-dim`
  tokens are for.
- **Modal** (`Modal`) — centered overlay dialog: `rgba` `--ink` scrim,
  `--panel` card capped at `760px`, Escape-to-close, click-outside-to-close
  (an inner `stopPropagation` keeps clicks inside the card from closing
  it), and a body scroll lock for as long as it's open. Use a modal for a
  short-lived, one-off action that doesn't deserve its own URL/back-button
  history entry (registering a server is the current example —
  `AddServerModal`); use a real routed page for anything a user would want
  to link to, bookmark, or navigate to directly (server detail, report
  history). The modal's own heading overrides the global `h2` styling
  (`text-transform: none`, normal letter-spacing, `--text` color) since
  it's a dialog title, not a section label.

## Applying this to admin-dashboard

When admin-dashboard is built, start from `shared/design-tokens.css`
verbatim and reuse the component patterns above — the account/server
management UI and the `CheckDefinition` editor are still fundamentally
tables, forms, severity displays, and status pills, just with different
data. Copying the token file and the pattern language keeps the two
dashboards visually and behaviorally consistent as one product, without
requiring shared build tooling between two independently-deployed apps. If
admin-dashboard needs a token neither dashboard has yet (e.g. a distinct
"pending review" status color for account approvals), add it to
`shared/design-tokens.css` first and copy it into both `index.css` files —
don't invent a one-off local variable in just one app.
