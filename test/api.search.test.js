import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildServer } from "../src/api/server.js";

describe("search query validation", () => {
  it("rejects bad limit", async () => {
    const app = buildServer();
    const res = await request(app).get("/v1/logs?limit=9999");
    expect(res.status).toBe(400);
  });

  it("rejects incomplete keyset cursor", async () => {
    const app = buildServer();
    const res = await request(app).get(
      `/v1/logs?cursorTs=${encodeURIComponent(new Date().toISOString())}`,
    );
    expect(res.status).toBe(400);
  });
});
