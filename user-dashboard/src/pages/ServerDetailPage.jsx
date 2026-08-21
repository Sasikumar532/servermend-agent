import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { confirmBaseline, getAlerts, getBaseline, getFindings, getServer } from "../api/servers";
import { FindingsTable } from "../components/FindingsTable";
import { ScoreBars } from "../components/ScoreBars";

export function ServerDetailPage() {
  const { serverId } = useParams();
  const [server, setServer] = useState(null);
  const [findings, setFindings] = useState([]);
  const [score, setScore] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const loadAll = useCallback(async () => {
    if (!serverId) return;
    try {
      const [serverRes, findingsRes, baselineRes, alertsRes] = await Promise.all([
        getServer(serverId),
        getFindings(serverId),
        getBaseline(serverId),
        getAlerts(serverId),
      ]);
      setServer(serverRes);
      setFindings(findingsRes.findings);
      // findingsRes.score reflects the same latest report as the findings
      // list; serverRes.score is the same value duplicated on the server
      // summary. Prefer the findings response since it's paired with the
      // findings actually being displayed.
      setScore(findingsRes.score ?? serverRes.score);
      setBaseline(baselineRes);
      setAlerts(alertsRes.alerts);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load server.");
    }
  }, [serverId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function handleConfirmBaseline() {
    if (!serverId) return;
    setConfirming(true);
    try {
      await confirmBaseline(serverId);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to confirm baseline.");
    } finally {
      setConfirming(false);
    }
  }

  if (error) return <p className="form-error">{error}</p>;
  if (!server) return <p>Loading…</p>;

  return (
    <div>
      <Link to="/servers" className="back-link">
        &larr; Servers
      </Link>
      <h1>{server.hostname ?? server.serverId}</h1>
      <p className="server-meta">
        agent {server.agentVersion ?? "unknown"} · last seen{" "}
        {server.lastSeenAt ? new Date(server.lastSeenAt).toLocaleString() : "never"}
      </p>

      <section>
        <h2>Score</h2>
        <ScoreBars score={score} />
      </section>

      {baseline?.pending && (
        <section className="drift-review">
          <h2>Baseline drift awaiting confirmation</h2>
          <p className="drift-meta">
            Observed {baseline.pendingSince ? new Date(baseline.pendingSince).toLocaleString() : ""} — review before
            confirming, this becomes the new accepted baseline.
          </p>
          <ul className="drift-diff-list">
            {Object.entries(baseline.diff ?? {}).map(([field, entries]) => (
              <li key={field}>
                <strong>{field}</strong>
                <ul>
                  {entries.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => void handleConfirmBaseline()} disabled={confirming}>
            {confirming ? "Confirming…" : "Confirm as new baseline"}
          </button>
        </section>
      )}

      <section>
        <h2>Findings</h2>
        <FindingsTable serverId={server.serverId} findings={findings} />
      </section>

      <section>
        <h2>Recent alerts</h2>
        {alerts.length === 0 ? (
          <p className="empty-state">No alerts yet.</p>
        ) : (
          <ul className="alert-list">
            {alerts.map((alert) => (
              <li key={alert._id} className="alert-list-item">
                <span className={`pill pill-${alert.severity}`}>{alert.severity}</span>
                <span className="alert-title">{alert.title || alert.checkId}</span>
                <span className="alert-meta">
                  {new Date(alert.createdAt).toLocaleString()} · email: {alert.emailStatus}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
