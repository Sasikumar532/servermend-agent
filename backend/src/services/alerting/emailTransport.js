import nodemailer from "nodemailer";
import { env } from "../../config/env.js";

let realTransport = null;
// `undefined` = no override (use the real SMTP-config-driven transport
// below); anything else (including `null`) = explicit test override —
// same pattern as remediationClient.js's testClient, for the same reason:
// lets tests exercise both "SMTP not configured" and "send throws"
// without a real mail server.
let testTransport;

export function _setTransportForTesting(transport) {
  testTransport = transport;
}

export function _resetTransportForTesting() {
  testTransport = undefined;
}

function resolveTransport() {
  if (testTransport !== undefined) return testTransport;
  if (!env.smtp.host) return null;
  if (!realTransport) {
    realTransport = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return realTransport;
}

function buildBody(server, findings) {
  // Includes checkId alongside title — the recipient needs it to find the
  // finding on the dashboard, and a title alone isn't always unique or
  // even present (title defaults to "" on ScoredFinding — see Report.js).
  const lines = findings.map(
    (f) => `  - [${f.category}] ${f.id}${f.title ? ` — ${f.title}` : ""}: ${f.detail || "(no detail)"}`
  );
  return [
    `${findings.length} new critical finding(s) on ${server.hostname || server.serverId}:`,
    "",
    ...lines,
    "",
    "Review and remediate from the ServerMend dashboard.",
  ].join("\n");
}

/**
 * @param {{toEmail: string|null|undefined, server: object, findings: object[]}} args
 * @returns {Promise<{status: "sent"|"failed"|"skipped_no_smtp", error?: string}>}
 */
export async function sendCriticalFindingsEmail({ toEmail, server, findings }) {
  const transport = resolveTransport();
  if (!transport || !toEmail) {
    return { status: "skipped_no_smtp" };
  }

  try {
    await transport.sendMail({
      from: env.smtp.from,
      to: toEmail,
      subject: `[ServerMend] ${findings.length} new critical finding(s) on ${server.hostname || server.serverId}`,
      text: buildBody(server, findings),
    });
    return { status: "sent" };
  } catch (err) {
    console.error("alert email send failed, recording as failed:", err.message);
    return { status: "failed", error: err.message };
  }
}
