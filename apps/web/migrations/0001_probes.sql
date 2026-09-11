CREATE TABLE IF NOT EXISTS probes (
  probe_id TEXT PRIMARY KEY,
  context_hash TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  context_key TEXT NOT NULL,
  fixture TEXT NOT NULL CHECK (fixture IN ('correct', 'plus-one'))
);
CREATE TABLE IF NOT EXISTS agent_tasks (
  probe_id TEXT PRIMARY KEY REFERENCES probes(probe_id),
  request_hash TEXT NOT NULL,
  result_key TEXT NOT NULL,
  result_hash TEXT,
  state TEXT NOT NULL CHECK (state IN ('reserved', 'ready'))
);
