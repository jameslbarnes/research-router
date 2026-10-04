import { randomBytes } from 'node:crypto';
import { lookupCitations } from './citations.mjs';

const DAY = 24 * 60 * 60 * 1000;

export function createSignatories({ db, letter, fetchImpl, providerJSON, now }) {
  const rows = () => db.prepare(`SELECT s.subject, s.name, s.affiliation, i.orcid,
    c.name AS citation_name, c.citations, c.next_check_at
    FROM signatures s JOIN identities i USING(subject)
    LEFT JOIN signer_citations c USING(subject)
    WHERE s.status='approved' AND i.environment='production' AND s.letter_hash=?
    ORDER BY s.submitted_at, s.subject`).all(letter.hash);
  const savedCitations = row => row.citation_name === row.name && row.citations ? JSON.parse(row.citations) : null;
  return async () => {
    let current = await rows();
    const stale = current.filter(row => row.citation_name !== row.name || row.next_check_at <= now()).slice(0, 50);
    if (stale.length) {
      const owner = randomBytes(12).toString('hex');
      const lock = await db.prepare(`INSERT INTO discovery_locks (lock_key, owner, expires_at) VALUES ('public-signers', ?, ?)
        ON CONFLICT(lock_key) DO UPDATE SET owner=excluded.owner, expires_at=excluded.expires_at
        WHERE discovery_locks.expires_at<=? RETURNING owner`).get(owner, now() + 30000, now());
      if (lock?.owner === owner) {
        try {
          const candidates = stale.map(row => ({ name: row.name, orcid: row.orcid }));
          const result = await lookupCitations(candidates, { fetchImpl, providerJSON, now, budget: 4000 });
          const failed = result.status === 'unavailable';
          const updates = stale.map((row, index) => {
            // Provider failures preserve the last confirmed count for this name.
            const citations = failed ? savedCitations(row) : candidates[index].citations;
            return [row.subject, row.name, citations ? JSON.stringify(citations) : null, now() + (failed ? 3600000 : DAY)];
          });
          // Stay below D1's bound-parameter and per-request query limits.
          for (let offset = 0; offset < updates.length; offset += 20) {
            const batch = updates.slice(offset, offset + 20);
            await db.prepare(`INSERT INTO signer_citations (subject, name, citations, next_check_at)
              VALUES ${batch.map(() => '(?, ?, ?, ?)').join(',')}
              ON CONFLICT(subject) DO UPDATE SET name=excluded.name, citations=excluded.citations, next_check_at=excluded.next_check_at`)
              .run(...batch.flat());
          }
        } finally {
          await db.prepare("DELETE FROM discovery_locks WHERE lock_key='public-signers' AND owner=?").run(owner);
        }
        // Recheck approval and letter version after the external request.
        current = await rows();
      }
    }
    return current.map(row => ({ name: row.name, affiliation: row.affiliation, orcid: row.orcid, citations: savedCitations(row) }))
      .sort((a, b) => (b.citations?.count ?? -1) - (a.citations?.count ?? -1));
  };
}
