import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { listFleetFindings } from "../api/findings";
import { SeverityPill } from "../components/SeverityPill";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "critical", label: "Critical" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
];

export function FindingsPage() {
  const [findings, setFindings] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    listFleetFindings()
      .then((res) => {
        if (!cancelled) setFindings(res.findings);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load findings.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!findings) return [];
    if (filter === "all") return findings;
    return findings.filter((f) => f.severity === filter);
  }, [findings, filter]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (findings === null) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Findings</h1>
        <p className="text-sm text-muted">
          Every failing check across the fleet, worst first. {findings.length} open.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f.id
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-surface text-muted hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">
          {findings.length === 0
            ? "Nothing failing across the fleet right now."
            : "Nothing at this severity right now."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {filtered.map((f) => (
            <div
              key={`${f.serverId}-${f.checkId}`}
              className="grid grid-cols-[96px_1fr_auto] items-center gap-4 border-b border-border px-5 py-4 last:border-none sm:grid-cols-[96px_1fr_180px_100px]"
            >
              <SeverityPill severity={f.severity} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="truncate text-sm font-medium">{f.title || f.checkId}</div>
                <div className="truncate font-mono text-xs text-muted">{f.checkId}</div>
              </div>
              <Link
                to={`/servers/${f.serverId}`}
                className="hidden truncate text-sm font-medium text-accent hover:underline sm:block"
              >
                {f.hostname ?? f.serverId}
              </Link>
              <div className="col-span-3 flex items-center justify-between gap-3 sm:col-span-1 sm:justify-end">
                <Link
                  to={`/servers/${f.serverId}`}
                  className="truncate text-sm font-medium text-accent hover:underline sm:hidden"
                >
                  {f.hostname ?? f.serverId}
                </Link>
                {/* A styled Link, not a Button nested inside one — this
                    is real navigation (ctrl/right-click should work like
                    any other link), not an action button. */}
                <Link
                  to={`/servers/${f.serverId}?tab=findings`}
                  className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
                >
                  Fix
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
