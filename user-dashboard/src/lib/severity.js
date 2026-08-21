// Shared by SeverityPill and anywhere else a severity needs to render as a
// Chip (the alert list on ServerDetailPage) so the color/variant mapping
// only lives in one place. HeroUI's Chip only ships three status colors
// (success/warning/danger) plus accent/default, but the backend reports
// four severity levels (critical/high/medium/low) — critical and high
// both use "danger", distinguished by variant (solid vs. soft) rather
// than by hue, since inventing a color outside HeroUI's palette would
// fight the library instead of using it.
const SEVERITY_CHIP_PROPS = {
  critical: { color: "danger", variant: "primary", label: "Critical" },
  high: { color: "danger", variant: "soft", label: "High" },
  medium: { color: "warning", variant: "primary", label: "Medium" },
  low: { color: "default", variant: "secondary", label: "Low" },
};

const INFO_CHIP_PROPS = { color: "accent", variant: "soft", label: "Info" };

// severity is null for informational checks with no severity (e.g.
// open-ports-scan) — see backend/src/models/CheckDefinition.js.
export function severityChipProps(severity) {
  return severity ? SEVERITY_CHIP_PROPS[severity] : INFO_CHIP_PROPS;
}
