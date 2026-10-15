CREATE TABLE email_identities (
  subject TEXT PRIMARY KEY REFERENCES identities(subject),
  email TEXT NOT NULL,
  verified_at INTEGER NOT NULL,
  institution TEXT NOT NULL
);
CREATE TABLE email_challenges (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  client_origin TEXT NOT NULL,
  institution TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX email_challenges_expiry ON email_challenges(expires_at);
CREATE TABLE academic_domains (
  domain TEXT PRIMARY KEY,
  institution TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
