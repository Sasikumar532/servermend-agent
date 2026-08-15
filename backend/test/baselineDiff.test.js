import { describe, it, expect } from "vitest";
import { diffBaseline, hasDrift } from "../src/services/baselineDiff.js";

describe("diffBaseline", () => {
  it("returns an empty object when observed matches confirmed exactly", () => {
    const confirmed = { authorizedKeys: ["alice:abc"], systemdUnits: ["nginx.service"] };
    const observed = { authorizedKeys: ["alice:abc"], systemdUnits: ["nginx.service"] };
    expect(diffBaseline(confirmed, observed)).toEqual({});
    expect(hasDrift(diffBaseline(confirmed, observed))).toBe(false);
  });

  it("flags additions but not removals, per field", () => {
    const confirmed = { authorizedKeys: ["alice:abc", "bob:def"], systemdUnits: [] };
    const observed = { authorizedKeys: ["alice:abc"], systemdUnits: ["nginx.service"] };
    // bob's key disappearing is not flagged (matches agent/baseline Diff semantics);
    // the new systemd unit is.
    expect(diffBaseline(confirmed, observed)).toEqual({ systemdUnits: ["nginx.service"] });
  });

  it("treats a null/undefined confirmed as an empty baseline (first-capture shape)", () => {
    const observed = { authorizedKeys: ["alice:abc"] };
    expect(diffBaseline(null, observed)).toEqual({ authorizedKeys: ["alice:abc"] });
  });

  it("reports drift across multiple fields independently", () => {
    const confirmed = { authorizedKeys: [], systemCronEntries: [], suidBinaries: [] };
    const observed = {
      authorizedKeys: ["mallory:xyz"],
      systemCronEntries: ["/etc/cron.d/evil:abc123"],
      suidBinaries: [],
    };
    const diff = diffBaseline(confirmed, observed);
    expect(diff).toEqual({
      authorizedKeys: ["mallory:xyz"],
      systemCronEntries: ["/etc/cron.d/evil:abc123"],
    });
    expect(hasDrift(diff)).toBe(true);
  });

  it("is order-insensitive within a field", () => {
    const confirmed = { userCronEntries: ["a", "b"] };
    const observed = { userCronEntries: ["b", "a"] };
    expect(diffBaseline(confirmed, observed)).toEqual({});
  });
});
