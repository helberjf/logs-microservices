import { describe, it, expect } from "vitest";
import { buildServer } from "../src/api/server.js";

describe("search query validation", () => {
  it("rejects bad limit", async () => {
    const app = buildServer();
    const res = await app.inject({ method: "GET", url: "/v1/logs?limit=9999" });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
