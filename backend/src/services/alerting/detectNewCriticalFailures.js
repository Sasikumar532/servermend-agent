// Pure function: which findings in `current` are a critical failure that
// wasn't already a critical failure in `previous`. This is deliberately a
// transition detector, not "every critical fail every report" — a
// persistently-failing critical check would otherwise re-alert on every
// single ingest, which trains operators to ignore the alerts entirely.
// `previous = []` (no prior report, or the server's first-ever report)
// means every current critical failure counts as new — the first report
// is exactly when an operator most needs to hear about them.
//
// @param {Array<{id:string, status:string, severity:string|null}>} previous
// @param {Array<{id:string, status:string, severity:string|null}>} current
// @returns {Array} the subset of `current` that is newly critical-and-failing
export function detectNewCriticalFailures(previous = [], current = []) {
  const previouslyFailingCritical = new Set(
    previous.filter((f) => f.status === "fail" && f.severity === "critical").map((f) => f.id)
  );
  return current.filter(
    (f) => f.status === "fail" && f.severity === "critical" && !previouslyFailingCritical.has(f.id)
  );
}
