// Mirrors agent/baseline/baseline.go's Diff exactly: only additions count
// — an entry present in `observed` but not in `known` — never removals
// (see that file's "removed item not flagged" case). Keeping the same
// semantics here means a human reviewing pending drift on the dashboard
// sees the same thing the agent's own local diffing would have flagged.
const FIELDS = [
  "authorizedKeys",
  "systemCronEntries",
  "userCronEntries",
  "systemdUnits",
  "suidBinaries",
];

function addedEntries(known = [], observed = []) {
  const knownSet = new Set(known);
  return observed.filter((entry) => !knownSet.has(entry));
}

/**
 * @param {object|null} confirmed
 * @param {object|null} observed
 * @returns {object} { [field]: string[] } — only fields with additions are present
 */
export function diffBaseline(confirmed, observed) {
  const diff = {};
  for (const field of FIELDS) {
    const added = addedEntries(confirmed?.[field], observed?.[field]);
    if (added.length > 0) diff[field] = added;
  }
  return diff;
}

export function hasDrift(diff) {
  return Object.keys(diff).length > 0;
}
