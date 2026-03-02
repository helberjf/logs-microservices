import { describe, it, expect } from "vitest";
import { buildServer } from "../src/api/server.js";

describe("health", () => {
  it("liveness ok", async () => {
    const app = buildServer();
    const res = await app.inject({ method: "GET", url: "/health/liveness" });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    await app.close();
  });
});
