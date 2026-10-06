// Re-screen saved requests without changing the letter they consented to.
// This operator tool is never included in the Worker or public assets.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseLetter, providerJSON } from './app.mjs';
import { screenSignature } from './screening.mjs';

const args = process.argv.slice(2), remote = args.includes('--remote');
if (args.some(arg => !['--remote', '--confirm-publish'].includes(arg)) || (remote && !args.includes('--confirm-publish'))) {
  console.error('Usage: node screen-pending.mjs [--remote --confirm-publish]');
  process.exit(1);
}
const letter = parseLetter(readFileSync(new URL('../../site/letter/index.html', import.meta.url), 'utf8'));
const environment = remote ? 'production' : 'sandbox';
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
function query(sql) {
  // Pass SQL as one process argument, never through a shell. Wrangler's --file
  // path uses the import API and does not return SELECT rows as plain JSON.
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./node_modules/wrangler/bin/wrangler.js', import.meta.url)),
    'd1', 'execute', 'DB', remote ? '--remote' : '--local', ...(remote ? ['--env', 'production'] : []), '--command', sql, '--json'],
  { cwd: fileURLToPath(new URL('.', import.meta.url)), encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('Cloudflare database request failed. Check account access before retrying.');
  const data = JSON.parse(result.stdout);
  if (!Array.isArray(data) || data.some(item => !item.success)) throw new Error('Database query did not succeed.');
  return data.flatMap(item => item.results || []);
}
try {
  const rows = query(`SELECT s.subject, s.name, s.evidence, i.orcid FROM signatures s JOIN identities i USING(subject)
    WHERE s.status='pending_review' AND s.reviewed_at IS NULL AND s.letter_hash=${quote(letter.hash)}
    AND i.environment=${quote(environment)} ORDER BY s.submitted_at`);
  const counts = { checked: 0, approved: 0, held: 0, changed_during_check: 0, reasons: {} };
  for (const row of rows) {
    const screening = await screenSignature(row, { fetchImpl: fetch, providerJSON, now: Date.now });
    let evidence = {}; try { evidence = JSON.parse(row.evidence) || {}; } catch { /* Keep the new check. */ }
    const changed = query(`UPDATE signatures SET status=${quote(screening.status)},
      evidence=${quote(JSON.stringify({ ...evidence, screening }))},
      reviewed_at=${screening.status === 'approved' ? screening.checked_at : 'NULL'}
      WHERE subject=${quote(row.subject)} AND letter_hash=${quote(letter.hash)} AND name=${quote(row.name)}
      AND status='pending_review' AND reviewed_at IS NULL RETURNING status`);
    counts.checked++;
    if (!changed.length) counts.changed_during_check++;
    else {
      counts[screening.status === 'approved' ? 'approved' : 'held']++;
      counts.reasons[screening.reason] = (counts.reasons[screening.reason] || 0) + 1;
    }
  }
  console.log(JSON.stringify(counts, null, 2));
} catch (error) {
  console.error(error.message); process.exitCode = 1;
}
