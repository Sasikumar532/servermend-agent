import { Fragment, useState } from "react";
import { ApiError } from "../api/client";
import { getRemediation } from "../api/servers";
import { SeverityPill } from "./SeverityPill";

// Failing findings first, then errors (checks that couldn't run — still
// worth an operator's attention), then info, then pass — pass is what an
// operator cares about least, so it goes last rather than sorted with
// everything else alphabetically.
const STATUS_ORDER = { fail: 0, error: 1, info: 2, pass: 3 };

export function FindingsTable({ serverId, findings }) {
  const [expandedId, setExpandedId] = useState(null);
  const [remediation, setRemediation] = useState({});

  const sorted = [...findings].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  async function loadRemediation(checkId) {
    setRemediation((prev) => ({ ...prev, [checkId]: { loading: true } }));
    try {
      const result = await getRemediation(serverId, checkId);
      setRemediation((prev) => ({
        ...prev,
        [checkId]: { loading: false, text: result.explanation, source: result.source },
      }));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to load remediation guidance.";
      setRemediation((prev) => ({ ...prev, [checkId]: { loading: false, error: message } }));
    }
  }

  function toggle(checkId) {
    const next = expandedId === checkId ? null : checkId;
    setExpandedId(next);
    if (next && !remediation[next]) {
      void loadRemediation(next);
    }
  }

  if (findings.length === 0) {
    return <p className="empty-state">No findings in the latest report.</p>;
  }

  return (
    <table className="findings-table">
      <thead>
        <tr>
          <th>Status</th>
          <th>Severity</th>
          <th>Category</th>
          <th>Check</th>
          <th>Detail</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((finding) => {
          const isFailing = finding.status === "fail";
          return (
            <Fragment key={finding.id}>
              <tr
                className={`finding-row finding-row-${finding.status}${isFailing ? " finding-row-clickable" : ""}`}
                onClick={isFailing ? () => toggle(finding.id) : undefined}
              >
                <td className={`finding-status finding-status-${finding.status}`}>{finding.status}</td>
                <td>
                  <SeverityPill severity={finding.severity} />
                </td>
                <td>{finding.category}</td>
                <td>
                  {finding.title || finding.id}
                  {!finding.scored && (
                    <span className="unscored-badge" title="No matching check definition on the backend">
                      unscored
                    </span>
                  )}
                </td>
                <td className="finding-detail">{finding.detail}</td>
              </tr>
              {expandedId === finding.id && (
                <tr className="remediation-row">
                  <td colSpan={5}>
                    <RemediationPanel state={remediation[finding.id]} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function RemediationPanel({ state }) {
  if (!state || state.loading) return <p className="remediation-loading">Generating remediation guidance…</p>;
  if (state.error) return <p className="remediation-error">{state.error}</p>;
  return (
    <div className="remediation-panel">
      <p className="remediation-text">{state.text}</p>
      <span className="remediation-source">source: {state.source}</span>
    </div>
  );
}
