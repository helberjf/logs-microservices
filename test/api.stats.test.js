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

describe("stats", () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it("applies service and env filters to level counts and timeline", async () => {
    const from = "2026-03-02T00:00:00.000Z";
    const to = "2026-03-03T00:00:00.000Z";
    const app = buildServer();

    mocks.query.mockResolvedValueOnce({
      rows: [{ level: "info", count: "1" }],
    });
    mocks.query.mockResolvedValueOnce({
      rows: [
        { bucket_start: "2026-03-02T00:00:00.000Z", level: "info", count: "1" },
      ],
    });

    const res = await request(app).get(
      `/v1/stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&service=api&env=prod&bucketMinutes=15`,
    );

    expect(res.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.query.mock.calls[1][0]).toContain("service = $3");
    expect(mocks.query.mock.calls[1][0]).toContain("env = $4");
    expect(mocks.query.mock.calls[1][1]).toEqual([
      from,
      to,
      "api",
      "prod",
      900,
    ]);
  });
});
