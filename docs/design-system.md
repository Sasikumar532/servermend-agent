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

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#f4f5f7` | Page background |
| `--surface` | `#ffffff` | Cards, panels, forms |
| `--border` | `#dde1e6` | Hairline borders, table rules |
| `--text` | `#1c2128` | Primary text |
| `--text-muted` | `#5b6472` | Secondary text, meta, labels |
| `--track` | `#e7e9ee` | Background of a bar/progress track |
| `--accent` | `#2f5ff2` | Primary buttons, links, focus states |
| `--accent-contrast` | `#ffffff` | Text/icon color placed on `--accent` |

### Finding severity scale

| Token | Hex | Meaning |
|---|---|---|
| `--critical` | `#c81e3a` | crimson |
| `--high` | `#d9622b` | burnt orange |
| `--medium` | `#b8860b` | amber |
| `--low` | `#4a5568` | slate |
| `--info` | `#4a6785` | steel blue — findings with no severity (informational checks like `open-ports-scan`) |

**Never rely on color alone to convey severity.** `SeverityPill` always
renders the text label ("Critical", "High", …) alongside the color — the
palette reinforces status, it doesn't carry it alone. This matters for
colorblind users and for anyone glancing at a printed/screenshotted view.
Any new severity-bearing component (admin-dashboard's account/server list,
for instance) must follow the same rule.

### Score/quality bands

| Token | Hex | Threshold (of a 0–100 score) |
|---|---|---|
| `--good` | `#1c8a4a` | ≥ 90 |
| `--warn` | `#b8860b` | 70–89 |
| `--bad` | `#c81e3a` | < 70 |

This is a **separate scale from severity**, even though `--warn`/`--medium`
and `--bad`/`--critical` currently share a hex value. They're different
semantic domains — one finding's severity vs. an aggregate percentage — so
they're kept as distinct tokens rather than collapsed into one. If a future
redesign wants the two scales to diverge visually, changing one shouldn't
require touching the other.

## Typography

System font stack — no webfont loading, so both apps stay fast and
dependency-free:

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
```

- Body text: 15px, line-height 1.5.
- `h1`: 1.5rem, 600 weight — page titles only, one per page.
- `h2`: 1.05rem, 600 weight, `--text-muted`, uppercase with `0.03em`
  letter-spacing — section headers within a page (e.g. "Score", "Findings").
- Numeric columns (scores, counts) use `font-variant-numeric: tabular-nums`
  so digits align in a column.

## Layout conventions

- Content is capped at `max-width: 960px`, centered, `1.5rem` padding — a
  dashboard, not a document; the cap keeps tables and cards from stretching
  edge-to-edge on wide monitors while staying full-width on narrower ones.
- Sections are `--surface` cards: 1px `--border`, 8px radius, `1.25rem`
  padding. Use one section per logical grouping (a score panel, a findings
  table, an alert list) rather than one undifferentiated page of content.
- Sibling spacing is layout-driven (flex/grid `gap`), not per-element
  margins — avoids the classic collapsing/doubling margin bug.

## Component patterns

Reuse these patterns rather than inventing new ones when admin-dashboard
needs the same kind of information:

- **Severity pill** (`SeverityPill`) — a small rounded-pill badge, solid
  severity color, white text, the severity name spelled out. `null`
  severity renders as an "Info" pill in `--info`.
- **Score display** (`ScoreBars`) — a ringed overall-score circle (border
  color from the good/warn/bad band) next to a list of per-category bars,
  each bar's fill width equal to its percentage and colored by the same
  band logic. Categories sorted alphabetically for stable ordering across
  reloads.
- **Data tables** — uppercase, `--text-muted`, `0.78rem` letter-spaced
  column headers; `1px` `--border` row rules; no zebra striping (the
  severity pill and status text already carry enough visual weight per
  row). Clickable rows (e.g. a failing finding that expands remediation
  guidance) get a `:hover` background of `--bg` and `cursor: pointer`.
- **Buttons** — solid `--accent` fill with `--accent-contrast` text for
  primary actions; a bordered "ghost" variant (transparent fill,
  `--text-muted` text, `--border` outline) for secondary actions like
  "Log out". Disabled state is `opacity: 0.6` plus `cursor: default` — no
  separate disabled color token.
- **Empty/error states** — empty states are a single `--text-muted`
  sentence explaining what to do next (never a bare "No data"); errors are
  a `--critical`-on-`#fdecec` banner with the actual message from the API,
  not a generic "Something went wrong."

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
