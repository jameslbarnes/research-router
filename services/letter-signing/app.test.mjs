import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { configFromEnv, createApp, parseLetter, validOrcid } from './app.mjs';

const ORCID = '0000-0002-1825-0097'; // ORCID's documented example; used only in isolated test databases.
const canonical = readFileSync(new URL('../../site/letter/index.html', import.meta.url), 'utf8');
const letter = parseLetter(canonical);
const migration = readFileSync(new URL('./migrations/0001_signing.sql', import.meta.url), 'utf8');
function setup(t, { production = false, providerError = false, evidenceError = false, tokenOverrides = {} } = {}) {
  const origin = production ? 'https://letter.example.org' : 'http://localhost:8766';
  const config = configFromEnv({ APP_ORIGIN: origin, ORCID_ENV: production ? 'production' : 'sandbox',
    ORCID_CLIENT_ID: 'test-client', ORCID_CLIENT_SECRET: 'test-secret', TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32) });
  const db = new DatabaseSync(':memory:'); db.exec(migration); t.after(() => db.close());
  let now = 1000000; const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/oauth/token')) {
      if (providerError) return new Response('Provider unavailable', { status: 503 });
      return Response.json({ orcid: ORCID, name: 'Test Researcher', access_token: 'sensitive-test-token',
        refresh_token: 'sensitive-test-refresh', scope: '/authenticate', token_type: 'bearer', ...tokenOverrides });
    }
    if (evidenceError) throw new Error('Provider timed out');
    return Response.json({ employments: { 'affiliation-group': [{ summaries: [{ 'employment-summary': { organization: { name: 'Example Lab' } } }] }] }, works: { group: [] } });
  };
  const app = createApp({ config, db, letter, fetchImpl, now: () => now });
  const req = (path, options = {}) => app(new Request(origin + '/letter/api/' + path, options), 'test-address');
  const post = (path, data = {}, { cookie = '', csrf = '', origin: suppliedOrigin = origin, headers = {} } = {}) => req(path, {
    method: 'POST', headers: { Origin: suppliedOrigin, Cookie: cookie, 'X-Letter-Request': '1',
      'X-CSRF-Token': csrf, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data),
  });
  const begin = async () => {
    const res = await post('auth/orcid/start');
    const location = new URL((await res.json()).url);
    return { state: location.searchParams.get('state'), cookie: res.headers.getSetCookie()[0].split(';')[0], location, res };
  };
  const callback = flow => req(`auth/orcid/callback?state=${flow.state}&code=example-code`, { headers: { Cookie: flow.cookie } });
  const login = async () => {
    const flow = await begin(); const response = await callback(flow);
    const cookie = response.headers.getSetCookie().find(value => value.includes('letter_session='))?.split(';')[0];
    const session = await (await req('session', { headers: { Cookie: cookie || '' } })).json();
    return { flow, response, cookie, csrf: session.csrf, session };
  };
  const payload = { name: 'Test Researcher', affiliation: 'Example Lab', email: '', updates: false, consent: true, letterHash: letter.hash };
  return { config, db, req, post, begin, callback, login, calls, payload, advance: ms => { now += ms; } };
}

