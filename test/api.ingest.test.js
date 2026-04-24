import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildServer, closeServerResources } from "../src/api/server.js";

const integration = process.env.RUN_INTEGRATION === "1";

describe("ingest", () => {
  it("rejects invalid body", async () => {
    const app = buildServer();
    const res = await request(app).post("/v1/logs").send({ hello: "world" });
    expect(res.status).toBe(400);
  });

  (integration ? it : it.skip)("accepts valid body (integration)", async () => {
    const app = buildServer();
    try {
      const res = await request(app).post("/v1/logs").send({
        ts: new Date().toISOString(),
        service: "api",
        env: "dev",
        level: "info",
        message: "hello",
      });
      expect(res.status).toBe(202);
    } finally {
      await closeServerResources();
    }
  });
});
