import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();

describe("GET /api/v1/openapi.yaml", () => {
  it("serves the spec as YAML", async () => {
    const res = await request(app).get("/api/v1/openapi.yaml");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/yaml/);
    expect(res.text).toContain("openapi: 3.0.3");
    expect(res.text).toContain("/reports:");
  });
});