test('canonical consent text excludes archived comments and binds the current wording', () => {
  assert.equal(letter.paragraphs.length, 5);
  assert.ok(!letter.text.includes('Each of us, alone'));
  assert.notEqual(parseLetter(canonical.replace('fairly compensate us', 'fairly pay us')).hash, letter.hash);
  assert.ok(validOrcid(ORCID)); assert.ok(!validOrcid('0000-0002-1825-0098'));
});
test('production rejects HTTP, missing secrets and invalid encryption keys', () => {
  assert.throws(() => configFromEnv({ ORCID_ENV: 'production', APP_ORIGIN: 'http://localhost:8766' }));
  assert.throws(() => configFromEnv({ ORCID_ENV: 'production', APP_ORIGIN: 'https://example.org' }));
  assert.throws(() => configFromEnv({ TOKEN_ENCRYPTION_KEY: 'wrong' }));
  assert.equal(configFromEnv({}).configured, false);
});
test('public letter links may use GitHub Pages while OAuth stays on the signing origin', () => {
  const publicLetter = 'https://example.github.io/research-router/site/letter/studies/split-view.html';
  const config = configFromEnv({ APP_ORIGIN: 'https://signing.example.org', PUBLIC_LETTER_URL: publicLetter });
  assert.equal(config.publicLetterUrl, publicLetter);
  assert.equal(config.publicAuditUrl, 'https://example.github.io/research-router/site/letter/check/');
  assert.equal(config.redirectUri, 'https://signing.example.org/letter/api/auth/orcid/callback');
  for (const url of ['javascript:alert(1)', 'https://user:password@example.org/', 'http://example.org/']) {
    assert.throws(() => configFromEnv({ PUBLIC_LETTER_URL: url }));
  }
  assert.throws(() => configFromEnv({ PUBLIC_LETTER_URL: publicLetter, PUBLIC_AUDIT_URL: 'https://unrelated.example.org/' }));
});
test('only same-origin POST can initiate login; authorization uses the configured callback', async t => {
  const x = setup(t);
  assert.equal((await x.post('auth/orcid/start', {}, { origin: 'https://attacker.example' })).status, 403);
  assert.equal((await x.req('auth/orcid/start')).status, 404);
  const flow = await x.begin();
  assert.equal(flow.location.origin, 'https://sandbox.orcid.org');
  assert.equal(flow.location.searchParams.get('scope'), '/authenticate');
  assert.equal(flow.location.searchParams.get('redirect_uri'), 'http://localhost:8766/letter/api/auth/orcid/callback');
  assert.match(flow.res.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  assert.ok(!flow.location.href.includes('test-secret'));
});
test('unknown, expired and wrong-browser callbacks cannot authenticate', async t => {
  const x = setup(t); const flow = await x.begin();
  let res = await x.req(`auth/orcid/callback?state=${flow.state}&code=x`);
  assert.equal(res.headers.get('location'), '/letter/sign/?auth=expired');
  res = await x.callback({ ...flow, cookie: flow.cookie.slice(0, -1) + '!' });
  assert.equal(res.headers.get('location'), '/letter/sign/?auth=expired');
  x.advance(11 * 60 * 1000); res = await x.callback(flow);
  assert.equal(res.headers.get('location'), '/letter/sign/?auth=expired');
  assert.equal(x.calls.length, 0);
});
test('cancelled OAuth consumes the state and creates no signature', async t => {
  const x = setup(t); const flow = await x.begin();
  const res = await x.req(`auth/orcid/callback?state=${flow.state}&error=access_denied`, { headers: { Cookie: flow.cookie } });
  assert.equal(res.headers.get('location'), '/letter/sign/?auth=cancelled');
  assert.equal((await x.callback(flow)).headers.get('location'), '/letter/sign/?auth=expired');
  assert.equal(x.db.prepare('SELECT count(*) AS n FROM signatures').get().n, 0);
});
test('OAuth tokens stay encrypted on the server; browser receives a new opaque session', async t => {
  const x = setup(t, { production: true }); const logged = await x.login();
  assert.equal(logged.session.user.orcid, ORCID);
  assert.equal(logged.session.signature, null);
  assert.match(logged.response.headers.getSetCookie().join(';'), /__Host-letter_session=.*HttpOnly; SameSite=Lax; Max-Age=43200; Secure/);
  assert.ok(!JSON.stringify(logged.session).includes('sensitive-test'));
  const stored = x.db.prepare('SELECT token_encrypted FROM identities').get().token_encrypted;
  assert.ok(!stored.includes('sensitive-test'));
  assert.equal(stored.split('.').length, 3);
  assert.equal((await x.callback(logged.flow)).headers.get('location'), '/letter/sign/?auth=expired');
  assert.equal(x.calls.length, 1);
});
for (const overrides of [{ orcid: '0000-0002-1825-0098' }, { scope: 'openid' }, { access_token: '' }, { token_type: 'other' }]) {
  test('invalid provider identity or token is rejected ' + Object.keys(overrides)[0], async t => {
    const x = setup(t, { tokenOverrides: overrides }); const logged = await x.login();
    assert.equal(logged.response.headers.get('location'), '/letter/sign/?auth=failed');
    assert.equal(logged.session.user, null);
  });
}
test('provider failure gives a recoverable error without exposing upstream content', async t => {
  const x = setup(t, { providerError: true }); const logged = await x.login();
  assert.equal(logged.response.headers.get('location'), '/letter/sign/?auth=failed');
  assert.equal(x.db.prepare('SELECT count(*) AS n FROM identities').get().n, 0);
});
test('signing needs an authenticated session, CSRF token, current text and explicit consent', async t => {
  const x = setup(t);
  assert.equal((await x.post('signatures', x.payload)).status, 401);
  const logged = await x.login();
  assert.equal((await x.post('signatures', x.payload, { cookie: logged.cookie })).status, 403);
  assert.equal((await x.post('signatures', x.payload, { ...logged, csrf: 'é'.repeat(43) })).status, 403);
  assert.equal((await x.post('signatures', { ...x.payload, consent: false }, logged)).status, 400);
  assert.equal((await x.post('signatures', { ...x.payload, letterHash: 'outdated' }, logged)).status, 409);
  assert.equal(x.db.prepare('SELECT count(*) AS n FROM signatures').get().n, 0);
});
test('request identity comes from OAuth; duplicate submissions produce one pending signature', async t => {
  const x = setup(t); const logged = await x.login();
  const payload = { ...x.payload, orcid: 'forged-id', subject: 'forged-subject', status: 'approved' };
  assert.equal((await x.post('signatures', payload, logged)).status, 201);
  assert.equal((await x.post('signatures', payload, logged)).status, 200);
  const rows = x.db.prepare('SELECT * FROM signatures').all();
  assert.equal(rows.length, 1); assert.equal(rows[0].subject, `sandbox:${ORCID}`);
  assert.equal(rows[0].status, 'pending_review'); assert.equal(rows[0].letter_text, letter.text);
  assert.equal(JSON.parse(rows[0].evidence).status, 'retrieved');
  assert.deepEqual(await (await x.req('signatures')).json(), []);
});
test('unavailable public research data leaves the request pending for manual review', async t => {
  const x = setup(t, { evidenceError: true }); const logged = await x.login();
  assert.equal((await x.post('signatures', x.payload, logged)).status, 201);
  const row = x.db.prepare('SELECT status, evidence FROM signatures').get();
  assert.equal(row.status, 'pending_review'); assert.equal(JSON.parse(row.evidence).status, 'unavailable');
});
test('public list contains only approved production signatures and no private fields', async t => {
  const x = setup(t, { production: true }); const logged = await x.login();
  await x.post('signatures', { ...x.payload, email: 'private@example.org', updates: true }, logged);
  assert.deepEqual(await (await x.req('signatures')).json(), []);
  x.db.prepare("UPDATE signatures SET status='approved'").run();
  const visible = await (await x.req('signatures')).json();
  assert.deepEqual(visible, [{ name: 'Test Researcher', affiliation: 'Example Lab', orcid: ORCID }]);
});
test('even an approved sandbox request stays out of the public list', async t => {
  const x = setup(t); const logged = await x.login(); await x.post('signatures', x.payload, logged);
  x.db.prepare("UPDATE signatures SET status='approved'").run();
  assert.deepEqual(await (await x.req('signatures')).json(), []);
});
test('logout and session expiry prevent further signing', async t => {
  const x = setup(t); let logged = await x.login();
  assert.equal((await x.post('auth/logout', {}, logged)).status, 200);
  assert.equal((await x.post('signatures', x.payload, logged)).status, 401);
  logged = await x.login(); x.advance(13 * 60 * 60 * 1000);
  assert.equal((await x.post('signatures', x.payload, logged)).status, 401);
});
test('malformed and oversized input is rejected', async t => {
  const x = setup(t); const logged = await x.login();
  for (const patch of [{ name: '' }, { updates: true }, { name: 'x'.repeat(161) }, { affiliation: 'a\nb' }, { email: 'broken' }]) {
    assert.equal((await x.post('signatures', { ...x.payload, ...patch }, logged)).status, 400);
  }
  assert.equal((await x.post('signatures', { ...x.payload, name: 'x'.repeat(9000) }, logged)).status, 413);
});
test('login rate limits expire', async t => {
  const x = setup(t);
  for (let i = 0; i < 60; i++) assert.equal((await x.post('auth/orcid/start')).status, 200);
  assert.equal((await x.post('auth/orcid/start')).status, 429);
  x.advance(11 * 60 * 1000);
  assert.equal((await x.post('auth/orcid/start')).status, 200);
});
