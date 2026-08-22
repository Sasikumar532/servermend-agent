import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import {
  confirmBaseline,
  deleteServer,
  getAlerts,
  getBaseline,
  getFindings,
  getReports,
  getServer,
  updateServer,
} from "../api/servers";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Field, TextInput } from "../components/Field";
import { FindingsTable } from "../components/FindingsTable";
import { ScoreBars } from "../components/ScoreBars";
import { SeverityPill } from "../components/SeverityPill";
import { Tabs } from "../components/Tabs";
import { useToast } from "../components/Toast";

const SERVER_TABS = [
  { id: "overview", label: "Overview" },
  { id: "findings", label: "Findings" },
  { id: "reports", label: "Reports" },
  { id: "baseline", label: "Baseline" },
  { id: "settings", label: "Settings" },
];

const BASELINE_FIELD_LABELS = {
  authorizedKeys: "Authorized keys",
  systemCronEntries: "System cron entries",
  userCronEntries: "User cron entries",
  systemdUnits: "Systemd units",
  suidBinaries: "SUID binaries",
};

function BaselineGroups({ snapshot }) {
  const groups = Object.entries(BASELINE_FIELD_LABELS)
    .map(([field, label]) => ({ field, label, entries: snapshot[field] ?? [] }))
    .filter((g) => g.entries.length > 0);

  if (groups.length === 0) {
    return <p className="text-sm text-muted">Nothing recorded in any tracked field.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.field} className="flex flex-col gap-2">
          <div className="font-mono text-xs font-semibold text-muted">
            {g.label} &middot; {g.entries.length}
          </div>
          {g.entries.map((entry) => (
            <div key={entry} className="break-all font-mono text-xs text-foreground">
              {entry}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function PendingDriftGroups({ diff }) {
  return (
    <div className="flex flex-col gap-3">
      {Object.entries(diff ?? {}).map(([field, entries]) => (
        <div key={field} className="flex flex-col gap-2">
          <div className="font-mono text-xs font-semibold text-foreground">{field}</div>
          {entries.map((entry) => (
            <div
              key={entry}
              className="break-all rounded-lg border border-border bg-overlay px-3 py-2 font-mono text-xs text-foreground"
            >
              {entry}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function ServerDetailPage() {
  const { serverId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [tab, setTab] = useState("overview");
  const [server, setServer] = useState(null);
  const [findings, setFindings] = useState([]);
  const [score, setScore] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [reports, setReports] = useState([]);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const [hostnameDraft, setHostnameDraft] = useState("");
  const [savingHostname, setSavingHostname] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const loadAll = useCallback(async () => {
    if (!serverId) return;
    try {
      const [serverRes, findingsRes, baselineRes, alertsRes, reportsRes] = await Promise.all([
        getServer(serverId),
        getFindings(serverId),
        getBaseline(serverId),
        getAlerts(serverId),
        getReports(serverId),
      ]);
      setServer(serverRes);
      setHostnameDraft(serverRes.hostname ?? "");
      setFindings(findingsRes.findings);
      // findingsRes.score reflects the same latest report as the findings
      // list; serverRes.score is the same value duplicated on the server
      // summary. Prefer the findings response since it's paired with the
      // findings actually being displayed.
      setScore(findingsRes.score ?? serverRes.score);
      setBaseline(baselineRes);
      setAlerts(alertsRes.alerts);
      setReports(reportsRes.reports);
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
      showToast("Baseline confirmed.", { type: "success" });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to confirm baseline.", { type: "error" });
    } finally {
      setConfirming(false);
    }
  }

  async function handleSaveHostname(event) {
    event.preventDefault();
    setSavingHostname(true);
    try {
      const result = await updateServer(serverId, { hostname: hostnameDraft });
      setServer((prev) => (prev ? { ...prev, hostname: result.hostname } : prev));
      setHostnameDraft(result.hostname ?? "");
      showToast("Hostname updated.", { type: "success" });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to update hostname.", { type: "error" });
    } finally {
      setSavingHostname(false);
    }
  }

  async function handleRemoveServer() {
    setRemoving(true);
    try {
      await deleteServer(serverId);
      showToast("Server removed.", { type: "success" });
      navigate("/servers");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to remove server.", { type: "error" });
      setRemoving(false);
      setConfirmingRemove(false);
    }
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!server) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-6">
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

      <Tabs tabs={SERVER_TABS} value={tab} onChange={setTab} aria-label="Server sections" />

      {tab === "overview" && (
        <div className="flex flex-col gap-6 pt-5">
          <Card>
            <Card.Header className="flex flex-row items-center justify-between">
              <Card.Title>Score</Card.Title>
              <button type="button" onClick={() => setTab("reports")} className="text-sm text-accent hover:underline">
                Report history &rarr;
              </button>
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
              <Card.Footer className="flex gap-2">
                <Button onClick={() => void handleConfirmBaseline()} disabled={confirming}>
                  {confirming ? "Confirming…" : "Confirm as new baseline"}
                </Button>
                <Button variant="outline" onClick={() => setTab("baseline")}>
                  Open full baseline
                </Button>
              </Card.Footer>
            </Card>
          )}

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
      )}

      {tab === "findings" && (
        <div className="pt-5">
          <Card>
            <Card.Header>
              <Card.Title>Findings</Card.Title>
            </Card.Header>
            <Card.Content>
              <FindingsTable serverId={server.serverId} findings={findings} />
            </Card.Content>
          </Card>
        </div>
      )}

      {tab === "reports" && (
        <div className="pt-5">
          {reports.length === 0 ? (
            <p className="text-sm text-muted">No reports received yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full min-w-160 border-collapse text-sm">
                <thead>
                  <tr>
                    {["Received", "Agent version", "Overall score", "Failing checks"].map((heading) => (
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
                  {reports.map((report) => (
                    <tr key={report._id} className="hover:bg-default/50">
                      <td className="border-b border-border px-5 py-3">
                        {new Date(report.receivedAt).toLocaleString()}
                      </td>
                      <td className="border-b border-border px-5 py-3 font-mono text-xs text-muted">
                        {report.agentVersion}
                      </td>
                      <td className="border-b border-border px-5 py-3 tabular-nums">{report.score.overall}</td>
                      <td className="border-b border-border px-5 py-3 tabular-nums">{report.failingCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "baseline" && (
        <div className="grid grid-cols-1 gap-5 pt-5 lg:grid-cols-2">
          <Card>
            <Card.Header>
              <Card.Title>Confirmed baseline</Card.Title>
              <Card.Description>Captured on first agent run, promoted by a human since.</Card.Description>
            </Card.Header>
            <Card.Content>
              {baseline?.confirmed ? (
                <BaselineGroups snapshot={baseline.confirmed} />
              ) : (
                <p className="text-sm text-muted">No confirmed baseline yet — waiting on the agent&apos;s first run.</p>
              )}
            </Card.Content>
          </Card>

          <Card className={baseline?.pending ? "border-warning" : undefined}>
            <Card.Header>
              <Card.Title className={baseline?.pending ? "text-warning" : undefined}>Pending drift</Card.Title>
              <Card.Description>Pushed by the agent on every run; never auto-applied.</Card.Description>
            </Card.Header>
            <Card.Content>
              {baseline?.pending ? (
                <PendingDriftGroups diff={baseline.diff} />
              ) : (
                <p className="text-sm text-muted">Nothing pending — the last observed run matched the baseline.</p>
              )}
            </Card.Content>
            {baseline?.pending && (
              <Card.Footer>
                <Button onClick={() => void handleConfirmBaseline()} disabled={confirming}>
                  {confirming ? "Confirming…" : "Confirm as new baseline"}
                </Button>
              </Card.Footer>
            )}
          </Card>
        </div>
      )}

      {tab === "settings" && (
        <div className="flex max-w-180 flex-col gap-5 pt-5">
          <Card>
            <Card.Header>
              <Card.Title>Server settings</Card.Title>
            </Card.Header>
            <Card.Content>
              <form id="server-settings-form" onSubmit={handleSaveHostname}>
                <Field label="Display hostname">
                  <TextInput value={hostnameDraft} onChange={setHostnameDraft} name="hostname" placeholder="web-1.example.com" />
                </Field>
              </form>
            </Card.Content>
            <Card.Footer className="justify-end">
              <Button type="submit" form="server-settings-form" disabled={savingHostname}>
                {savingHostname ? "Saving…" : "Save changes"}
              </Button>
            </Card.Footer>
          </Card>

          <Card className="border-danger">
            <Card.Header>
              <Card.Title className="text-danger">Remove server</Card.Title>
              <Card.Description>Revokes the API key and deletes all reports. Not reversible.</Card.Description>
            </Card.Header>
            <Card.Footer className="justify-end gap-2">
              {confirmingRemove ? (
                <>
                  <Button variant="outline" onClick={() => setConfirmingRemove(false)} disabled={removing}>
                    Cancel
                  </Button>
                  <Button variant="danger" onClick={() => void handleRemoveServer()} disabled={removing}>
                    {removing ? "Removing…" : "Confirm remove"}
                  </Button>
                </>
              ) : (
                <Button variant="danger" onClick={() => setConfirmingRemove(true)}>
                  Remove
                </Button>
              )}
            </Card.Footer>
          </Card>
        </div>
      )}
    </div>
  );
}
