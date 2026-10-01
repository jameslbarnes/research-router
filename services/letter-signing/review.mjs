// Explicit operator actions. This file is never included in the Worker bundle.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validOrcid } from './app.mjs';

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const positional = args.filter(arg => !arg.startsWith('--'));
const [action, orcid, letterHash] = positional;
if (!['list', 'show', 'approve', 'withdraw'].includes(action) ||
    (action !== 'list' && (!validOrcid(orcid || '') || !/^[a-f0-9]{64}$/.test(letterHash || '')))) {
  console.error('Usage: node review.mjs list | show|approve|withdraw ORCID LETTER_HASH [--remote] [--confirm-publish]');
  process.exit(1);
}
if (remote && ['approve', 'withdraw'].includes(action) && !args.includes('--confirm-publish')) {
  console.error('This changes the public signature list. Review the exact record first, then use --confirm-publish.');
  process.exit(1);
}
const environment = remote ? 'production' : 'sandbox';
const where = action === 'list' ? '' : `subject='${environment}:${orcid}' AND letter_hash='${letterHash}'`;
let sql;
if (action === 'list') {
  sql = `SELECT orcid, name, affiliation, status, letter_hash, submitted_at FROM signatures JOIN identities USING(subject)
    WHERE environment='${environment}' ORDER BY submitted_at DESC`;
  // Both tables have a name; use the name the signer chose for publication.
  sql = sql.replace('orcid, name,', 'orcid, signatures.name,');
} else if (action === 'show') {
  sql = `SELECT name, affiliation, email, updates, status, letter_text, evidence, submitted_at FROM signatures WHERE ${where}`;
} else {
  const status = action === 'approve' ? 'approved' : 'withdrawn';
  sql = `UPDATE signatures SET status='${status}', reviewed_at=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE ${where};
    SELECT name, affiliation, status, letter_hash FROM signatures WHERE ${where}`;
}
const result = spawnSync(process.execPath, [fileURLToPath(new URL('./node_modules/wrangler/bin/wrangler.js', import.meta.url)),
  'd1', 'execute', 'DB', remote ? '--remote' : '--local', ...(remote ? ['--env', 'production'] : []), '--command', sql],
  { cwd: fileURLToPath(new URL('.', import.meta.url)), stdio: 'inherit' });
process.exit(result.status ?? 1);
