import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
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

  if (error) return <p className="form-error">{error}</p>;
  if (reports === null) return <p>Loading…</p>;

  return (
    <div>
      <Link to={`/servers/${serverId}`} className="back-link">
        &larr; Server
      </Link>
      <h1>Report history</h1>
      {reports.length === 0 ? (
        <p className="empty-state">No reports received yet.</p>
      ) : (
        <table className="server-list-table">
          <thead>
            <tr>
              <th>Received</th>
              <th>Agent version</th>
              <th>Overall score</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report._id}>
                <td>{new Date(report.receivedAt).toLocaleString()}</td>
                <td>{report.agentVersion}</td>
                <td>{report.score.overall}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
