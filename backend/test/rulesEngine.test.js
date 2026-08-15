import { describe, it, expect } from "vitest";
import { scoreReport } from "../src/services/rulesEngine.js";

function defs(entries) {
  return new Map(Object.entries(entries));
}

describe("scoreReport", () => {
  it("gives a clean report a perfect score per category and overall", () => {
    const findings = [
      { id: "ssh-root-login", category: "ssh", title: "t", status: "pass", detail: "" },
      { id: "docker-socket-exposed", category: "docker", title: "t", status: "pass", detail: "" },
    ];
    const definitions = defs({
      "ssh-root-login": { category: "ssh", severityDefault: "critical" },
      "docker-socket-exposed": { category: "docker", severityDefault: "critical" },
    });

    const result = scoreReport(findings, definitions);
    expect(result.byCategory.ssh).toBe(100);
    expect(result.byCategory.docker).toBe(100);
    expect(result.overall).toBe(100);
    expect(result.unscoredCheckIds).toEqual([]);
  });

  it("deducts by severity only for failed checks", () => {
    const findings = [
      { id: "ssh-root-login", category: "ssh", title: "t", status: "fail", detail: "" }, // critical: -20
      { id: "ssh-port-default", category: "ssh", title: "t", status: "info", detail: "" }, // no penalty, info status
      { id: "sudo-broad-entries", category: "ssh", title: "t", status: "fail", detail: "" }, // medium: -5
    ];
    const definitions = defs({
      "ssh-root-login": { category: "ssh", severityDefault: "critical" },
      "ssh-port-default": { category: "ssh" }, // no severity — informational
      "sudo-broad-entries": { category: "ssh", severityDefault: "medium" },
    });

    const result = scoreReport(findings, definitions);
    expect(result.byCategory.ssh).toBe(75); // 100 - 20 - 5
  });

  it("floors a category at 0 rather than going negative", () => {
    const findings = ["a", "b", "c", "d", "e", "f"].map((id) => ({
      id,
      category: "persistence",
      title: "t",
      status: "fail",
      detail: "",
    }));
    const definitions = defs(
      Object.fromEntries(findings.map((f) => [f.id, { category: "persistence", severityDefault: "critical" }]))
    );

    const result = scoreReport(findings, definitions);
    expect(result.byCategory.persistence).toBe(0); // 6 * 20 = 120 penalty, floored at 0, not -20
  });

  it("computes a bad category and an untouched category independently — the whole point of per-category scoring", () => {
    const findings = [
      ...["a", "b", "c", "d", "e", "f"].map((id) => ({
        id,
        category: "persistence",
        title: "t",
        status: "fail",
        detail: "",
      })),
      { id: "ssh-root-login", category: "ssh", title: "t", status: "pass", detail: "" },
    ];
    const definitions = defs({
      a: { category: "persistence", severityDefault: "critical" },
      b: { category: "persistence", severityDefault: "critical" },
      c: { category: "persistence", severityDefault: "critical" },
      d: { category: "persistence", severityDefault: "critical" },
      e: { category: "persistence", severityDefault: "critical" },
      f: { category: "persistence", severityDefault: "critical" },
      "ssh-root-login": { category: "ssh", severityDefault: "critical" },
    });

    const result = scoreReport(findings, definitions);
    expect(result.byCategory.persistence).toBe(0);
    expect(result.byCategory.ssh).toBe(100); // unaffected by the persistence category collapsing
  });

  it("records unscored findings without guessing a severity for an unknown checkId", () => {
    const findings = [{ id: "some-future-check", category: "future", title: "t", status: "fail", detail: "" }];
    const definitions = defs({}); // backend hasn't been seeded with this checkId yet

    const result = scoreReport(findings, definitions);
    expect(result.unscoredCheckIds).toEqual(["some-future-check"]);
    expect(result.scoredFindings[0].scored).toBe(false);
    expect(result.scoredFindings[0].severity).toBeNull();
    // Falls back to the finding's own category since there's no definition to consult.
    expect(result.byCategory.future).toBe(100);
  });

  it("returns 100 overall for an empty finding set rather than NaN or 0", () => {
    const result = scoreReport([], defs({}));
    expect(result.overall).toBe(100);
    expect(result.byCategory).toEqual({});
  });
});
