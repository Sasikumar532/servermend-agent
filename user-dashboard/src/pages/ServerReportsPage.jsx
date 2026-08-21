import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Table } from "@heroui/react";
import { ApiError } from "../api/client";
import { getReports } from "../api/servers";

export function ServerReportsPage() {
  const { serverId } = useParams();
  const [reports, setReports] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getReports(serverId)
      .then((res) => {
        if (!cancelled) setReports(res.reports);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load report history.");
      });
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (reports === null) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <Link to={`/servers/${serverId}`} className="text-sm text-muted hover:text-foreground">
        &larr; Server
      </Link>
      <h1 className="text-2xl font-semibold">Report history</h1>
      {reports.length === 0 ? (
        <p className="text-sm text-muted">No reports received yet.</p>
      ) : (
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Report history" className="min-w-120">
              <Table.Header>
                <Table.Column isRowHeader>Received</Table.Column>
                <Table.Column>Agent version</Table.Column>
                <Table.Column>Overall score</Table.Column>
              </Table.Header>
              <Table.Body>
                {reports.map((report) => (
                  <Table.Row key={report._id}>
                    <Table.Cell>{new Date(report.receivedAt).toLocaleString()}</Table.Cell>
                    <Table.Cell>{report.agentVersion}</Table.Cell>
                    <Table.Cell>{report.score.overall}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      )}
    </div>
  );
}
