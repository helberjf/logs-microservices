CREATE INDEX IF NOT EXISTS idx_logs_service_ts_desc ON logs (service, ts DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level_ts_desc ON logs (level, ts DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_logs_ts_desc ON logs (ts DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_logs_message_fts ON logs USING GIN (to_tsvector('simple', message));
CREATE INDEX IF NOT EXISTS idx_logs_attrs_gin ON logs USING GIN (attrs);
CREATE INDEX IF NOT EXISTS idx_logs_trace_id ON logs (trace_id) WHERE trace_id IS NOT NULL;
