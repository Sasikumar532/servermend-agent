import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button, Card } from "@heroui/react";
import { ApiError } from "../api/client";
import { confirmBaseline, getAlerts, getBaseline, getFindings, getServer } from "../api/servers";
import { FindingsTable } from "../components/FindingsTable";
import { ScoreBars } from "../components/ScoreBars";
import { SeverityPill } from "../components/SeverityPill";

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

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!server) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-7">
      <div>
        <Link to="/servers" className="text-sm text-muted hover:text-foreground">
          &larr; Servers
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{server.hostname ?? server.serverId}</h1>
        <p className="text-sm text-muted">
          agent {server.agentVersion ?? "unknown"} · last seen{" "}
          {server.lastSeenAt ? new Date(server.lastSeenAt).toLocaleString() : "never"}
        </p>
      </div>

      <Card>
        <Card.Header className="flex flex-row items-center justify-between">
          <Card.Title>Score</Card.Title>
          <Link to={`/servers/${server.serverId}/reports`} className="text-sm text-accent hover:underline">
            Report history &rarr;
          </Link>
        </Card.Header>
        <Card.Content>
          <ScoreBars score={score} />
        </Card.Content>
      </Card>

      {baseline?.pending && (
        <Card className="border-warning">
          <Card.Header>
            <Card.Title>Baseline drift awaiting confirmation</Card.Title>
            <Card.Description>
              Observed {baseline.pendingSince ? new Date(baseline.pendingSince).toLocaleString() : ""} — review
              before confirming, this becomes the new accepted baseline.
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <ul className="list-disc pl-5 text-sm">
              {Object.entries(baseline.diff ?? {}).map(([field, entries]) => (
                <li key={field}>
                  <strong>{field}</strong>
                  <ul className="list-disc pl-5">
                    {entries.map((entry) => (
                      <li key={entry}>{entry}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </Card.Content>
          <Card.Footer>
            <Button onPress={() => void handleConfirmBaseline()} isDisabled={confirming}>
              {confirming ? "Confirming…" : "Confirm as new baseline"}
            </Button>
          </Card.Footer>
        </Card>
      )}

      <Card>
        <Card.Header>
          <Card.Title>Findings</Card.Title>
        </Card.Header>
        <Card.Content>
          <FindingsTable serverId={server.serverId} findings={findings} />
        </Card.Content>
      </Card>

      <Card>
        <Card.Header>
          <Card.Title>Recent alerts</Card.Title>
        </Card.Header>
        <Card.Content>
          {alerts.length === 0 ? (
            <p className="text-sm text-muted">No alerts yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {alerts.map((alert) => (
                <li
                  key={alert._id}
                  className="flex items-center gap-3 border-b border-border pb-3 text-sm last:border-none last:pb-0"
                >
                  <SeverityPill severity={alert.severity} />
                  <span className="flex-1">{alert.title || alert.checkId}</span>
                  <span className="text-xs text-muted">
                    {new Date(alert.createdAt).toLocaleString()} · email: {alert.emailStatus}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}
