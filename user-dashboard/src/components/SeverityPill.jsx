const LABELS = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

// severity is null for informational checks (e.g. open-ports-scan) that
// never carry a severity — see backend/src/models/CheckDefinition.js.
export function SeverityPill({ severity }) {
  if (!severity) return <span className="pill pill-info">Info</span>;
  return <span className={`pill pill-${severity}`}>{LABELS[severity]}</span>;
}
