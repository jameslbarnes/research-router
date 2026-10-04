CREATE TABLE researchers (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  orcid TEXT,
  name TEXT NOT NULL,
  affiliation TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(environment, orcid)
);
CREATE TABLE research_networks (
  subject TEXT PRIMARY KEY REFERENCES identities(subject),
  snapshot TEXT NOT NULL,
  refreshed_at INTEGER NOT NULL
);
CREATE TABLE discovery_locks (
  lock_key TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  inviter_subject TEXT NOT NULL REFERENCES identities(subject),
  letter_hash TEXT NOT NULL,
  recipient_key TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  researcher_id TEXT REFERENCES researchers(id),
  evidence TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_action TEXT,
  acted_at INTEGER,
  UNIQUE(inviter_subject, letter_hash, recipient_key)
);
CREATE TABLE invitation_referrals (
  subject TEXT NOT NULL REFERENCES identities(subject),
  letter_hash TEXT NOT NULL,
  invitation_id TEXT NOT NULL REFERENCES invitations(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(subject, letter_hash)
);
