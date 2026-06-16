import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  add: vi.fn(),
}));

vi.mock("../src/lib/db.js", () => ({
  pool: { query: mocks.query },
  dbHealthcheck: vi.fn(),
}));

vi.mock("../src/lib/queue.js", () => ({
  getIngestQueue: vi.fn(() => ({ add: mocks.add })),
  closeIngestQueue: vi.fn(),
}));

const { buildServer } = await import("../src/api/server.js");

describe("ingest idempotency", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.add.mockReset();
  });

  it("returns existing job and does not enqueue duplicate dedupeKey", async () => {
    mocks.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ job_id: "existing-job" }],
      });

    const app = buildServer();
    const res = await request(app).post("/v1/logs").send({
      ts: "2026-03-02T10:00:00.000Z",
      service: "billing-api",
      env: "prod",
      level: "info",
      message: "payment approved",
      dedupeKey: "billing-api:A1:approved",
    });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({
      accepted: 1,
      jobIds: ["existing-job"],
      duplicates: 1,
    });
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("stores dedupeKey when enqueueing a new log", async () => {
    mocks.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ job_id: "new-job" }],
    });
    mocks.add.mockResolvedValueOnce({});

    const app = buildServer();
    const res = await request(app).post("/v1/logs").send({
      ts: "2026-03-02T10:00:00.000Z",
      service: "billing-api",
      env: "prod",
      level: "info",
      message: "payment approved",
      dedupeKey: "billing-api:A1:approved",
    });

    expect(res.status).toBe(202);
    expect(mocks.query.mock.calls[0][0]).toContain("dedupe_key");
    expect(mocks.query.mock.calls[0][1][1]).toBe("billing-api:A1:approved");
    expect(mocks.add).toHaveBeenCalledOnce();
  });
});
