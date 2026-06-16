import { randomUUID } from "node:crypto";

const baseUrl = process.env.API_BASE_URL ?? "http://localhost:3000";
const timeoutMs = Number(process.env.E2E_TIMEOUT_MS ?? 15000);

async function request(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(process.env.API_KEY ? { "x-api-key": process.env.API_KEY } : {}),
      ...options.headers,
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed: ${res.status} ${text}`);
  }
  return body;
}

async function waitForProcessed(jobId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const job = await request(`/v1/logs/ingest/${jobId}`);
    if (job.status === "processed") return job;
    if (job.status === "failed") throw new Error(`job failed: ${job.error}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`job ${jobId} was not processed within ${timeoutMs}ms`);
}

async function main() {
  const traceId = `trace-${randomUUID()}`;
  const dedupeKey = `e2e-${randomUUID()}`;

  await request("/health/readiness");
  const ingest = await request("/v1/logs", {
    method: "POST",
    body: JSON.stringify({
      ts: new Date().toISOString(),
      service: "e2e-smoke",
      env: "test",
      level: "info",
      message: "e2e smoke log",
      traceId,
      dedupeKey,
      attrs: { smoke: "true" },
    }),
  });

  await waitForProcessed(ingest.jobIds[0]);
  const search = await request(`/v1/logs?traceId=${encodeURIComponent(traceId)}`);
  if (search.items.length === 0) throw new Error("search did not find smoke log");

  const metricsRes = await fetch(`${baseUrl}/metrics`);
  if (!metricsRes.ok) throw new Error(`/metrics failed: ${metricsRes.status}`);

  console.log("E2E smoke test passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
