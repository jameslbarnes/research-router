import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { pendingPublicationSQL } from './publish-pending.mjs';

test('publishing the old queue preserves consent, evidence, withdrawals and operator decisions', t => {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  db.exec(readFileSync(new URL('./migrations/0001_signing.sql', import.meta.url), 'utf8'));
  const seed = (id, environment, status, time = 1, reviewed = null, version = 'original') => {
    const subject = environment + ':' + id;
    db.prepare('INSERT OR IGNORE INTO identities VALUES (?,?,?,?,?,?)').run(subject, id, environment, 'Fixture', '', 1);
    db.prepare('INSERT INTO signatures VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(subject, version, 'Original signed text',
      'Fixture', 'Example Lab', 'private@example.org', 1, status,
      JSON.stringify({ screening: { reason: 'lookup_unavailable' } }), time, reviewed);
    return subject;
  };
  const pending = seed('pending', 'production', 'pending_review');
  seed('withdrawn', 'production', 'withdrawn');
  seed('manual', 'production', 'pending_review', 1, 2);
  seed('approved', 'production', 'approved');
  seed('sandbox', 'sandbox', 'pending_review');
  seed('superseded', 'production', 'pending_review');
  seed('superseded', 'production', 'withdrawn', 2, 2, 'newer');
  seed('tied', 'production', 'pending_review');
  seed('tied', 'production', 'withdrawn', 1, 2, 'newer');
  const before = db.prepare('SELECT * FROM signatures ORDER BY rowid').all();
  assert.deepEqual(db.prepare(pendingPublicationSQL('production', 1234)).all().map(r => r.status), ['approved']);
  const after = db.prepare('SELECT * FROM signatures ORDER BY rowid').all();
  for (let i = 0; i < before.length; i++) {
    if (before[i].subject !== pending) assert.deepEqual(after[i], before[i]);
    else {
      const evidence = JSON.parse(after[i].evidence);
      assert.deepEqual(evidence.screening, JSON.parse(before[i].evidence).screening);
      assert.deepEqual(evidence.publication, { method: 'orcid-authentication-v1', published_at: 1234 });
      assert.deepEqual({ ...after[i], status: before[i].status, evidence: before[i].evidence }, { ...before[i] });
    }
  }
  assert.deepEqual(db.prepare(pendingPublicationSQL('production', 2345)).all(), [], 'Re-running cannot republish or change evidence');
});
