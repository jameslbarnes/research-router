CREATE TABLE IF NOT EXISTS oauth_states (
      state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS identities (
      subject TEXT PRIMARY KEY, orcid TEXT NOT NULL, environment TEXT NOT NULL,
      name TEXT NOT NULL, token_encrypted TEXT NOT NULL, authenticated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (
      session_hash TEXT PRIMARY KEY, subject TEXT NOT NULL REFERENCES identities(subject),
      csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS signatures (
      subject TEXT NOT NULL REFERENCES identities(subject), letter_hash TEXT NOT NULL,
      letter_text TEXT NOT NULL, name TEXT NOT NULL, affiliation TEXT NOT NULL,
      email TEXT NOT NULL, updates INTEGER NOT NULL, status TEXT NOT NULL,
      evidence TEXT NOT NULL, submitted_at INTEGER NOT NULL, reviewed_at INTEGER,
      PRIMARY KEY(subject, letter_hash));
    CREATE TABLE IF NOT EXISTS rate_limits (
      bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
