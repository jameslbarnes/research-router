// Local-only, in-memory preview using a public research snapshot. Authentication
// and signatures are simulated. Provider calls are served from saved metadata.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { createApp, configFromEnv, parseLetter } from './app.mjs';
import andrew from './andrew-miller.preview.json' with { type: 'json' };

const port = 8779, origin = `http://127.0.0.1:${port}`;
const root = await realpath(fileURLToPath(new URL('../../site/letter/', import.meta.url)));
const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
for (const file of (await readdir(new URL('./migrations/', import.meta.url))).sort()) db.exec(await readFile(new URL('./migrations/' + file, import.meta.url), 'utf8'));
const letter = parseLetter(readFileSync(resolve(root, 'index.html'), 'utf8'));
const config = configFromEnv({ APP_ORIGIN: origin, ORCID_ENV: 'sandbox', ORCID_CLIENT_ID: 'fixture',
  ORCID_CLIENT_SECRET: 'fixture', TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32) });
const tokens = [];
for (const [i, orcid] of [andrew.profile.orcid, '0000-0001-5109-3700'].entries()) {
  const subject = 'sandbox:' + orcid, name = i ? 'Another Researcher' : andrew.profile.name;
  db.prepare('INSERT INTO identities VALUES (?, ?, ?, ?, ?, ?)').run(subject, orcid, 'sandbox', name, '', Date.now());
  const token = randomBytes(32).toString('base64url'); tokens.push(token);
  db.prepare('INSERT INTO sessions (session_hash, subject, csrf, expires_at) VALUES (?, ?, ?, ?)')
    .run(createHash('sha256').update(token).digest('hex'), subject, randomBytes(32).toString('base64url'), Date.now() + 12 * 60 * 60 * 1000);
  if (!i) db.prepare(`INSERT INTO signatures (subject, letter_hash, letter_text, name, affiliation, email, updates, status, evidence, submitted_at)
    VALUES (?, ?, ?, ?, ?, '', 0, 'approved', ?, ?)`)
    .run(subject, letter.hash, letter.text, name, andrew.profile.affiliation, JSON.stringify({ status: 'retrieved', works: andrew.activities.works.group,
      retrieved_at: Date.now(), returned_work_groups: 2 }), Date.now());
}
const app = createApp({ config, db, letter, fetchImpl: async url => {
  if (url.startsWith('https://api.crossref.org/works?')) return Response.json({ status: 'ok', message: { items: [], 'total-results': 0 } });
  if (url.startsWith('https://sparql.dblp.org/sparql?')) return Response.json(andrew.dblpBibliography);
  if (url.startsWith('https://api.openalex.org/authors?')) {
    const ids = new URL(url).searchParams.get('filter').slice('orcid:'.length).split('|');
    const results = andrew.citationAuthors.results.filter(a => ids.includes(a.orcid));
    return Response.json({ meta: { count: results.length }, results });
  }
  if (url.includes('api.crossref.org/works/')) {
    const data = andrew.papers[decodeURIComponent(url.split('/works/')[1])];
    return data ? Response.json(data) : new Response('Fixture not found', { status: 404 });
  }
  if (url.endsWith('/activities')) return Response.json(url.includes(andrew.profile.orcid) ? andrew.activities : { works: { group: [] } });
  if (url.endsWith('/person')) return Response.json(url.includes(andrew.profile.orcid) ? andrew.person : {});
  throw new Error('External requests are disabled in this preview.');
} });
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4' };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    if (url.pathname === '/qa') {
      const phone = url.searchParams.has('phone');
      const signers = url.searchParams.has('signers');
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invitation preview · ${phone ? 'phone' : 'desktop'}</title>
        <style>body{margin:0;background:#eae8e3;font:14px Arial;color:#17271f}nav{padding:14px;display:flex;gap:24px}a{color:inherit}iframe{display:block;margin:0 auto;border:0;background:#fbfaf7;width:${phone ? '390' : '1200'}px;height:${phone ? '844' : '800'}px}</style>
        <nav><b>${signers ? 'Fictional signers' : 'Andrew Miller'} · local preview</b><a href="/qa${signers ? '?signers' : ''}">Desktop</a><a href="/qa?phone${signers ? '&signers' : ''}">Phone</a><a href="/qa?signers">Signer layout</a><a href="/qa/recipient">Try a fictional recipient</a><a href="/qa/checks">Browser checks</a></nav>
        <iframe title="Letter invitation preview" allow="web-share; clipboard-write" src="/letter/studies/split-view.html${signers ? '?signers-preview#signatories' : '#sign'}"></iframe>`); return;
    }
    if (url.pathname === '/qa/recipient' || url.pathname === '/qa/signer') {
      const i = url.pathname.endsWith('recipient') ? 1 : 0;
      const invite = db.prepare('SELECT id FROM invitations ORDER BY created_at LIMIT 1').get();
      res.writeHead(302, { 'Set-Cookie': 'letter_session=' + tokens[i] + '; Path=/; HttpOnly; SameSite=Lax',
        Location: '/letter/studies/split-view.html' + (i && invite ? '?via=' + invite.id : '') + '#sign' }); res.end(); return;
    }
    if (url.pathname === '/qa/checks') {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      res.end(await readFile(new URL('./invitations.browser.html', import.meta.url))); return;
    }
    if (url.pathname === '/qa/profile.json') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(andrew.profile)); return;
    }
    if (url.pathname === '/qa/profile.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      res.end(await readFile(new URL('./invitations.preview-client.js', import.meta.url))); return;
    }
    if (url.pathname === '/qa/signatories.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      res.end(`/* Fictional signatures for layout checks only. */
        const previewFetch = window.fetch;
        window.fetch = async (url, options) => {
          const path = new URL(url, location.href).pathname;
          if (path.endsWith('/signatories.json')) return Response.json([]);
          if (path.endsWith('/api/signatures')) return Response.json([
            {name:'Alexander Montgomery',affiliation:'Example Institute',citations:{count:8200,url:'https://openalex.org/A100'}},
            {name:'Maya Chen',affiliation:'Example University',citations:{count:12500,url:'https://openalex.org/A200'}},
            {name:'Nadia Okafor',affiliation:'Example Lab'},
            {name:'Elena Vasquez',affiliation:'Example University'},
            {name:'Sam Rivera',affiliation:'Example Institute'}
          ]);
          return previewFetch(url, options);
        };`); return;
    }
    if (url.pathname.startsWith('/letter/api/')) {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 8192) { res.writeHead(413).end(); return; } chunks.push(chunk); }
      const headers = new Headers(req.headers);
      if (!tokens.some(token => headers.get('cookie')?.includes('letter_session=' + token))) headers.set('cookie', 'letter_session=' + tokens[0]);
      const response = await app(new Request(url, { method: req.method, headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }));
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    if (!url.pathname.startsWith('/letter/') || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404).end(); return; }
    let file = resolve(root, '.' + decodeURIComponent(url.pathname.slice('/letter'.length)));
    if (!file.startsWith(root + sep)) { res.writeHead(404).end(); return; }
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    file = await realpath(file);
    if (!file.startsWith(root + sep) || !types[extname(file)]) { res.writeHead(404).end(); return; }
    let data = await readFile(file);
    // Keep the preview still, avoiding large film transfers during UI review.
    if (file.endsWith('split-view.html')) {
      let html = data.toString().replace(/<script[^>]+src="(?:study\.js|\.\.\/hosting\.js)[^"]*"[^>]*><\/script>/g, '');
      if (url.searchParams.has('signers-preview')) {
        html = html.replace('data-signing aria-label', 'data-disabled-signing aria-label')
          .replace('Loading ORCID sign-in…', 'Fictional signer preview. Signing is disabled here.')
          .replace(/<script src="\.\.\/sign\.js/, '<script src="/qa/signatories.js"></script><script src="../sign.js');
      } else if (!req.headers.cookie?.includes('letter_session=' + tokens[1])) {
        html = html.replace(/<script src="\.\.\/sign\.js[^"]*"><\/script>/, '<script src="/qa/profile.js"></script>')
          .replace('<h2 id="sign-heading">Add your name</h2>', '<h2 id="sign-heading">Invitation preview</h2>')
          .replace('data-signing aria-label="Sign the letter"', 'data-signing aria-label="Andrew Miller invitation preview"');
      }
      data = Buffer.from(html);
    }
    res.writeHead(200, { 'Content-Type': types[extname(file)], 'Cache-Control': 'no-store', 'Referrer-Policy': 'same-origin' }); res.end(data);
  } catch (err) { res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Local preview error: ' + err.message); }
}).listen(port, '127.0.0.1', () => console.log(`Andrew Miller invitation preview with simulated signing at ${origin}/qa`));
