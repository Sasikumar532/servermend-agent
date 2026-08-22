// Matches the design's SEV table exactly — critical/high/medium/low plus
// a "none" style for a null severity (unscored/info findings).
const SEV = {
  critical: { label: "Critical", bg: "var(--danger)", fg: "#fff", border: "var(--danger)" },
  high: { label: "High", bg: "rgba(243,18,96,.14)", fg: "var(--danger)", border: "rgba(243,18,96,.35)" },
  medium: { label: "Medium", bg: "var(--warning)", fg: "#1a1200", border: "var(--warning)" },
  low: { label: "Low", bg: "var(--default)", fg: "var(--muted)", border: "var(--border)" },
  none: { label: "Info", bg: "rgba(255,180,84,.14)", fg: "var(--accent)", border: "rgba(255,180,84,.35)" },
};

export function SeverityPill({ severity }) {
  const s = SEV[severity] ?? SEV.none;
  return (
    <span
      className="inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
      style={{ backgroundColor: s.bg, color: s.fg, borderColor: s.border }}
    >
      {s.label}
    </span>
  );
}
