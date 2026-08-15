import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../config/env.js";

// Haiku is deliberately chosen here: remediation text is a short,
// low-stakes explanation grounded in data we already have (rationale +
// fix command from checkCatalog), not open-ended reasoning — no need to
// pay for a bigger model.
const MODEL = "claude-haiku-4-5";

let realClient = null;
// `undefined` = no override (use the real env-driven client below);
// anything else (including `null`) = explicit test override. Lets tests
// force both the "LLM call succeeds" and "LLM call throws" branches
// without a real API key or network access.
let testClient;

export function _setClientForTesting(client) {
  testClient = client;
}

export function _resetClientForTesting() {
  testClient = undefined;
}

function resolveClient() {
  if (testClient !== undefined) return testClient;
  if (!env.anthropicApiKey) return null;
  if (!realClient) realClient = new Anthropic({ apiKey: env.anthropicApiKey });
  return realClient;
}

// The deterministic fallback. Used whenever no API key is configured, or
// the LLM call fails for any reason — the remediation endpoint must never
// go dark just because an external service is unavailable, and everything
// this needs is already sitting in CheckDefinition.
function templateExplanation(finding, checkDefinition) {
  const rationale = checkDefinition?.rationale ?? "This check failed; no further detail is on file.";
  const fix =
    checkDefinition?.fixCommandsByDistro?.generic ??
    "No fix command is on file for this check — consult the reference material below.";
  const reference = checkDefinition?.reference ? `\n\nReference: ${checkDefinition.reference}` : "";
  const detail = finding?.detail ? `\n\nObserved: ${finding.detail}` : "";
  return `${rationale}${detail}\n\nSuggested fix:\n${fix}${reference}`;
}

function buildPrompt(finding, checkDefinition) {
  return [
    "A security audit check failed on a server. Explain the risk in plain language and give the operator a concrete next step, in 3-5 sentences.",
    "Do not invent commands beyond what's given below unless clearly safe and standard.",
    "",
    `Check: ${checkDefinition?.title ?? finding.id} (category: ${finding.category})`,
    `Severity: ${finding.severity ?? "unknown"}`,
    `Finding detail: ${finding.detail || "(no detail provided)"}`,
    `Known rationale: ${checkDefinition?.rationale ?? "(none on file)"}`,
    `Known fix command (generic): ${checkDefinition?.fixCommandsByDistro?.generic ?? "(none on file)"}`,
  ].join("\n");
}

/**
 * @param {{finding: object, checkDefinition: object|null}} args
 * @returns {Promise<{source: "llm"|"template", explanation: string}>}
 */
export async function explainFinding({ finding, checkDefinition }) {
  const client = resolveClient();
  if (!client) {
    return { source: "template", explanation: templateExplanation(finding, checkDefinition) };
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: buildPrompt(finding, checkDefinition) }],
    });
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || !textBlock.text.trim()) {
      throw new Error("model returned no text content");
    }
    return { source: "llm", explanation: textBlock.text.trim() };
  } catch (err) {
    console.error("remediation LLM call failed, falling back to template:", err.message);
    return { source: "template", explanation: templateExplanation(finding, checkDefinition) };
  }
}
