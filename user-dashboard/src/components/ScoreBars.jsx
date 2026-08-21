function scoreClass(value) {
  if (value >= 90) return "score-good";
  if (value >= 70) return "score-warn";
  return "score-bad";
}

export function ScoreBars({ score }) {
  if (!score) {
    return <p className="empty-state">No reports received yet — install the agent to get a score.</p>;
  }

  const categories = Object.entries(score.byCategory).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="score-bars">
      <div className={`score-overall ${scoreClass(score.overall)}`}>
        <span className="score-overall-value">{score.overall}</span>
        <span className="score-overall-label">overall</span>
      </div>
      <ul className="score-category-list">
        {categories.map(([category, value]) => (
          <li key={category} className="score-category-row">
            <span className="score-category-name">{category}</span>
            <div className="score-bar-track">
              <div className={`score-bar-fill ${scoreClass(value)}`} style={{ width: `${value}%` }} />
            </div>
            <span className="score-category-value">{value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
