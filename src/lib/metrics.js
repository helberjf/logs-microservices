const counters = new Map();
const metricMetadata = {
  logs_api_requests_total: {
    help: "API requests by method, route, and status.",
    type: "counter",
  },
  logs_ingest_accepted_total: {
    help: "Logs accepted for asynchronous ingestion.",
    type: "counter",
  },
  logs_ingest_failed_total: {
    help: "Ingest requests that failed before enqueueing.",
    type: "counter",
  },
};

function labelKey(labels) {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(",");
}

function metricKey(name, labels) {
  return `${name}{${labelKey(labels)}}`;
}

function escapeLabelValue(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function formatLabels(labels) {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  return `{${entries
    .map(([key, value]) => `${key}="${escapeLabelValue(value)}"`)
    .join(",")}}`;
}

export function incrementCounter(name, labels = {}, amount = 1) {
  const key = metricKey(name, labels);
  const existing = counters.get(key);
  counters.set(key, {
    name,
    labels,
    value: (existing?.value ?? 0) + amount,
  });
}

export function observeApiRequest(req, res, next) {
  res.on("finish", () => {
    incrementCounter("logs_api_requests_total", {
      method: req.method,
      route: req.originalUrl.split("?")[0],
      status: res.statusCode,
    });
  });
  next();
}

export function incrementIngestAccepted(count = 1) {
  incrementCounter("logs_ingest_accepted_total", {}, count);
}

export function incrementIngestFailed(count = 1) {
  incrementCounter("logs_ingest_failed_total", {}, count);
}

function renderCounter(metric) {
  return `${metric.name}${formatLabels(metric.labels)} ${metric.value}`;
}

export function renderPrometheusMetrics({ queueCounts = null } = {}) {
  const lines = [
    "# HELP logs_process_uptime_seconds Process uptime in seconds.",
    "# TYPE logs_process_uptime_seconds gauge",
    `logs_process_uptime_seconds ${process.uptime().toFixed(3)}`,
  ];
  const renderedMetadata = new Set(["logs_process_uptime_seconds"]);

  for (const metric of counters.values()) {
    if (!renderedMetadata.has(metric.name)) {
      const metadata = metricMetadata[metric.name];
      if (metadata) {
        lines.push(`# HELP ${metric.name} ${metadata.help}`);
        lines.push(`# TYPE ${metric.name} ${metadata.type}`);
      }
      renderedMetadata.add(metric.name);
    }
    lines.push(renderCounter(metric));
  }

  if (queueCounts) {
    lines.push(
      "# HELP logs_queue_jobs BullMQ ingest queue jobs by state.",
      "# TYPE logs_queue_jobs gauge",
    );
    for (const [state, count] of Object.entries(queueCounts)) {
      lines.push(`logs_queue_jobs${formatLabels({ state })} ${count}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function resetMetricsForTests() {
  counters.clear();
}
