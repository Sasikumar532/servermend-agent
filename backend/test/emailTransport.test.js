import { describe, it, expect, afterEach } from "vitest";
import {
  sendCriticalFindingsEmail,
  _setTransportForTesting,
  _resetTransportForTesting,
} from "../src/services/alerting/emailTransport.js";

const server = { serverId: "s1", hostname: "web-1" };
const findings = [
  { id: "ssh-root-login", category: "ssh", title: "PermitRootLogin is yes", detail: "observed yes" },
];

afterEach(() => {
  _resetTransportForTesting();
});

describe("sendCriticalFindingsEmail", () => {
  it("returns skipped_no_smtp when no transport is configured", async () => {
    _setTransportForTesting(null); // simulates SMTP_HOST unset
    const result = await sendCriticalFindingsEmail({ toEmail: "owner@example.com", server, findings });
    expect(result).toEqual({ status: "skipped_no_smtp" });
  });

  it("returns skipped_no_smtp when there's a transport but no recipient email", async () => {
    _setTransportForTesting({ sendMail: async () => {} });
    const result = await sendCriticalFindingsEmail({ toEmail: null, server, findings });
    expect(result).toEqual({ status: "skipped_no_smtp" });
  });

  it("sends a real message shape and reports sent on success", async () => {
    let captured = null;
    _setTransportForTesting({
      sendMail: async (msg) => {
        captured = msg;
      },
    });

    const result = await sendCriticalFindingsEmail({ toEmail: "owner@example.com", server, findings });

    expect(result).toEqual({ status: "sent" });
    expect(captured.to).toBe("owner@example.com");
    expect(captured.subject).toContain("1 new critical finding");
    expect(captured.subject).toContain("web-1");
    expect(captured.text).toContain("ssh-root-login");
    expect(captured.text).toContain("observed yes");
  });

  it("reports failed with the error message when sendMail throws", async () => {
    _setTransportForTesting({
      sendMail: async () => {
        throw new Error("simulated SMTP connection refused");
      },
    });

    const result = await sendCriticalFindingsEmail({ toEmail: "owner@example.com", server, findings });
    expect(result.status).toBe("failed");
    expect(result.error).toContain("simulated SMTP connection refused");
  });
});
