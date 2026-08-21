import { describe, it, expect } from "vitest";
import { detectNewCriticalFailures } from "../src/services/alerting/detectNewCriticalFailures.js";

const critFail = (id) => ({ id, category: "ssh", status: "fail", severity: "critical" });
const critPass = (id) => ({ id, category: "ssh", status: "pass", severity: "critical" });
const highFail = (id) => ({ id, category: "ssh", status: "fail", severity: "high" });

describe("detectNewCriticalFailures", () => {
  it("flags every critical failure when there is no previous report", () => {
    const current = [critFail("a"), critFail("b"), highFail("c")];
    expect(detectNewCriticalFailures([], current)).toEqual([critFail("a"), critFail("b")]);
    expect(detectNewCriticalFailures(undefined, current)).toEqual([critFail("a"), critFail("b")]);
  });

  it("does not re-flag a critical failure that was already failing last report", () => {
    const previous = [critFail("a")];
    const current = [critFail("a")];
    expect(detectNewCriticalFailures(previous, current)).toEqual([]);
  });

  it("flags a critical failure that newly appears alongside an already-known one", () => {
    const previous = [critFail("a")];
    const current = [critFail("a"), critFail("b")];
    expect(detectNewCriticalFailures(previous, current)).toEqual([critFail("b")]);
  });

  it("ignores non-critical severities regardless of status", () => {
    const previous = [];
    const current = [highFail("a"), { id: "b", category: "x", status: "fail", severity: "medium" }];
    expect(detectNewCriticalFailures(previous, current)).toEqual([]);
  });

  it("ignores critical findings that pass", () => {
    const previous = [];
    const current = [critPass("a")];
    expect(detectNewCriticalFailures(previous, current)).toEqual([]);
  });

  it("re-flags a critical failure that resolved and then recurred", () => {
    // previous report: "a" passed (it had failed even earlier, but that's
    // two reports back — this function only ever sees the immediately
    // prior report, by design, so it correctly treats this as new again).
    const previous = [critPass("a")];
    const current = [critFail("a")];
    expect(detectNewCriticalFailures(previous, current)).toEqual([critFail("a")]);
  });
});
