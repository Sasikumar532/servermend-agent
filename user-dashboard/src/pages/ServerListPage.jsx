import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { listServers } from "../api/servers";
import { AddServerModal } from "../components/AddServerModal";
import { Button } from "../components/Button";

export function ServerListPage() {
  const [servers, setServers] = useState(null);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  // Bumped after a server is registered to re-trigger the fetch below —
  // simpler than lifting the fetch into a separately-called function while
  // still keeping the mount-cancellation guard.
  const [refreshKey, setRefreshKey] = useState(0);

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
  }, [refreshKey]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (servers === null) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Servers</h1>
        <Button onClick={() => setShowAddModal(true)}>Add server</Button>
      </div>
      {servers.length === 0 ? (
        <p className="text-sm text-muted">
          No servers registered yet.{" "}
          <button type="button" className="text-accent hover:underline" onClick={() => setShowAddModal(true)}>
            Add your first server
          </button>{" "}
          to get started.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-160 border-collapse text-sm">
            <thead>
              <tr>
                {["Hostname", "Score", "Agent version", "Last seen"].map((heading) => (
                  <th
                    key={heading}
                    className="border-b border-border px-5 py-3 text-left text-xs font-semibold tracking-wide text-muted uppercase"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {servers.map((server) => (
                <tr key={server.serverId} className="hover:bg-default/50">
                  <td className="border-b border-border px-5 py-3">
                    <Link to={`/servers/${server.serverId}`} className="font-medium text-accent hover:underline">
                      {server.hostname ?? server.serverId}
                    </Link>
                  </td>
                  <td className="border-b border-border px-5 py-3 tabular-nums">
                    {server.score ? server.score.overall : "—"}
                  </td>
                  <td className="border-b border-border px-5 py-3 font-mono text-xs text-muted">
                    {server.agentVersion ?? "—"}
                  </td>
                  <td className="border-b border-border px-5 py-3 text-muted">
                    {server.lastSeenAt ? new Date(server.lastSeenAt).toLocaleString() : "never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showAddModal && (
        <AddServerModal onClose={() => setShowAddModal(false)} onCreated={() => setRefreshKey((k) => k + 1)} />
      )}
    </div>
  );
}
