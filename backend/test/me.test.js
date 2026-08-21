import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { startTestDb, clearTestDb, stopTestDb } from "./mongoTestHelper.js";

const app = createApp();

beforeAll(startTestDb);
afterEach(clearTestDb);
afterAll(stopTestDb);

async function signupAndLogin(email = "owner@example.com", password = "hunter22222") {
  const res = await request(app).post("/api/v1/auth/signup").send({ email, password });
  expect(res.status).toBe(201);
  return res.body.token;
}

describe("GET /me", () => {
  it("returns the authenticated user's profile with unset fields as null", async () => {
    const token = await signupAndLogin("profile@example.com");

    const res = await request(app).get("/api/v1/me").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      email: "profile@example.com",
      firstName: null,
      lastName: null,
      mobileNumber: null,
      companyName: null,
      position: null,
    });
  });

  it("401s without a token", async () => {
    const res = await request(app).get("/api/v1/me");
    expect(res.status).toBe(401);
  });
});

describe("PATCH /me", () => {
  it("updates the provided profile fields and leaves others unchanged", async () => {
    const token = await signupAndLogin("patch@example.com");

    const first = await request(app)
      .patch("/api/v1/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ firstName: "Ada", lastName: "Lovelace" });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ firstName: "Ada", lastName: "Lovelace", companyName: null });

    const second = await request(app)
      .patch("/api/v1/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyName: "Analytical Engines Ltd", position: "Engineer" });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace",
      companyName: "Analytical Engines Ltd",
      position: "Engineer",
    });
  });

  it("trims whitespace on string fields", async () => {
    const token = await signupAndLogin("trim@example.com");

    const res = await request(app)
      .patch("/api/v1/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ mobileNumber: "  +1 555 0100  " });

    expect(res.status).toBe(200);
    expect(res.body.mobileNumber).toBe("+1 555 0100");
  });

  it("does not let a non-string field value through", async () => {
    const token = await signupAndLogin("badtype@example.com");

    const res = await request(app)
      .patch("/api/v1/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ firstName: 12345 });

    expect(res.status).toBe(400);
  });

  it("401s without a token", async () => {
    const res = await request(app).patch("/api/v1/me").send({ firstName: "Ada" });
    expect(res.status).toBe(401);
  });
});
