const WIDTH = 640;
const HEIGHT = 180;

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Matches the design's chart exactly (viewBox/gridlines/area+line
// styling) — the design itself used a hardcoded illustrative array here
// (no real fleet-wide trend endpoint existed yet), so this is the first
// real version: driven by GET /dashboard/summary's scoreTrend, the most
// recent reports across the whole fleet (not one line per server).
export function ScoreTrendChart({ trend }) {
  if (trend.length < 2) {
    return <p className="text-sm text-muted">Not enough report history yet for a trend — check back after a few more reports come in.</p>;
  }

  const points = trend.map((p, i) => {
    const x = (i * WIDTH) / (trend.length - 1);
    const y = HEIGHT - (p.score / 100) * HEIGHT;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePoints = points.join(" ");
  const areaPoints = `0,${HEIGHT} ${linePoints} ${WIDTH},${HEIGHT}`;

  const first = trend[0];
  const mid = trend[Math.floor((trend.length - 1) / 2)];
  const last = trend[trend.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height={HEIGHT} preserveAspectRatio="none" aria-label="Fleet score trend">
        <line x1="0" y1={HEIGHT * 0.25} x2={WIDTH} y2={HEIGHT * 0.25} stroke="var(--border)" strokeWidth="1" />
        <line x1="0" y1={HEIGHT * 0.5} x2={WIDTH} y2={HEIGHT * 0.5} stroke="var(--border)" strokeWidth="1" />
        <line x1="0" y1={HEIGHT * 0.75} x2={WIDTH} y2={HEIGHT * 0.75} stroke="var(--border)" strokeWidth="1" />
        <polyline points={areaPoints} fill="rgba(255,180,84,.10)" stroke="none" />
        <polyline points={linePoints} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between pt-1.5 text-[11px] text-muted">
        <span>{formatDate(first.receivedAt)}</span>
        <span>{formatDate(mid.receivedAt)}</span>
        <span>{formatDate(last.receivedAt)}</span>
      </div>
    </div>
  );
}
