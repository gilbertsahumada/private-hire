CREATE TABLE auth_challenges (
  nonce TEXT PRIMARY KEY, wallet TEXT NOT NULL, message TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY, wallet TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE market_drafts (
  request_id TEXT PRIMARY KEY, buyer TEXT NOT NULL, provider TEXT NOT NULL,
  manifest_hash TEXT NOT NULL, object_key TEXT NOT NULL,
  budget TEXT NOT NULL, expired_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
  chain_id TEXT NOT NULL, escrow TEXT NOT NULL, evaluator TEXT NOT NULL,
  job_id TEXT, chain_status INTEGER, pending_tx TEXT,
  UNIQUE(chain_id, escrow, job_id)
);
CREATE INDEX market_buyer ON market_drafts(buyer, created_at);
CREATE INDEX market_provider ON market_drafts(provider, created_at);
CREATE TABLE market_tasks (
  task_id TEXT PRIMARY KEY, provider TEXT NOT NULL, chain_id TEXT NOT NULL,
  escrow TEXT NOT NULL, job_id TEXT NOT NULL, request_id TEXT NOT NULL,
  manifest_hash TEXT NOT NULL, input_hash TEXT NOT NULL,
  result_key TEXT NOT NULL, result_hash TEXT, state TEXT NOT NULL,
  UNIQUE(provider, chain_id, escrow, job_id)
);
CREATE TABLE market_events (
  chain_id TEXT NOT NULL, tx_hash TEXT NOT NULL, log_index INTEGER NOT NULL,
  block_hash TEXT NOT NULL, block_number TEXT NOT NULL, request_id TEXT NOT NULL,
  event_name TEXT NOT NULL, PRIMARY KEY(chain_id, tx_hash, log_index)
);
CREATE TABLE market_attempts (
  id TEXT PRIMARY KEY, request_id TEXT NOT NULL, phase TEXT NOT NULL,
  state TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE public_agent_cache (id TEXT PRIMARY KEY, body TEXT NOT NULL, verified_at INTEGER NOT NULL);
CREATE TABLE market_scan (id TEXT PRIMARY KEY, next_block TEXT NOT NULL);
