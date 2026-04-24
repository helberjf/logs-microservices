import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildServer } from "../src/api/server.js";

describe("health", () => {
  it("liveness ok", async () => {
    const app = buildServer();
    const res = await request(app).get("/health/liveness");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
