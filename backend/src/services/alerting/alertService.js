import { Alert } from "../../models/Alert.js";
import { sendCriticalFindingsEmail } from "./emailTransport.js";

// Sends one email per triggering report (not one per finding — a report
// with three new critical findings should be one inbox item, not three)
// but persists one Alert row per finding, so the dashboard can list and
// filter them individually. Never throws: a report ingestion request
// should succeed even if alerting has a problem, same principle as the
// baseline push on the agent side being best-effort.
//
// @param {{server: object, ownerEmail: string|null, report: object, findings: object[]}} args
export async function triggerCriticalFindingAlerts({ server, ownerEmail, report, findings }) {
  if (findings.length === 0) return;

  const emailResult = await sendCriticalFindingsEmail({ toEmail: ownerEmail, server, findings });

  await Alert.insertMany(
    findings.map((f) => ({
      serverId: server.serverId,
      reportId: report._id,
      checkId: f.id,
      category: f.category,
      title: f.title,
      detail: f.detail,
      severity: f.severity,
      emailStatus: emailResult.status,
      emailError: emailResult.error,
    }))
  );
}
