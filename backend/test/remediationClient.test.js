import { describe, it, expect, afterEach } from "vitest";
import {
  explainFinding,
  _setClientForTesting,
  _resetClientForTesting,
} from "../src/services/llm/remediationClient.js";

const finding = {
  id: "ssh-root-login",
  category: "ssh",
  severity: "critical",
  detail: "PermitRootLogin yes",
};

const checkDefinition = {
  title: "PermitRootLogin is yes in sshd_config",
  rationale: "Direct root SSH access is the #1 target for automated brute-force bots.",
  reference: "man sshd_config",
  fixCommandsByDistro: { generic: "sed -i ... sshd_config && systemctl restart sshd" },
};

afterEach(() => {
  _resetClientForTesting();
});

describe("explainFinding", () => {
  it("falls back to the deterministic template when no client is configured", async () => {
    _setClientForTesting(null); // simulates ANTHROPIC_API_KEY unset
    const result = await explainFinding({ finding, checkDefinition });
    expect(result.source).toBe("template");
    expect(result.explanation).toContain(checkDefinition.rationale);
    expect(result.explanation).toContain(checkDefinition.fixCommandsByDistro.generic);
    expect(result.explanation).toContain(checkDefinition.reference);
  });

  it("still produces a usable template when the finding has no matching CheckDefinition", async () => {
    _setClientForTesting(null);
    const result = await explainFinding({ finding, checkDefinition: null });
    expect(result.source).toBe("template");
    expect(result.explanation).toContain("No fix command is on file");
  });

  it("returns the LLM's text and marks source as llm on a successful call", async () => {
    _setClientForTesting({
      messages: {
        create: async () => ({
          content: [{ type: "text", text: "  Disable password-based root SSH login.  " }],
        }),
      },
    });
    const result = await explainFinding({ finding, checkDefinition });
    expect(result.source).toBe("llm");
    expect(result.explanation).toBe("Disable password-based root SSH login.");
  });

  it("falls back to the template if the LLM call throws", async () => {
    _setClientForTesting({
      messages: {
        create: async () => {
          throw new Error("simulated network failure");
        },
      },
    });
    const result = await explainFinding({ finding, checkDefinition });
    expect(result.source).toBe("template");
    expect(result.explanation).toContain(checkDefinition.rationale);
  });

  it("falls back to the template if the LLM returns no text content", async () => {
    _setClientForTesting({
      messages: {
        create: async () => ({ content: [{ type: "tool_use", input: {} }] }),
      },
    });
    const result = await explainFinding({ finding, checkDefinition });
    expect(result.source).toBe("template");
  });
});
