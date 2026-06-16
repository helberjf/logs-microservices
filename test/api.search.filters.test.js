import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("../src/lib/db.js", () => ({
  pool: { query: mocks.query },
  dbHealthcheck: vi.fn(),
}));

const { buildServer } = await import("../src/api/server.js");

describe("search filters", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.query.mockResolvedValue({ rows: [] });
  });

  it("filters by traceId and spanId", async () => {
    const app = buildServer();

    const res = await request(app).get(
      "/v1/logs?traceId=trace-123&spanId=span-456",
    );

    expect(res.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledOnce();
    expect(mocks.query.mock.calls[0][0]).toContain("trace_id = $1");
    expect(mocks.query.mock.calls[0][0]).toContain("span_id = $2");
    expect(mocks.query.mock.calls[0][1]).toEqual(["trace-123", "span-456", 50]);
  });

  it("filters by JSON attribute key and value", async () => {
    const app = buildServer();

    const res = await request(app).get(
      "/v1/logs?attrKey=orderId&attrValue=A1",
    );

    expect(res.status).toBe(200);
    expect(mocks.query.mock.calls[0][0]).toContain("attrs @> $1::jsonb");
    expect(mocks.query.mock.calls[0][1]).toEqual([
      JSON.stringify({ orderId: "A1" }),
      50,
    ]);
  });

  it("rejects attrValue without attrKey", async () => {
    const app = buildServer();

    const res = await request(app).get("/v1/logs?attrValue=A1");

    expect(res.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
