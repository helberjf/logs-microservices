import { describe, it, expect, vi } from "vitest";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  getJobCounts: vi.fn().mockResolvedValue({
    waiting: 2,
    active: 1,
    delayed: 0,
    completed: 10,
    failed: 1,
  }),
}));

vi.mock("../src/lib/queue.js", () => ({
  getIngestQueue: vi.fn(() => ({ getJobCounts: mocks.getJobCounts })),
  closeIngestQueue: vi.fn(),
}));

const { buildServer } = await import("../src/api/server.js");

describe("metrics", () => {
  it("returns Prometheus text metrics", async () => {
    const app = buildServer();

    await request(app).get("/health/liveness");
    const res = await request(app).get("/metrics");

    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("text/plain");
    expect(res.text).toContain("logs_api_requests_total");
    expect(res.text).toContain('route="/health/liveness"');
    expect(res.text).toContain("logs_queue_jobs");
    expect(res.text).toContain('state="waiting"');
  });
});
