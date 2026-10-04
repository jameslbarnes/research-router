import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { fixtureActivities, fixturePapers, fixtureCitationAuthors, fixtureBibliography } from './invitations.fixtures.mjs';

test('Cloudflare runtime completes OAuth and stores a private, idempotent signature in D1', async t => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('./worker.mjs', import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'neutral', external: ['node:*'] });
  const origin = 'http://localhost:8766';
  const publicLetter = 'https://example.github.io/research-router/site/letter/studies/split-view.html';
  const mf = new Miniflare(convertV4MiniflareOptions({ name: 'letter-signing-test', modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-09-29', compatibilityFlags: ['nodejs_compat'],
    bindings: { APP_ORIGIN: origin, ORCID_ENV: 'sandbox', ORCID_CLIENT_ID: 'test-client',
      ORCID_CLIENT_SECRET: 'test-secret', TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32), PUBLIC_LETTER_URL: publicLetter },
    assets: { directory: fileURLToPath(new URL('./public', import.meta.url)), binding: 'ASSETS', run_worker_first: true, routerConfig: { has_user_worker: true } },
    d1Databases: { DB: 'test-signatures' },
    outboundService: async request => {
      if (new URL(request.url).hostname === 'sparql.dblp.org') {
        assert.equal(request.headers.get('authorization'), null);
        return Response.json({ results: { bindings: fixtureBibliography.results.bindings.map(row =>
          ({ ...row, personName: { value: 'Fixture Researcher' } })) } });
      }
      if (new URL(request.url).hostname === 'api.openalex.org') {
        assert.equal(request.headers.get('authorization'), null);
        return Response.json({ meta: { count: 2 }, results: [...fixtureCitationAuthors.results, {
          id: 'https://openalex.org/A999', orcid: 'https://orcid.org/0000-0002-1825-0097',
          display_name: 'Fixture Researcher', cited_by_count: 42,
        }] });
      }
      if (new URL(request.url).hostname === 'api.crossref.org') {
        assert.equal(request.headers.get('authorization'), null);
        const paper = fixturePapers[decodeURIComponent(new URL(request.url).pathname.split('/works/')[1])];
        return paper ? Response.json(paper) : new Response('Not found', { status: 404 });
      }
      assert.ok(new URL(request.url).hostname.endsWith('sandbox.orcid.org'));
      if (!request.url.endsWith('/oauth/token')) assert.equal(request.headers.get('authorization'), 'Bearer fixture-token');
      return request.url.endsWith('/oauth/token') ? Response.json({ orcid: '0000-0002-1825-0097',
        name: 'Fixture Researcher', access_token: 'fixture-token', scope: '/authenticate', token_type: 'bearer' }) : Response.json(fixtureActivities);
    },
  }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  const sql = readdirSync(new URL('./migrations/', import.meta.url)).sort().map(file => readFileSync(new URL('./migrations/' + file, import.meta.url), 'utf8')).join('\n');
  for (const statement of sql.split(';').filter(s => s.trim())) await db.prepare(statement).run();
  const call = (path, options = {}) => mf.dispatchFetch(origin + '/letter/api/' + path, options);
  const page = await mf.dispatchFetch(origin + '/letter/sign/');
  assert.equal(page.status, 200, await page.clone().text());
  assert.equal(page.headers.get('cache-control'), 'no-store');
  const html = await page.text();
  assert.ok(html.includes('href="' + publicLetter + '"'));
  assert.ok(html.includes('href="https://example.github.io/research-router/site/letter/check/"'));
  for (const file of ['sign.js', 'sign.css', 'invitations.js', 'hosting.js', 'companion.css', 'assets/orcid-id.svg', 'assets/spatial-threads/journey-poster-desktop.jpg']) {
    assert.equal((await mf.dispatchFetch(origin + '/letter/' + file)).status, 200, file);
  }
  assert.equal((await mf.dispatchFetch(origin + '/.dev.vars')).status, 404);
  assert.equal((await mf.dispatchFetch(origin + '/letter/ORCID_INTEGRATION.md')).status, 404);
  const fromPages = await call('auth/orcid/start', { method: 'POST', headers: { Origin: 'https://example.github.io', 'X-Letter-Request': '1' } });
  assert.equal(fromPages.status, 403);
  const login = await call('auth/orcid/start', { method: 'POST', headers: { Origin: origin, 'X-Letter-Request': '1' } });
  assert.equal(login.status, 200);
  const authorization = new URL((await login.json()).url);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const callback = await call('auth/orcid/callback?state=' + authorization.searchParams.get('state') + '&code=test-code', { headers: { Cookie: cookie }, redirect: 'manual' });
  assert.equal(callback.headers.get('location'), '/letter/sign/?auth=connected');
  const sessionCookie = callback.headers.getSetCookie().find(c => c.startsWith('letter_session=')).split(';')[0];
  const sessionResponse = await call('session', { headers: { Cookie: sessionCookie } });
  assert.equal(sessionResponse.headers.get('access-control-allow-origin'), null);
  const session = await sessionResponse.json();
  assert.equal(session.user.name, 'Fixture Researcher');
  assert.equal(session.letter.url, publicLetter);
  const warm = await call('coauthors', { method: 'POST', headers: { Origin: origin, 'X-Letter-Request': '1',
    'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf, Cookie: sessionCookie }, body: '{}' });
  assert.equal(warm.status, 200);
  assert.equal((await warm.json()).citationLookup.status, 'pending');
  assert.equal((await db.prepare('SELECT count(*) AS n FROM signatures').first()).n, 0);
  const submit = () => call('signatures', { method: 'POST', headers: { Origin: origin, 'X-Letter-Request': '1',
    'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf, Cookie: sessionCookie }, body: JSON.stringify({
      name: 'Fixture Researcher', affiliation: 'Test only', email: '', updates: false, consent: true, letterHash: session.letter.hash,
    }) });
  const submitted = await submit(); assert.equal(submitted.status, 201);
  assert.equal((await submitted.json()).signature.status, 'pending_review');
  assert.equal((await submit()).status, 200);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM signatures').first()).n, 1);
  const publicList = await call('signatures', { headers: { Origin: 'https://example.github.io' } });
  assert.equal(publicList.headers.get('access-control-allow-origin'), 'https://example.github.io');
  assert.equal(publicList.headers.get('access-control-allow-credentials'), null);
  assert.deepEqual(await publicList.json(), []);
  const verifier = randomBytes(32).toString('base64url'), channel = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const handoff = await call('auth/handoff', { method: 'POST', headers: { Origin: origin, Cookie: sessionCookie,
    'X-Letter-Request': '1', 'X-CSRF-Token': session.csrf }, body: JSON.stringify({ challenge, channel }) });
  assert.equal(handoff.status, 200);
  const returned = new URL((await handoff.json()).url);
  assert.equal(returned.origin, 'https://example.github.io');
  const exchange = await call('auth/exchange', { method: 'POST', headers: { Origin: returned.origin, 'X-Letter-Request': '1' },
    body: JSON.stringify({ ticket: new URLSearchParams(returned.hash.slice(1)).get('sign-ticket'), verifier, channel }) });
  assert.equal(exchange.status, 200);
  const inlineToken = (await exchange.json()).token;
  const inlineSession = await call('session', { headers: { Origin: returned.origin, Authorization: 'Bearer ' + inlineToken } });
  assert.equal(inlineSession.headers.get('access-control-allow-origin'), returned.origin);
  assert.equal((await inlineSession.json()).user.name, 'Fixture Researcher');
  const profile = await call('profile', { headers: { Origin: returned.origin, Authorization: 'Bearer ' + inlineToken } });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).status, 'retrieved');
  const inlineInfo = await (await call('session', { headers: { Origin: returned.origin, Authorization: 'Bearer ' + inlineToken } })).json();
  const inviteHeaders = { Origin: returned.origin, Authorization: 'Bearer ' + inlineToken,
    'X-Letter-Request': '1', 'X-CSRF-Token': inlineInfo.csrf, 'Content-Type': 'application/json' };
  const discovery = await call('coauthors', { method: 'POST', headers: inviteHeaders, body: '{}' });
  assert.equal(discovery.status, 200);
  assert.equal((await discovery.json()).citationLookup.status, 'pending');
  const enriched = await call('coauthors/citations', { method: 'POST', headers: inviteHeaders, body: '{}' });
  assert.equal(enriched.status, 200);
  assert.equal(enriched.headers.get('access-control-allow-origin'), returned.origin);
  const network = await enriched.json();
  assert.equal(network.candidates.length, 3); assert.equal(network.candidates[0].citations.count, 1250);
  assert.equal(network.scannedWorks, 15); assert.equal(network.source.name, 'DBLP');
  assert.equal((await db.prepare('SELECT count(*) AS n FROM researchers').first()).n, 3);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM discovery_locks').first()).n, 0);
  const prepared = await call('invitations', { method: 'POST', headers: inviteHeaders, body: JSON.stringify({ name: 'Test Collaborator' }) });
  assert.equal(prepared.status, 200); assert.equal(prepared.headers.get('access-control-allow-origin'), returned.origin);
  const invitation = (await prepared.json()).invitation;
  assert.equal(new URL(invitation.url).searchParams.get('via'), invitation.id);
  const copied = await call('invitations/action', { method: 'POST', headers: inviteHeaders, body: JSON.stringify({ id: invitation.id, action: 'copied' }) });
  assert.equal(copied.status, 200);
  assert.equal((await db.prepare('SELECT last_action FROM invitations').first()).last_action, 'copied');
  // Isolated D1 fixture for the public, current-version citation cache.
  await db.prepare(`INSERT INTO identities SELECT 'production:'||orcid, orcid, 'production', name, '', authenticated_at FROM identities`).run();
  await db.prepare(`INSERT INTO signatures SELECT 'production:0000-0002-1825-0097', letter_hash, letter_text, name,
    affiliation, email, updates, 'approved', evidence, submitted_at, reviewed_at FROM signatures`).run();
  const ranked = await (await call('signatures')).json();
  assert.equal(ranked.length, 1); assert.equal(ranked[0].citations.count, 42);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM signer_citations').first()).n, 1);
  await db.prepare("UPDATE signatures SET status='withdrawn' WHERE subject LIKE 'production:%'").run();
  assert.deepEqual(await (await call('signatures')).json(), []);
});
