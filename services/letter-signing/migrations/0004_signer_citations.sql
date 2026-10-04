CREATE TABLE signer_citations (
  subject TEXT PRIMARY KEY REFERENCES identities(subject),
  name TEXT NOT NULL,
  citations TEXT,
  next_check_at INTEGER NOT NULL
);
