import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { listServers } from "../api/servers";
import { AddServerModal } from "../components/AddServerModal";

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

  if (error) return <p className="form-error">{error}</p>;
  if (servers === null) return <p>Loading…</p>;

  return (
    <div>
      <div className="page-header">
        <h1>Servers</h1>
        <button type="button" onClick={() => setShowAddModal(true)}>
          Add server
        </button>
      </div>
      {servers.length === 0 ? (
        <p className="empty-state">
          No servers registered yet.{" "}
          <button type="button" className="link-button" onClick={() => setShowAddModal(true)}>
            Add your first server
          </button>{" "}
          to get started.
        </p>
      ) : (
        <table className="server-list-table">
          <thead>
            <tr>
              <th>Hostname</th>
              <th>Score</th>
              <th>Agent version</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {servers.map((server) => (
              <tr key={server.serverId}>
                <td>
                  <Link to={`/servers/${server.serverId}`}>{server.hostname ?? server.serverId}</Link>
                </td>
                <td>{server.score ? server.score.overall : "—"}</td>
                <td>{server.agentVersion ?? "—"}</td>
                <td>{server.lastSeenAt ? new Date(server.lastSeenAt).toLocaleString() : "never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showAddModal && (
        <AddServerModal onClose={() => setShowAddModal(false)} onCreated={() => setRefreshKey((k) => k + 1)} />
      )}
    </div>
  );
}
