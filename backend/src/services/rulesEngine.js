// Per-category scores floor independently at 0, rather than one global
// number collapsing to 0 after ~3 criticals — see the roadmap decision
// this resolves. "Overall" is a simple average of category scores for
// v0; the playbook explicitly frames severity weights as a starting
// point to tune once real score distributions exist.
const SEVERITY_PENALTY = {
  critical: 20,
  high: 10,
  medium: 5,
  low: 2,
};

/**
 * Scores a raw report against the current CheckDefinition set. Findings
 * whose checkId has no matching definition (agent/backend version skew)
 * are recorded but never scored — silently defaulting an unknown check to
 * some severity would be a worse failure mode than just flagging it as
 * unscored.
 *
 * @param {Array<{id:string, category:string, title:string, status:string, detail:string}>} findings
 * @param {Map<string, {category:string, severityDefault?:string}>} definitions
 */
export function scoreReport(findings, definitions) {
  const scoredFindings = [];
  const unscoredCheckIds = [];
  const categoryPenalties = new Map();
  const categoriesSeen = new Set();

  for (const f of findings) {
    const def = definitions.get(f.id);
    const category = def?.category ?? f.category;
    categoriesSeen.add(category);

    if (!def) {
      unscoredCheckIds.push(f.id);
      scoredFindings.push({ ...f, severity: null, scored: false });
      continue;
    }

    scoredFindings.push({ ...f, severity: def.severityDefault ?? null, scored: true });

    if (f.status === "fail" && def.severityDefault) {
      const penalty = SEVERITY_PENALTY[def.severityDefault];
      categoryPenalties.set(category, (categoryPenalties.get(category) ?? 0) + penalty);
    }
  }

  const byCategory = {};
  for (const category of categoriesSeen) {
    const penalty = categoryPenalties.get(category) ?? 0;
    byCategory[category] = Math.max(0, 100 - penalty);
  }

  const categoryScores = Object.values(byCategory);
  const overall =
    categoryScores.length > 0
      ? Math.round(categoryScores.reduce((a, b) => a + b, 0) / categoryScores.length)
      : 100;

  return { overall, byCategory, scoredFindings, unscoredCheckIds };
}
