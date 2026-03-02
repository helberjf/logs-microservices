import { describe, it, expect } from "vitest";
import { buildServer } from "../src/api/server.js";

const integration = process.env.RUN_INTEGRATION === "1";

describe("ingest", () => {
  it("rejects invalid body", async () => {
    const app = buildServer();
    const res = await app.inject({ method: "POST", url: "/v1/logs", payload: { hello: "world" } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  (integration ? it : it.skip)("accepts valid body (integration)", async () => {
    const app = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/v1/logs",
      payload: { ts: new Date().toISOString(), service: "api", env: "dev", level: "info", message: "hello" },
    });
    expect(res.statusCode).toBe(202);
    await app.close();
  });
});
