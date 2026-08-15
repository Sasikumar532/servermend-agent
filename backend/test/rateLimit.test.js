import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { rateLimit, _resetRateLimitState } from "../src/middleware/rateLimit.js";

beforeEach(_resetRateLimitState);

function appWithLimit(limit, windowMs = 60_000) {
  const app = express();
  app.get(
    "/x",
    rateLimit({ limit, windowMs, keyFn: () => "fixed-key" }),
    (_req, res) => res.json({ ok: true })
  );
  return app;
}

describe("rateLimit", () => {
  it("allows requests under the limit", async () => {
    const app = appWithLimit(3);
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get("/x");
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 once the limit is exceeded", async () => {
    const app = appWithLimit(2);
    await request(app).get("/x");
    await request(app).get("/x");
    const res = await request(app).get("/x");
    expect(res.status).toBe(429);
    expect(res.body.error).toBeTruthy();
  });

  it("sets Retry-After and X-RateLimit-* headers on a 429", async () => {
    const app = appWithLimit(1);
    await request(app).get("/x");
    const res = await request(app).get("/x");
    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeTruthy();
    expect(res.headers["x-ratelimit-remaining"]).toBe("0");
  });

  it("does not let one key's traffic exhaust another key's budget", async () => {
    const app = express();
    app.get(
      "/x",
      rateLimit({ limit: 1, windowMs: 60_000, keyFn: (req) => String(req.query.user) }),
      (_req, res) => res.json({ ok: true })
    );

    const a1 = await request(app).get("/x?user=alice");
    const b1 = await request(app).get("/x?user=bob");
    const a2 = await request(app).get("/x?user=alice");

    expect(a1.status).toBe(200);
    expect(b1.status).toBe(200); // bob's own budget, unaffected by alice's usage
    expect(a2.status).toBe(429); // alice's second request within the same window
  });

  it("resets the window after windowMs elapses", async () => {
    const app = appWithLimit(1, 50); // 50ms window
    const first = await request(app).get("/x");
    expect(first.status).toBe(200);

    const blocked = await request(app).get("/x");
    expect(blocked.status).toBe(429);

    await new Promise((resolve) => setTimeout(resolve, 70));

    const afterReset = await request(app).get("/x");
    expect(afterReset.status).toBe(200);
  });
});
