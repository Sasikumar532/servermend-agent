import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@heroui/react";
import { ApiError } from "../api/client";
import { listServers } from "../api/servers";
import { scoreColorVar } from "../components/ScoreBars";

const ATTENTION_THRESHOLD = 70;

function StatCard({ label, value, accent }) {
  return (
    <Card>
      <Card.Content className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
        <span className="text-3xl font-bold tabular-nums" style={accent ? { color: accent } : undefined}>
          {value}
        </span>
      </Card.Content>
    </Card>
  );
}

export function DashboardPage() {
  const [servers, setServers] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listServers()
      .then((res) => {
        if (!cancelled) setServers(res.servers);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load servers.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (servers === null) return <p className="text-sm text-muted">Loading…</p>;

  const scored = servers.filter((s) => s.score);
  const avgScore = scored.length
    ? Math.round(scored.reduce((sum, s) => sum + s.score.overall, 0) / scored.length)
    : null;
  const needsAttention = scored
    .filter((s) => s.score.overall < ATTENTION_THRESHOLD)
    .sort((a, b) => a.score.overall - b.score.overall);
  const neverReported = servers.filter((s) => !s.score);
  const recentlySeen = servers
    .filter((s) => s.lastSeenAt)
    .sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt))
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-7">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Servers" value={servers.length} />
        <StatCard label="Average score" value={avgScore ?? "—"} accent={avgScore !== null ? scoreColorVar(avgScore) : undefined} />
        <StatCard
          label="Needs attention"
          value={needsAttention.length}
          accent={needsAttention.length > 0 ? "var(--danger)" : undefined}
        />
        <StatCard label="Never reported" value={neverReported.length} />
      </div>

      {servers.length === 0 && (
        <p className="text-sm text-muted">
          No servers registered yet.{" "}
          <Link to="/servers" className="text-accent hover:underline">
            Add your first server
          </Link>{" "}
          to see it here.
        </p>
      )}

      {needsAttention.length > 0 && (
        <Card>
          <Card.Header>
            <Card.Title>Needs attention</Card.Title>
            <Card.Description>Servers scoring below {ATTENTION_THRESHOLD}, lowest first.</Card.Description>
          </Card.Header>
          <Card.Content>
            <ul className="flex flex-col gap-3">
              {needsAttention.map((server) => (
                <li
                  key={server.serverId}
                  className="flex items-center gap-3 border-b border-border pb-3 text-sm last:border-none last:pb-0"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold tabular-nums"
                    style={{ borderColor: scoreColorVar(server.score.overall) }}
                  >
                    {server.score.overall}
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
    </div>
  );
}
