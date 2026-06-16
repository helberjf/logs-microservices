import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("../src/lib/db.js", () => ({
  pool: { query: mocks.query },
}));

const { recordDeadLetter } = await import("../src/worker/worker.js");

describe("worker dead-letter tracking", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.query.mockResolvedValue({});
  });

  it("records final failed jobs in ingest_dead_letters", async () => {
    await recordDeadLetter(
      {
        id: "job-1",
        name: "ingest",
        data: { service: "api", message: "bad" },
        attemptsMade: 5,
      },
      new Error("boom"),
    );

    expect(mocks.query).toHaveBeenCalledOnce();
    expect(mocks.query.mock.calls[0][0]).toContain("ingest_dead_letters");
    expect(mocks.query.mock.calls[0][1]).toEqual([
      "job-1",
      "logs-ingest-test",
      "ingest",
      JSON.stringify({ service: "api", message: "bad" }),
      "boom",
      5,
    ]);
  });
});
