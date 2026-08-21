import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Table } from "@heroui/react";
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

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (servers === null) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Servers</h1>
        <Button onPress={() => setShowAddModal(true)}>Add server</Button>
      </div>
      {servers.length === 0 ? (
        <p className="text-sm text-muted">
          No servers registered yet.{" "}
          <button
            type="button"
            className="text-accent hover:underline"
            onClick={() => setShowAddModal(true)}
          >
            Add your first server
          </button>{" "}
          to get started.
        </p>
      ) : (
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Servers" className="min-w-160">
              <Table.Header>
                <Table.Column isRowHeader>Hostname</Table.Column>
                <Table.Column>Score</Table.Column>
                <Table.Column>Agent version</Table.Column>
                <Table.Column>Last seen</Table.Column>
              </Table.Header>
              <Table.Body>
                {servers.map((server) => (
                  <Table.Row key={server.serverId}>
                    <Table.Cell>
                      <Link to={`/servers/${server.serverId}`} className="text-accent hover:underline">
                        {server.hostname ?? server.serverId}
                      </Link>
                    </Table.Cell>
                    <Table.Cell>{server.score ? server.score.overall : "—"}</Table.Cell>
                    <Table.Cell>{server.agentVersion ?? "—"}</Table.Cell>
                    <Table.Cell>
                      {server.lastSeenAt ? new Date(server.lastSeenAt).toLocaleString() : "never"}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      )}
      {showAddModal && (
        <AddServerModal onClose={() => setShowAddModal(false)} onCreated={() => setRefreshKey((k) => k + 1)} />
      )}
    </div>
  );
}
