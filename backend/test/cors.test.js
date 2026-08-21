import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { isAllowedOrigin } from "../src/middleware/cors.js";

describe("isAllowedOrigin", () => {
  it("rejects a missing origin regardless of allowlist", () => {
    expect(isAllowedOrigin(undefined, [])).toBe(false);
    expect(isAllowedOrigin(undefined, ["https://app.example.com"])).toBe(false);
  });

  describe("default (no explicit CORS_ORIGINS)", () => {
    it("allows any localhost origin regardless of port", () => {
      expect(isAllowedOrigin("http://localhost:5173", [])).toBe(true);
      expect(isAllowedOrigin("http://localhost:5176", [])).toBe(true);
      expect(isAllowedOrigin("http://localhost:4000", [])).toBe(true);
    });

    it("allows any 127.0.0.1 origin regardless of port", () => {
      expect(isAllowedOrigin("http://127.0.0.1:5173", [])).toBe(true);
    });

    it("allows https localhost too", () => {
      expect(isAllowedOrigin("https://localhost:5173", [])).toBe(true);
    });

    it("rejects a non-localhost origin", () => {
      expect(isAllowedOrigin("https://evil.example.com", [])).toBe(false);
    });

    it("rejects localhost with no explicit port", () => {
      expect(isAllowedOrigin("http://localhost", [])).toBe(false);
    });
  });

  describe("with an explicit allowlist", () => {
    const allowed = ["https://app.servermend.example"];

    it("allows an exact match", () => {
      expect(isAllowedOrigin("https://app.servermend.example", allowed)).toBe(true);
    });

    it("rejects anything not in the list, including localhost", () => {
      expect(isAllowedOrigin("http://localhost:5173", allowed)).toBe(false);
      expect(isAllowedOrigin("https://other.example.com", allowed)).toBe(false);
    });
  });
});

describe("cors middleware (real HTTP)", () => {
  const app = createApp();

  it("answers a preflight OPTIONS request for an allowed origin", async () => {
    const res = await request(app)
      .options("/api/v1/auth/signup")
      .set("Origin", "http://localhost:5176")
      .set("Access-Control-Request-Method", "POST");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5176");
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
    expect(res.headers["access-control-allow-headers"]).toContain("Authorization");
  });

  it("echoes the origin on a real request from an allowed origin", async () => {
    const res = await request(app).get("/healthz").set("Origin", "http://localhost:5176");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5176");
    expect(res.headers.vary).toBe("Origin");
  });

  it("does not grant CORS headers to a disallowed origin (the request itself still succeeds server-side — the browser is what enforces the block)", async () => {
    const res = await request(app).get("/healthz").set("Origin", "https://evil.example.com");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("works normally with no Origin header at all (a same-origin or non-browser client)", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
