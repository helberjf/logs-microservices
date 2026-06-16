import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("retention", () => {
  const originalRetentionDays = process.env.RETENTION_DAYS;
  const originalBatchSize = process.env.RETENTION_BATCH_SIZE;

  beforeEach(() => {
    process.env.RETENTION_DAYS = "30";
    process.env.RETENTION_BATCH_SIZE = "250";
  });

  afterEach(() => {
    if (originalRetentionDays === undefined) {
      delete process.env.RETENTION_DAYS;
    } else {
      process.env.RETENTION_DAYS = originalRetentionDays;
    }

    if (originalBatchSize === undefined) {
      delete process.env.RETENTION_BATCH_SIZE;
    } else {
      process.env.RETENTION_BATCH_SIZE = originalBatchSize;
    }
  });

  it("deletes logs older than the configured retention window", async () => {
    const { runRetention } = await import("../scripts/retention.js");
    const pool = {
      query: vi.fn().mockResolvedValueOnce({
        rows: [{ deleted_count: "0" }],
      }),
    };

    const result = await runRetention({ pool, logger: { info: vi.fn() } });

    expect(result).toEqual({ deleted: 0, batches: 1 });
    expect(pool.query).toHaveBeenCalledOnce();
    expect(pool.query.mock.calls[0][0]).toContain("DELETE FROM logs");
    expect(pool.query.mock.calls[0][1]).toEqual([30, 250]);
  });
});
