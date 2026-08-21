import { Fragment, useState } from "react";
import { Button } from "@heroui/react";
import { ApiError } from "../api/client";
import { getRemediation } from "../api/servers";
import { SeverityPill } from "./SeverityPill";

// Failing findings first, then errors (checks that couldn't run — still
// worth an operator's attention), then info, then pass.
const STATUS_ORDER = { fail: 0, error: 1, info: 2, pass: 3 };

const STATUS_TEXT_CLASS = {
  fail: "text-danger",
  pass: "text-success",
  error: "text-warning",
  info: "text-muted",
};

// A plain semantic <table> (Tailwind-styled), not HeroUI's Table component
// — the per-row expand-in-place remediation panel doesn't cleanly fit an
// accessible data-table's fixed row/column model, and HeroUI's docs don't
// confirm support for it. ServerListPage and ServerReportsPage, which are
// plain non-expanding grids, use the real Table component instead.
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
    return <p className="text-sm text-muted">No findings in the latest report.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-160 border-collapse text-sm">
        <thead>
          <tr>
            {["Status", "Severity", "Category", "Check", "Detail", ""].map((heading) => (
              <th
                key={heading || "actions"}
                className="border-b border-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((finding) => {
            const isFailing = finding.status === "fail";
            return (
              <Fragment key={finding.id}>
                <tr className="hover:bg-default/50">
                  <td
                    className={`border-b border-border px-3 py-2 align-top text-xs font-semibold uppercase ${STATUS_TEXT_CLASS[finding.status]}`}
                  >
                    {finding.status}
                  </td>
                  <td className="border-b border-border px-3 py-2 align-top">
                    <SeverityPill severity={finding.severity} />
                  </td>
                  <td className="border-b border-border px-3 py-2 align-top">{finding.category}</td>
                  <td className="border-b border-border px-3 py-2 align-top">
                    {finding.title || finding.id}
                    {!finding.scored && (
                      <span
                        className="ml-2 rounded border border-border px-1 text-[10px] text-muted"
                        title="No matching check definition on the backend"
                      >
                        unscored
                      </span>
                    )}
                  </td>
                  <td className="border-b border-border px-3 py-2 align-top text-muted">{finding.detail}</td>
                  <td className="border-b border-border px-3 py-2 align-top">
                    {isFailing && (
                      <Button size="sm" variant="tertiary" onPress={() => toggle(finding.id)}>
                        {expandedId === finding.id ? "Hide" : "Fix"}
                      </Button>
                    )}
                  </td>
                </tr>
                {expandedId === finding.id && (
                  <tr>
                    <td colSpan={6} className="border-b border-border bg-default/30 px-3 py-3">
                      <RemediationPanel state={remediation[finding.id]} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RemediationPanel({ state }) {
  if (!state || state.loading) return <p className="text-sm text-muted">Generating remediation guidance…</p>;
  if (state.error) return <p className="text-sm text-danger">{state.error}</p>;
  return (
    <div className="flex flex-col gap-1">
      <p className="whitespace-pre-wrap text-sm">{state.text}</p>
      <span className="text-xs text-muted">source: {state.source}</span>
    </div>
  );
}
