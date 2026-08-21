// Custom rather than a HeroUI progress component — HeroUI v3 doesn't ship
// a circular-progress/ring component, so the overall-score ring is a
// plain div with a colored border. Colors are pulled directly from
// HeroUI's own CSS variables (--success/--warning/--danger) via inline
// style rather than conditional Tailwind class names, since the value is
// computed at runtime and Tailwind's build-time class scanner can't see
// dynamically-interpolated class names.
function scoreColorVar(value) {
  if (value >= 90) return "var(--success)";
  if (value >= 70) return "var(--warning)";
  return "var(--danger)";
}

export function ScoreBars({ score }) {
  if (!score) {
    return <p className="text-sm text-muted">No reports received yet — install the agent to get a score.</p>;
  }

  const categories = Object.entries(score.byCategory).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="flex flex-wrap items-start gap-8">
      <div
        className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full border-4"
        style={{ borderColor: scoreColorVar(score.overall) }}
      >
        <span className="text-2xl font-bold">{score.overall}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted">overall</span>
      </div>
      <ul className="flex min-w-60 flex-1 flex-col gap-2">
        {categories.map(([category, value]) => (
          <li key={category} className="grid grid-cols-[90px_1fr_32px] items-center gap-3 text-sm">
            <span className="capitalize text-muted">{category}</span>
            <div className="h-2 overflow-hidden rounded-full bg-default">
              <div
                className="h-full rounded-full"
                style={{ width: `${value}%`, backgroundColor: scoreColorVar(value) }}
              />
            </div>
            <span className="text-right tabular-nums">{value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
