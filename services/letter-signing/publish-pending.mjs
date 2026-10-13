// Publish existing authenticated signers under the immediate-publication policy.
// This operator tool is never included in the Worker or public assets.
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { signatureRowFor } from './signature-records.mjs';

export function pendingPublicationSQL(environment, publishedAt) {
  if (!['production', 'sandbox'].includes(environment) || !Number.isSafeInteger(publishedAt) || publishedAt < 0) {
    throw new Error('Invalid publication environment or time.');
  }
  const publication = JSON.stringify({ method: 'orcid-authentication-v1', published_at: publishedAt });
  return `UPDATE signatures SET status='approved',
    evidence=json_set(CASE WHEN json_valid(evidence) THEN evidence ELSE json_object('previous_evidence', evidence) END,
      '$.publication', json('${publication}'))
    WHERE status='pending_review' AND reviewed_at IS NULL
    AND rowid=(${signatureRowFor('signatures.subject')})
    AND subject IN (SELECT subject FROM identities WHERE environment='${environment}')
    RETURNING status`;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), remote = args.includes('--remote');
  if (args.some(arg => !['--remote', '--confirm-publish'].includes(arg)) || (remote && !args.includes('--confirm-publish'))) {
    console.error('Usage: node publish-pending.mjs [--remote --confirm-publish]');
    process.exit(1);
  }
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./node_modules/wrangler/bin/wrangler.js', import.meta.url)),
    'd1', 'execute', 'DB', remote ? '--remote' : '--local', ...(remote ? ['--env', 'production'] : []),
    '--command', pendingPublicationSQL(remote ? 'production' : 'sandbox', Date.now()), '--json'],
  { cwd: fileURLToPath(new URL('.', import.meta.url)), encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  try {
    if (result.status !== 0) throw new Error('Cloudflare database request failed. Check account access before retrying.');
    const data = JSON.parse(result.stdout);
    if (!Array.isArray(data) || data.some(item => !item.success)) throw new Error('Database update did not succeed.');
    console.log(JSON.stringify({ published: data.reduce((n, item) => n + (item.results?.length || 0), 0) }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
