ALTER TABLE sessions ADD COLUMN client_origin TEXT;
CREATE TABLE signing_handoffs (
  code_hash TEXT PRIMARY KEY,
  session_hash TEXT NOT NULL REFERENCES sessions(session_hash) ON DELETE CASCADE,
  challenge TEXT NOT NULL,
  channel TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
