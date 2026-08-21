import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { listServers } from "../api/servers";

export function ServerListPage() {
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

  if (error) return <p className="form-error">{error}</p>;
  if (servers === null) return <p>Loading…</p>;

  return (
    <div>
      <h1>Servers</h1>
      {servers.length === 0 ? (
        <p className="empty-state">
          No servers registered yet. Register one from the API (<code>POST /servers</code>) and install the agent
          with the returned API key to get started.
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
    </div>
  );
}
