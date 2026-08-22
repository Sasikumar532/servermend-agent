import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { getDashboardSummary } from "../api/dashboard";
import { Card } from "../components/Card";
import { scoreColorVar } from "../components/ScoreBars";
import { SeverityPill } from "../components/SeverityPill";

function StatCard({ label, value, sub, accent }) {
  return (
    <Card>
      <Card.Content className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
        <span className="text-3xl font-bold tabular-nums" style={accent ? { color: accent } : undefined}>
          {value}
        </span>
        {sub && <span className="text-xs text-muted">{sub}</span>}
      </Card.Content>
    </Card>
  );
}

export function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getDashboardSummary()
      .then((res) => {
        if (!cancelled) setSummary(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load dashboard.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (summary === null) return <p className="text-sm text-muted">Loading…</p>;

  const { servers, averageScore, needsAttention, openCriticals, lastIngestAt, checkDefinitionsActive } = summary;
  const { categoryCounts, recentActivity, attentionServers, recentlySeen } = summary;
  const categoryMax = categoryCounts.length ? Math.max(...categoryCounts.map((c) => c.count)) : 0;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted">
          {servers.total} server{servers.total === 1 ? "" : "s"}
          {lastIngestAt && <> &middot; last ingest {new Date(lastIngestAt).toLocaleString()}</>}
          {checkDefinitionsActive > 0 && <> &middot; {checkDefinitionsActive} check definitions active</>}
        </p>
      </div>

      {servers.total === 0 ? (
        <p className="text-sm text-muted">
          No servers registered yet.{" "}
          <Link to="/servers" className="text-accent hover:underline">
            Add your first server
          </Link>{" "}
          to see it here.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Servers" value={servers.total} sub={`${servers.reporting} reporting, ${servers.neverReported} never seen`} />
            <StatCard
              label="Average score"
              value={averageScore ?? "—"}
              accent={averageScore !== null ? scoreColorVar(averageScore) : undefined}
            />
            <StatCard
              label="Needs attention"
              value={needsAttention}
              sub="scoring below 70"
              accent={needsAttention > 0 ? "var(--danger)" : undefined}
            />
            <StatCard
              label="Open criticals"
              value={openCriticals}
              accent={openCriticals > 0 ? "var(--danger)" : undefined}
            />
          </div>

          {attentionServers.length > 0 && (
            <Card>
              <Card.Header>
                <Card.Title>Needs attention</Card.Title>
                <Card.Description>Servers scoring below 70, lowest first.</Card.Description>
              </Card.Header>
              <Card.Content>
                <ul className="flex flex-col gap-3">
                  {attentionServers.map((server) => (
                    <li
                      key={server.serverId}
                      className="flex items-center gap-3 border-b border-border pb-3 text-sm last:border-none last:pb-0"
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold tabular-nums"
                        style={{ borderColor: scoreColorVar(server.score) }}
                      >
                        {server.score}
                      </span>
                      <Link to={`/servers/${server.serverId}`} className="flex-1 text-accent hover:underline">
                        {server.hostname ?? server.serverId}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card.Content>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <Card.Header>
                <Card.Title>Recent activity</Card.Title>
              </Card.Header>
              <Card.Content>
                {recentActivity.length === 0 ? (
                  <p className="text-sm text-muted">No alerts yet.</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {recentActivity.map((a, i) => (
                      <li
                        key={`${a.serverId}-${a.checkId}-${i}`}
                        className="flex items-start gap-3 border-b border-border pb-3 text-sm last:border-none last:pb-0"
                      >
                        <SeverityPill severity={a.severity} />
                        <div className="flex-1">
                          <Link to={`/servers/${a.serverId}`} className="text-accent hover:underline">
                            {a.hostname}
                          </Link>
                          <span className="text-foreground"> — {a.title || a.checkId}</span>
                        </div>
                        <span className="whitespace-nowrap text-xs text-muted">
                          {new Date(a.createdAt).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card.Content>
            </Card>

            <Card>
              <Card.Header>
                <Card.Title>Findings by category</Card.Title>
              </Card.Header>
              <Card.Content>
                {categoryCounts.length === 0 ? (
                  <p className="text-sm text-muted">No failing checks across the fleet.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {categoryCounts.map((c) => (
                      <li key={c.category} className="grid grid-cols-[90px_1fr_28px] items-center gap-3 text-sm">
                        <span className="capitalize text-muted">{c.category}</span>
                        <div className="h-2 overflow-hidden rounded-full bg-default">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.round((c.count / categoryMax) * 100)}%`,
                              backgroundColor: c.count > 4 ? "var(--danger)" : "var(--accent)",
                            }}
                          />
                        </div>
                        <span className="text-right tabular-nums">{c.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card.Content>
            </Card>
          </div>

          {recentlySeen.length > 0 && (
            <Card>
              <Card.Header>
                <Card.Title>Recently active</Card.Title>
              </Card.Header>
              <Card.Content>
                <ul className="flex flex-col gap-3">
                  {recentlySeen.map((server) => (
                    <li
                      key={server.serverId}
                      className="flex items-center justify-between gap-3 border-b border-border pb-3 text-sm last:border-none last:pb-0"
                    >
                      <Link to={`/servers/${server.serverId}`} className="text-accent hover:underline">
                        {server.hostname ?? server.serverId}
                      </Link>
                      <span className="text-xs text-muted">{new Date(server.lastSeenAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </Card.Content>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
