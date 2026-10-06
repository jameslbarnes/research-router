import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { configFromEnv, createApp, parseLetter, validOrcid } from './app.mjs';
import { fixtureActivities, fixturePapers, fixtureCitationAuthors, fixtureBibliography } from './invitations.fixtures.mjs';

const ORCID = '0000-0002-1825-0097'; // ORCID's documented example; used only in isolated test databases.
const canonical = readFileSync(new URL('../../site/letter/index.html', import.meta.url), 'utf8');
const letter = parseLetter(canonical);
const migration = readdirSync(new URL('./migrations/', import.meta.url)).sort().map(file => readFileSync(new URL('./migrations/' + file, import.meta.url), 'utf8')).join('\n');
function setup(t, { production = false, providerError = false, evidenceError = false, tokenOverrides = {}, publicLetter, person = {}, activities, papers = {}, screeningItems = [], citationAuthors = fixtureCitationAuthors, citationError = false, beforeCitation, bibliography = { results: { bindings: [] } } } = {}) {
  const origin = production ? 'https://letter.example.org' : 'http://localhost:8766';
  const config = configFromEnv({ APP_ORIGIN: origin, ORCID_ENV: production ? 'production' : 'sandbox',
    ORCID_CLIENT_ID: 'test-client', ORCID_CLIENT_SECRET: 'test-secret', TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32), PUBLIC_LETTER_URL: publicLetter });
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON'); db.exec(migration); t.after(() => db.close());
  let now = 1000000; const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/oauth/token')) {
      if (providerError) return new Response('Provider unavailable', { status: 503 });
      return Response.json({ orcid: ORCID, name: 'Test Researcher', access_token: 'sensitive-test-token',
        refresh_token: 'sensitive-test-refresh', scope: '/authenticate', token_type: 'bearer', ...tokenOverrides });
    }
    if (evidenceError) throw new Error('Provider timed out');
    if (url.startsWith('https://api.crossref.org/works?')) {
      assert.equal(options.headers.Authorization, undefined, 'Never forward an ORCID token to Crossref');
      assert.equal(new URL(url).searchParams.get('filter'), 'orcid:' + ORCID, 'Screen the authenticated identity');
      return Response.json({ status: 'ok', message: { items: screeningItems, 'total-results': screeningItems.length } });
    }
    if (url.startsWith('https://sparql.dblp.org/sparql?')) {
      assert.equal(options.headers.Authorization, undefined, 'Never forward an ORCID token to DBLP');
      assert.ok(new URL(url).searchParams.get('query').includes('https://orcid.org/' + ORCID));
      return Response.json(bibliography);
    }
    if (url.startsWith('https://api.openalex.org/authors?')) {
      assert.equal(options.headers.Authorization, undefined, 'Never forward an ORCID token to OpenAlex');
      await beforeCitation?.();
      return citationError ? new Response('Rate limited', { status: 429 }) : Response.json(citationAuthors);
    }
    if (url.startsWith('https://api.crossref.org/works/')) {
      assert.equal(options.headers.Authorization, undefined, 'Never forward an ORCID token to Crossref');
      const doi = decodeURIComponent(url.split('/works/')[1]);
      return papers[doi] ? Response.json(papers[doi]) : new Response('Not found', { status: 404 });
    }
    if (url.endsWith('/person')) return Response.json(person);
    assert.ok(url.endsWith('/activities'), 'Use the documented /activities endpoint');
    return Response.json(activities || { employments: { 'affiliation-group': [{ summaries: [{ 'employment-summary': { organization: { name: 'Example Lab' } } }] }] }, works: { group: [] } });
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

async function signedFixture(t, options = {}) {
  const x = setup(t, { activities: fixtureActivities, papers: fixturePapers, ...options });
  const user = await x.login();
  assert.equal((await x.post('signatures', { ...x.payload, email: 'private@example.org' }, user)).status, 201);
  return { ...x, user };
}
async function rankedNetwork(x, user = x.user) {
  const discovery = await x.post('coauthors', {}, user);
  assert.equal(discovery.status, 200);
  const citations = await x.post('coauthors/citations', {}, user);
  assert.equal(citations.status, 200);
  return citations.json();
}
function anotherUser(x) {
  const subject = 'sandbox:0000-0001-5109-3700', sessionToken = randomBytes(32).toString('base64url'), csrf = randomBytes(32).toString('base64url');
  x.db.prepare('INSERT INTO identities VALUES (?, ?, ?, ?, ?, ?)').run(subject, '0000-0001-5109-3700', 'sandbox', 'Another Researcher', '', 1000000);
  x.db.prepare('INSERT INTO sessions (session_hash, subject, csrf, expires_at) VALUES (?, ?, ?, ?)')
    .run(createHash('sha256').update(sessionToken).digest('hex'), subject, csrf, 1000000 + 600000);
  return { cookie: 'letter_session=' + sessionToken, csrf, subject };
}

test('invitations require a signature, session and CSRF; withdrawn signers lose access', async t => {
  const x = setup(t);
  assert.equal((await x.req('invitations')).status, 401);
  assert.equal((await x.post('coauthors')).status, 401);
  assert.equal((await x.post('coauthors/citations')).status, 401);
  const user = await x.login();
  assert.equal((await x.post('invitations', {}, user)).status, 403);
  await x.post('signatures', x.payload, user);
  assert.equal((await x.post('invitations', {}, { ...user, csrf: 'wrong' })).status, 403);
  assert.equal((await x.post('coauthors', {}, { ...user, origin: 'https://other.example' })).status, 403);
  assert.equal((await x.post('coauthors/citations', {}, { ...user, csrf: 'wrong' })).status, 403);
  x.db.prepare("UPDATE signatures SET status='withdrawn'").run();
  assert.equal((await x.post('invitations', {}, user)).status, 403);
  assert.equal((await x.req('invitations', { headers: { Cookie: user.cookie } })).status, 403);
  assert.equal((await x.post('coauthors', {}, user)).status, 403);
  assert.equal((await x.post('coauthors/citations', {}, user)).status, 403);
});
test('ORCID connection can warm coauthors before signing; slow citations do not hold up signing or invitations', async t => {
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const waiting = new Promise(resolve => { started = resolve; });
  const x = setup(t, { bibliography: fixtureBibliography, beforeCitation: () => { started(); return gate; } });
  const user = await x.login();
  assert.equal((await x.post('coauthors', {}, { ...user, csrf: 'wrong' })).status, 403);
  const first = await (await x.post('coauthors', { orcid: '0000-0002-9910-0292' }, user)).json();
  assert.equal(first.scannedWorks, 15); assert.equal(first.citationLookup.status, 'pending');
  assert.equal(x.db.prepare('SELECT count(*) AS n FROM signatures').get().n, 0);
  assert.equal(x.db.prepare('SELECT count(*) AS n FROM invitations').get().n, 0);
  assert.equal((await x.post('invitations', { candidateId: first.candidates[0].id }, user)).status, 403);
  assert.equal((await x.req('invitations', { headers: { Cookie: user.cookie } })).status, 403);
  const enrichment = x.post('coauthors/citations', {}, user);
  await waiting;
  const other = anotherUser(x);
  assert.equal((await x.post('coauthors/citations', {}, other)).status, 409, 'Another account cannot enrich this private snapshot');
  assert.equal((await x.post('signatures', x.payload, user)).status, 201);
  assert.equal((await x.post('invitations', { candidateId: first.candidates[0].id }, user)).status, 200);
  const partial = await (await x.req('invitations', { headers: { Cookie: user.cookie } })).json();
  assert.equal(partial.network.citationLookup.status, 'pending');
  release();
  const ranked = await (await enrichment).json();
  assert.equal(ranked.candidates[0].citations.count, 1250);
  const calls = x.calls.length;
  assert.deepEqual(await rankedNetwork(x, user), ranked);
  assert.equal(x.calls.length, calls, 'The signature transition reuses the warm lookup');
});
test('pre-sign discovery can use ORCID works when DBLP has no bibliography', async t => {
  const x = setup(t, { activities: fixtureActivities, papers: fixturePapers });
  const user = await x.login();
  const result = await (await x.post('coauthors', {}, user)).json();
  assert.equal(result.scannedWorks, 2); assert.equal(result.candidates.length, 3);
  assert.equal(result.source.name, 'ORCID');
  assert.equal(x.db.prepare('SELECT count(*) AS n FROM signatures').get().n, 0);
});
test('a late citation response cannot overwrite a newer bibliography snapshot', async t => {
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const waiting = new Promise(resolve => { started = resolve; });
  const x = setup(t, { bibliography: fixtureBibliography, beforeCitation: () => { started(); return gate; } });
  const user = await x.login();
  const first = await (await x.post('coauthors', {}, user)).json();
  const pending = x.post('coauthors/citations', {}, user); await waiting;
  const next = { ...first, revision: 'a-newer-lookup', candidates: [] };
  x.db.prepare('UPDATE research_networks SET snapshot=? WHERE subject=?').run(JSON.stringify(next), 'sandbox:' + ORCID);
  release();
  const result = await (await pending).json();
  assert.equal(result.revision, next.revision); assert.deepEqual(result.candidates, []);
});
test('coauthor discovery keeps evidence, excludes self, merges ORCIDs and separates namesakes', async t => {
  const x = await signedFixture(t);
  const response = await x.post('coauthors', {}, x.user); assert.equal(response.status, 200);
  const first = await response.json();
  assert.equal(first.citationLookup.status, 'pending');
  assert.ok(first.candidates.every(c => c.citations === null));
  assert.ok(!x.calls.some(c => c.url.startsWith('https://api.openalex.org/')));
  const network = await (await x.post('coauthors/citations', {}, x.user)).json();
  assert.equal(network.status, 'retrieved'); assert.equal(network.scannedWorks, 2);
  assert.equal(network.candidates.length, 3);
  assert.equal(network.candidates[0].name, 'Maya Chen'); assert.equal(network.candidates[0].papers.length, 2);
  assert.equal(network.candidates[0].citations.count, 1250);
  assert.equal(network.citationLookup.matchedCandidates, 1);
  const namesakes = network.candidates.filter(c => c.name === 'Alex Morgan');
  assert.equal(namesakes.length, 2); assert.notEqual(namesakes[0].id, namesakes[1].id);
  assert.equal(x.db.prepare('SELECT count(*) AS n FROM researchers').get().n, 3);
  assert.equal(network.candidates[0].papers[0].url, 'https://doi.org/10.1234%2Ffixture-1');
  const calls = x.calls.length;
  assert.deepEqual(await rankedNetwork(x), network);
  assert.equal(x.calls.length, calls, 'Repeated discovery uses our database');
  const invitation = await (await x.post('invitations', { candidateId: network.candidates[0].id }, x.user)).json();
  assert.equal(invitation.invitation.name, 'Maya Chen'); assert.equal(invitation.invitation.papers.length, 2);
  assert.ok(!JSON.stringify(network).includes('private@example.org'));
  assert.ok(!JSON.stringify(invitation).includes('private@example.org'));
});
test('suggestions balance shared papers with square-root citations and break score ties by shared papers', async t => {
  const papers = structuredClone(fixturePapers);
  papers['10.1234/fixture-1'].message.author.push(
    { given: 'Zed', family: 'Expert', ORCID: 'https://orcid.org/0000-0002-9910-0292' },
    { given: 'New', family: 'Researcher', ORCID: 'https://orcid.org/0000-0003-1523-163X' });
  const citationAuthors = { meta: { count: 3 }, results: [...fixtureCitationAuthors.results,
    { id: 'https://openalex.org/A200', orcid: 'https://orcid.org/0000-0002-9910-0292', display_name: 'Zed Middle Expert', cited_by_count: 3000 },
    { id: 'https://openalex.org/A300', orcid: 'https://orcid.org/0000-0003-1523-163X', display_name: 'New Researcher', cited_by_count: 0 }] };
  const x = await signedFixture(t, { papers, citationAuthors });
  const network = await rankedNetwork(x);
  // Two collaborations with 1,250 citations beat one with 3,000. Raw citation
  // order and raw shared-papers × citations would both put Zed first.
  assert.deepEqual(network.candidates.map(c => c.name), ['Maya Chen', 'Zed Expert', 'Alex Morgan', 'Alex Morgan', 'New Researcher']);
  assert.deepEqual(network.candidates.map(c => c.citations?.count ?? null), [1250, 3000, null, null, 0]);
  const requests = x.calls.filter(c => c.url.startsWith('https://api.openalex.org/'));
  assert.equal(requests.length, 1, 'Batch author lookups');
  const params = new URL(requests[0].url).searchParams;
  assert.equal(params.get('per_page'), '100');
  assert.ok(!requests[0].url.includes('private@example.org'));
  citationAuthors.results[1].cited_by_count = 9000;
  x.advance(24 * 60 * 60 * 1000 + 1);
  // Renew the isolated session after advancing beyond the snapshot TTL.
  let user = await x.login();
  const influential = await rankedNetwork(x, user);
  assert.equal(influential.candidates[0].name, 'Zed Expert', 'Citations still affect the ordering');
  citationAuthors.results[0] = { ...fixtureCitationAuthors.results[0], cited_by_count: 24 };
  citationAuthors.results[1].cited_by_count = 99;
  x.advance(24 * 60 * 60 * 1000 + 1);
  user = await x.login();
  const tied = await rankedNetwork(x, user);
  assert.equal(tied.candidates[0].name, 'Maya Chen', 'Equal scores favour more shared papers');
});
test('unknown citations fall back to shared papers and can rank above known counts', async t => {
  const bibliography = structuredClone(fixtureBibliography);
  bibliography.results.bindings = bibliography.results.bindings.filter(row =>
    row.coauthor.value !== 'https://dblp.org/pid/maya' || row.paper.value.endsWith('/0'));
  for (const count of [0, 3]) {
    const citationAuthors = { meta: { count: 1 }, results: [{ ...fixtureCitationAuthors.results[0], cited_by_count: count }] };
    const x = await signedFixture(t, { bibliography, citationAuthors });
    const network = await rankedNetwork(x);
    assert.deepEqual(network.candidates.map(c => c.papers.length), [8, 7, 1]);
    assert.deepEqual(network.candidates.map(c => c.citations?.count ?? null), [null, null, count]);
  }
});
test('ambiguous, mismatched and invalid citation records remain unknown', async t => {
  const base = fixtureCitationAuthors.results[0];
  const cases = [
    [{ ...base, display_name: 'Someone Else', display_name_alternatives: ['Maya Chen'] }],
    [{ ...base, orcid: 'https://orcid.org/0000-0002-9910-0292' }],
    [base, { ...base, id: 'https://openalex.org/A201', cited_by_count: 6000 }],
    [{ ...base, cited_by_count: -1 }], [{ ...base, cited_by_count: null }], [{ ...base, cited_by_count: '200' }],
    [{ ...base, id: 'javascript:alert(1)' }],
  ];
  for (const results of cases) {
    const x = await signedFixture(t, { citationAuthors: { meta: { count: results.length }, results } });
    const network = await rankedNetwork(x);
    assert.equal(network.citationLookup.matchedCandidates, 0);
    assert.ok(network.candidates.every(c => c.citations === null));
  }
});
test('citation failures and truncated results preserve coauthors and usable invitations', async t => {
  for (const options of [{ citationError: true }, { citationAuthors: { meta: { count: 101 }, results: fixtureCitationAuthors.results } }]) {
    const x = await signedFixture(t, options);
    const network = await rankedNetwork(x);
    assert.equal(network.status, 'retrieved'); assert.equal(network.citationLookup.status, 'unavailable');
    assert.equal(network.candidates.length, 3);
    assert.equal(network.candidates[0].name, 'Maya Chen');
    assert.equal((await x.post('invitations', { candidateId: network.candidates[0].id }, x.user)).status, 200);
    const before = x.calls.length;
    await x.post('coauthors', {}, x.user);
    assert.equal(x.calls.length, before, 'Cache failures briefly instead of hammering the provider');
  }
});
test('old coauthor snapshots are refreshed to use combined invitation ranking', async t => {
  const x = await signedFixture(t);
  x.db.prepare('INSERT INTO research_networks VALUES (?, ?, ?)').run('sandbox:' + ORCID,
    JSON.stringify({ version: 3, candidates: [], status: 'retrieved' }), 1000000);
  const network = await rankedNetwork(x);
  assert.equal(network.version, 5);
  assert.equal(network.candidates[0].citations.count, 1250);
});
test('curated bibliography discovery covers works beyond ORCID and joins coauthors by stable IDs', async t => {
  const x = await signedFixture(t, { bibliography: fixtureBibliography });
  const network = await rankedNetwork(x);
  assert.equal(network.source.name, 'DBLP'); assert.equal(network.source.url, 'https://dblp.org/pid/test');
  assert.equal(network.scannedWorks, 15); assert.equal(network.limited, false);
  assert.equal(network.candidates.length, 3);
  assert.equal(network.candidates[0].name, 'Maya Chen'); assert.equal(network.candidates[0].papers.length, 15);
  assert.equal(network.candidates[0].citations.count, 1250);
  const namesakes = network.candidates.filter(c => c.name === 'Alex Morgan');
  assert.equal(namesakes.length, 2); assert.notEqual(namesakes[0].id, namesakes[1].id);
  assert.deepEqual(namesakes.map(c => c.papers.length).sort(), [7, 8]);
  assert.ok(!x.calls.some(c => c.url.startsWith('https://api.crossref.org/works/')), 'Do not fetch one DOI at a time when a bibliography is available');
  const invitation = await (await x.post('invitations', { candidateId: network.candidates[0].id }, x.user)).json();
  assert.equal(invitation.invitation.papers.length, 15);
});
test('conflicting bibliography identities fall back to ORCID-linked paper evidence', async t => {
  const bibliography = structuredClone(fixtureBibliography);
  bibliography.results.bindings[0].person.value = 'https://dblp.org/pid/someone-else';
  const x = await signedFixture(t, { bibliography });
  const network = await rankedNetwork(x);
  assert.equal(network.source.name, 'ORCID'); assert.equal(network.scannedWorks, 2);
});
test('one bibliography with multiple ORCIDs stays one coauthor with an unknown citation count', async t => {
  const bibliography = structuredClone(fixtureBibliography);
  const maya = bibliography.results.bindings.find(row => row.coauthor.value.endsWith('/maya'));
  bibliography.results.bindings.push({ ...maya, orcid: { value: 'https://orcid.org/0000-0002-9910-0292' } });
  const x = await signedFixture(t, { bibliography });
  const network = await rankedNetwork(x);
  const matches = network.candidates.filter(c => c.name === 'Maya Chen');
  assert.equal(matches.length, 1); assert.equal(matches[0].orcid, '');
  assert.equal(matches[0].citations, null); assert.equal(matches[0].papers.length, 15);
});
test('missing metadata leaves sharing usable and reports partial discovery', async t => {
  const x = await signedFixture(t, { papers: { '10.1234/fixture-1': fixturePapers['10.1234/fixture-1'] } });
  const network = await rankedNetwork(x);
  assert.equal(network.status, 'partial'); assert.equal(network.scannedWorks, 1);
  assert.equal((await x.post('invitations', { name: 'Someone I know' }, x.user)).status, 200);
});
test('discovery respects another Worker’s lease and recovers after it expires', async t => {
  const x = await signedFixture(t);
  x.db.prepare('INSERT INTO discovery_locks VALUES (?, ?, ?)').run('crossref', 'another-worker', 1000000 + 45000);
  const before = x.calls.filter(c => c.url.startsWith('https://api.crossref.org/')).length;
  assert.equal((await x.post('coauthors', {}, x.user)).status, 429);
  assert.equal(x.calls.filter(c => c.url.startsWith('https://api.crossref.org/')).length, before);
  x.advance(45001);
  assert.equal((await x.post('coauthors', {}, x.user)).status, 200);
  assert.equal(x.db.prepare('SELECT count(*) AS n FROM discovery_locks').get().n, 0);
});
test('large author lists are bounded and reported as a sample', async t => {
  const papers = structuredClone(fixturePapers);
  papers['10.1234/fixture-1'].message.author = Array.from({ length: 250 }, (_, n) => ({ given: 'Researcher', family: String(n) }));
  const x = await signedFixture(t, { papers });
  const network = await rankedNetwork(x);
  assert.equal(network.candidates.length, 60); assert.equal(network.limited, true);
  assert.equal(x.db.prepare('SELECT count(*) AS n FROM researchers').get().n, 60);
});
test('empty or unavailable records support manual invitations without inventing coauthors', async t => {
  for (const options of [{ activities: { works: { group: [] } } }, { evidenceError: true }]) {
    const x = await signedFixture(t, options);
    const network = await rankedNetwork(x);
    assert.deepEqual(network.candidates, []);
    assert.equal(network.status, options.evidenceError ? 'unavailable' : 'retrieved');
    assert.equal((await x.post('invitations', {}, x.user)).status, 200);
  }
});
test('invitation preparation is idempotent, uses the configured URL, and never sends messages', async t => {
  const x = await signedFixture(t, { publicLetter: 'https://example.github.io/project/letter.html' });
  const calls = x.calls.length;
  const first = (await (await x.post('invitations', { name: 'Maya Chen' }, x.user)).json()).invitation;
  const second = (await (await x.post('invitations', { name: 'Maya Chen' }, x.user)).json()).invitation;
  assert.equal(first.id, second.id);
  const url = new URL(first.url); assert.equal(url.origin, 'https://example.github.io');
  assert.equal(url.searchParams.get('via'), first.id); assert.equal(url.hash, '');
  assert.ok(!first.url.includes('Maya')); assert.equal(first.lastAction, null);
  assert.equal(x.calls.length, calls, 'Preparing an invitation has no outgoing provider call');
  assert.equal((await x.post('invitations', { candidateId: 'invented' }, x.user)).status, 400);
  assert.equal((await x.post('invitations', { name: 'x'.repeat(161) }, x.user)).status, 400);
});
test('another signer cannot read invitation details or record another person’s sharing action', async t => {
  const x = await signedFixture(t);
  const invitation = (await (await x.post('invitations', { name: 'Private recipient label' }, x.user)).json()).invitation;
  const other = anotherUser(x); await x.post('signatures', x.payload, other);
  const list = await (await x.req('invitations', { headers: { Cookie: other.cookie } })).json();
  assert.deepEqual(list.invitations, []); assert.equal(list.network, null);
  assert.equal((await x.post('invitations/action', { id: invitation.id, action: 'copied' }, other)).status, 404);
  assert.equal((await x.post('invitations/action', { id: invitation.id, action: 'sent' }, x.user)).status, 404);
  assert.equal((await x.post('invitations/action', { id: invitation.id, action: 'share_menu' }, x.user)).status, 200);
  const stored = x.db.prepare('SELECT last_action FROM invitations WHERE id=?').get(invitation.id);
  assert.equal(stored.last_action, 'share_menu');
});
test('a new signature can follow an invitation and prepare its own next invitation', async t => {
  const x = await signedFixture(t);
  x.db.prepare("UPDATE signatures SET letter_hash='earlier-copy'").run();
  const invite = (await (await x.post('invitations', { name: 'A colleague' }, x.user)).json()).invitation;
  const other = anotherUser(x);
  const signed = await x.post('signatures', { ...x.payload, via: invite.id }, other); assert.equal(signed.status, 201);
  let refs = x.db.prepare('SELECT * FROM invitation_referrals').all();
  assert.equal(refs.length, 1); assert.equal(refs[0].subject, other.subject); assert.equal(refs[0].invitation_id, invite.id);
  const next = (await (await x.post('invitations', {}, other)).json()).invitation;
  assert.notEqual(next.id, invite.id);
  await x.post('signatures', { ...x.payload, via: next.id }, other);
  refs = x.db.prepare('SELECT * FROM invitation_referrals').all();
  assert.equal(refs.length, 1); assert.equal(refs[0].invitation_id, invite.id, 'Retries cannot overwrite attribution');
  const visible = await (await x.req('invitations', { headers: { Cookie: x.user.cookie } })).json();
  assert.ok(!JSON.stringify(visible).includes(other.subject), 'Pending signer identity is not exposed to the inviter');
});
test('invalid referrals never block signing; existing signatures cannot be retroactively attributed', async t => {
  const x = await signedFixture(t);
  const invite = (await (await x.post('invitations', {}, x.user)).json()).invitation;
  await x.post('signatures', { ...x.payload, via: invite.id }, x.user);
  const other = anotherUser(x);
  assert.equal((await x.post('signatures', { ...x.payload, via: 'made-up' }, other)).status, 201);
  await x.post('signatures', { ...x.payload, via: invite.id }, other);
  assert.equal(x.db.prepare('SELECT count(*) AS n FROM invitation_referrals').get().n, 0);
});

test('canonical consent text excludes archived comments and binds the current wording', () => {
  assert.equal(letter.paragraphs.length, 7);
  assert.ok(!letter.text.includes('Each of us, alone'));
  assert.notEqual(parseLetter(canonical.replace('fairly compensates us', 'fairly pays us')).hash, letter.hash);
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
  assert.equal(JSON.parse(rows[0].evidence).screening.reason, 'no_publication_match');
  assert.deepEqual(await (await x.req('signatures')).json(), []);
});
test('unavailable public research data leaves the request pending for manual review', async t => {
  const x = setup(t, { evidenceError: true }); const logged = await x.login();
  assert.equal((await x.post('signatures', x.payload, logged)).status, 201);
  const row = x.db.prepare('SELECT status, evidence FROM signatures').get();
  assert.equal(row.status, 'pending_review'); assert.equal(JSON.parse(row.evidence).screening.reason, 'lookup_unavailable');
});
test('clear publication matches publish immediately and retries cannot restore a withdrawn signature', async t => {
  const x = setup(t, { production: true, screeningItems: [{ DOI: '10.1234/fixture',
    author: [{ given: 'Test', family: 'Researcher', ORCID: 'https://orcid.org/' + ORCID }] }] });
  const logged = await x.login();
  const response = await x.post('signatures', { ...x.payload, email: 'private@example.org', updates: true }, logged);
  assert.equal(response.status, 201); assert.equal((await response.json()).signature.status, 'approved');
  const row = x.db.prepare('SELECT * FROM signatures').get();
  assert.equal(row.reviewed_at, 1000000); assert.equal(row.letter_text, letter.text);
  assert.equal(JSON.parse(row.evidence).screening.reason, 'publication_match');
  assert.deepEqual(await (await x.req('signatures')).json(), [{ name: 'Test Researcher', affiliation: 'Example Lab', orcid: ORCID, citations: null }]);
  const calls = x.calls.length;
  assert.equal((await x.post('signatures', x.payload, logged)).status, 200);
  assert.equal(x.calls.length, calls, 'Duplicate submissions reuse the saved screening');
  x.db.prepare("UPDATE signatures SET status='withdrawn'").run();
  assert.equal((await (await x.post('signatures', x.payload, logged)).json()).signature.status, 'withdrawn');
  assert.deepEqual(await (await x.req('signatures')).json(), []);
  assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM signatures').get().n, 1);
});
test('a matching publication cannot approve a signature submitted under a different name', async t => {
  const x = setup(t, { production: true, screeningItems: [{ DOI: '10.1234/fixture',
    author: [{ given: 'Test', family: 'Researcher', ORCID }] }] });
  const logged = await x.login();
  await x.post('signatures', { ...x.payload, name: 'Somebody Else', status: 'approved' }, logged);
  assert.equal(x.db.prepare('SELECT status FROM signatures').get().status, 'pending_review');
  assert.deepEqual(await (await x.req('signatures')).json(), []);
});
test('public list contains only approved production signatures and no private fields', async t => {
  const x = setup(t, { production: true }); const logged = await x.login();
  await x.post('signatures', { ...x.payload, email: 'private@example.org', updates: true }, logged);
  assert.deepEqual(await (await x.req('signatures')).json(), []);
  x.db.prepare("UPDATE signatures SET status='approved'").run();
  const visible = await (await x.req('signatures')).json();
  assert.deepEqual(visible, [{ name: 'Test Researcher', affiliation: 'Example Lab', orcid: ORCID, citations: null }]);
});
test('even an approved sandbox request stays out of the public list', async t => {
  const x = setup(t); const logged = await x.login(); await x.post('signatures', x.payload, logged);
  x.db.prepare("UPDATE signatures SET status='approved'").run();
  assert.deepEqual(await (await x.req('signatures')).json(), []);
});
test('copy edits keep signers visible and recognised without changing their original signed text', async t => {
  const x = setup(t, { production: true }); const user = await x.login();
  await x.post('signatures', x.payload, user);
  x.db.prepare("UPDATE signatures SET status='approved', letter_hash='earlier-copy', letter_text='Original signed text'").run();
  const original = x.db.prepare('SELECT * FROM signatures').get();
  assert.equal((await (await x.req('signatures')).json()).length, 1);
  const session = await (await x.req('session', { headers: { Cookie: user.cookie } })).json();
  assert.equal(session.signature.status, 'approved');
  assert.equal((await x.req('invitations', { headers: { Cookie: user.cookie } })).status, 200);
  assert.equal((await x.post('signatures', x.payload, user)).status, 200);
  assert.deepEqual(x.db.prepare('SELECT * FROM signatures').all(), [original]);
});
test('latest signature status wins across copy edits without duplicating or reviving old approvals', async t => {
  const x = setup(t, { production: true }); const user = await x.login();
  await x.post('signatures', x.payload, user);
  x.db.prepare("UPDATE signatures SET status='approved', letter_hash='earlier-copy'").run();
  x.db.prepare(`INSERT INTO signatures SELECT subject, ?, 'Updated copy', name, affiliation, email, updates,
    'approved', evidence, submitted_at + 1, reviewed_at FROM signatures`).run(letter.hash);
  assert.equal((await (await x.req('signatures')).json()).length, 1, 'Show each signer once');
  for (const status of ['pending_review', 'withdrawn']) {
    x.db.prepare('UPDATE signatures SET status=? WHERE letter_hash=?').run(status, letter.hash);
    assert.deepEqual(await (await x.req('signatures')).json(), []);
    const session = await (await x.req('session', { headers: { Cookie: user.cookie } })).json();
    assert.equal(session.signature.status, status);
    assert.equal((await (await x.post('signatures', x.payload, user)).json()).signature.status, status);
  }
  assert.equal((await x.post('invitations', {}, user)).status, 403);
  assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM signatures').get().n, 2);
});
test('public signers rank by total citations, cache counts, and keep approved earlier-copy records', async t => {
  const authors = { meta: { count: 3 }, results: [
    { id: 'https://openalex.org/A101', orcid: ORCID, display_name: 'Test Researcher', cited_by_count: 50 },
    { id: 'https://openalex.org/A102', orcid: '0000-0001-5109-3700', display_name: 'Maya Chen', cited_by_count: 1200 },
    { id: 'https://openalex.org/A103', orcid: '0000-0002-9910-0292', display_name: 'Zero Researcher', cited_by_count: 0 },
  ] };
  const x = setup(t, { production: true, citationAuthors: authors });
  const user = await x.login(); await x.post('signatures', x.payload, user);
  x.db.prepare("UPDATE signatures SET status='approved'").run();
  const seed = (orcid, name, status = 'approved', hash = letter.hash, environment = 'production') => {
    const subject = environment + ':' + orcid;
    x.db.prepare('INSERT INTO identities VALUES (?, ?, ?, ?, ?, ?)').run(subject, orcid, environment, name, '', 1000000);
    x.db.prepare(`INSERT INTO signatures (subject,letter_hash,letter_text,name,affiliation,email,updates,status,evidence,submitted_at)
      VALUES (?,?,'fixture',?,'Example Lab','private@example.org',0,?,'{}',1000000)`).run(subject, hash, name, status);
  };
  seed('0000-0001-5109-3700', 'Maya Chen'); seed('0000-0002-9910-0292', 'Zero Researcher');
  seed('unknown', 'Unknown Researcher'); seed('pending', 'Pending Researcher', 'pending_review');
  seed('withdrawn', 'Withdrawn Researcher', 'withdrawn'); seed('old', 'Old Letter Researcher', 'approved', 'old-hash');
  seed('sandbox', 'Sandbox Researcher', 'approved', letter.hash, 'sandbox');
  const get = async () => (await x.req('signatures')).json();
  const visible = await get();
  assert.deepEqual(visible.map(s => s.name), ['Maya Chen', 'Test Researcher', 'Zero Researcher', 'Old Letter Researcher', 'Unknown Researcher']);
  assert.deepEqual(visible.map(s => s.citations?.count ?? null), [1200, 50, 0, null, null]);
  assert.equal(visible[0].citations.source, 'OpenAlex');
  assert.ok(visible.every(s => Object.keys(s).sort().join() === 'affiliation,citations,name,orcid'));
  const providerCalls = () => x.calls.filter(c => c.url.startsWith('https://api.openalex.org/'));
  assert.equal(providerCalls().length, 1);
  assert.ok(!/pending|withdrawn|sandbox/.test(new URL(providerCalls()[0].url).searchParams.get('filter')));
  await get(); assert.equal(providerCalls().length, 1, 'Reuse cached counts');
  x.advance(25 * 3600000); authors.results[1].cited_by_count = 10;
  assert.equal((await get())[0].name, 'Test Researcher', 'Refresh changes order');
  authors.results = null; x.advance(25 * 3600000);
  const stale = await get(); assert.equal(stale.find(s => s.name === 'Maya Chen').citations.count, 10);
  const attempts = providerCalls().length; await get(); assert.equal(providerCalls().length, attempts, 'Back off on provider failure');
  x.db.prepare("UPDATE signatures SET name='Different Researcher' WHERE name='Maya Chen'").run();
  assert.equal((await get()).find(s => s.name === 'Different Researcher').citations, null, 'Changed names cannot inherit old counts');
});
test('a citation refresh holds one lease and rechecks withdrawal before returning public signers', async t => {
  let release, began;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { began = resolve; });
  const x = setup(t, { production: true, beforeCitation: async () => { began(); await gate; } });
  const user = await x.login(); await x.post('signatures', x.payload, user);
  x.db.prepare("UPDATE signatures SET status='approved'").run();
  const first = x.req('signatures'); await started;
  const concurrent = await (await x.req('signatures')).json();
  assert.equal(concurrent.length, 1); assert.equal(concurrent[0].citations, null);
  assert.equal(x.calls.filter(c => c.url.startsWith('https://api.openalex.org/')).length, 1);
  x.db.prepare("UPDATE signatures SET status='withdrawn'").run(); release();
  assert.deepEqual(await (await first).json(), []);
  assert.equal(x.db.prepare("SELECT count(*) AS n FROM discovery_locks WHERE lock_key='public-signers'").get().n, 0);
});
test('large public lists refresh in bounded batches without omitting signers', async t => {
  const x = setup(t, { production: true, citationAuthors: { results: [], meta: { count: 0 } } });
  for (let i = 0; i < 51; i++) {
    const subject = 'production:fixture-' + i;
    x.db.prepare('INSERT INTO identities VALUES (?, ?, ?, ?, ?, ?)').run(subject, 'fixture-' + i, 'production', 'Researcher ' + i, '', 1000000);
    x.db.prepare(`INSERT INTO signatures (subject,letter_hash,letter_text,name,affiliation,email,updates,status,evidence,submitted_at)
      VALUES (?,?,'fixture',?,'Example Lab','',0,'approved','{}',?)`).run(subject, letter.hash, 'Researcher ' + i, i);
  }
  assert.equal((await (await x.req('signatures')).json()).length, 51);
  assert.equal(x.db.prepare('SELECT count(*) AS n FROM signer_citations').get().n, 50);
  assert.equal((await (await x.req('signatures')).json()).length, 51);
  assert.equal(x.db.prepare('SELECT count(*) AS n FROM signer_citations').get().n, 51);
  assert.equal(x.calls.length, 2);
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

const pagesOrigin = 'https://example.github.io';
async function inlineLogin(x, logged) {
  const verifier = randomBytes(32).toString('base64url'), channel = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const response = await x.post('auth/handoff', { challenge, channel }, logged);
  assert.equal(response.status, 200);
  const target = new URL((await response.json()).url);
  const ticket = new URLSearchParams(target.hash.slice(1)).get('sign-ticket');
  return { verifier, channel, challenge, ticket, target };
}
test('inline signing exchanges a single-use proof-bound handoff and requires consent and CSRF', async t => {
  const x = setup(t, { publicLetter: pagesOrigin + '/letter.html' });
  const logged = await x.login(), handoff = await inlineLogin(x, logged);
  assert.equal(handoff.target.origin, pagesOrigin);
  assert.equal(handoff.target.pathname, '/letter.html');
  const options = { origin: pagesOrigin };
  const wrong = { ...handoff, verifier: randomBytes(32).toString('base64url') };
  assert.equal((await x.post('auth/exchange', wrong, options)).status, 401);
  const response = await x.post('auth/exchange', handoff, options);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), pagesOrigin);
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
  const inlineToken = (await response.json()).token;
  assert.equal((await x.post('auth/exchange', handoff, options)).status, 401);
  const headers = { Origin: pagesOrigin, Authorization: 'Bearer ' + inlineToken };
  const session = await (await x.req('session', { headers })).json();
  assert.equal(session.user.orcid, ORCID);
  assert.equal((await x.post('signatures', x.payload, { ...options, headers })).status, 403);
  assert.equal((await x.post('signatures', { ...x.payload, consent: false }, { ...options, headers, csrf: session.csrf })).status, 400);
  assert.equal((await x.post('signatures', x.payload, { ...options, headers, csrf: session.csrf })).status, 201);
  assert.equal((await x.post('auth/logout', {}, { ...options, headers, csrf: session.csrf })).status, 200);
  assert.equal((await (await x.req('session', { headers })).json()).user, null);
});
test('handoffs and inline sessions reject other origins and cookie substitution', async t => {
  const x = setup(t, { publicLetter: pagesOrigin + '/letter.html' });
  const logged = await x.login(), handoff = await inlineLogin(x, logged);
  assert.equal((await x.post('auth/handoff', handoff, { ...logged, origin: pagesOrigin })).status, 403);
  const attack = await x.post('auth/exchange', handoff, { origin: 'https://attacker.example' });
  assert.equal(attack.status, 403); assert.equal(attack.headers.get('access-control-allow-origin'), null);
  assert.equal((await (await x.req('session', { headers: { Origin: pagesOrigin, Cookie: logged.cookie } })).json()).user, null);
  const response = await x.post('auth/exchange', handoff, { origin: pagesOrigin });
  const token = (await response.json()).token;
  for (const origin of ['https://attacker.example', x.config.origin, '']) {
    const res = await x.req('session', { headers: { Origin: origin, Authorization: 'Bearer ' + token } });
    assert.equal((await res.json()).user, null);
  }
  const res = await x.req('session', { headers: { Cookie: 'letter_session=' + token } });
  assert.equal((await res.json()).user, null);
});
test('expired handoffs and expired inline sessions cannot authenticate', async t => {
  const x = setup(t, { publicLetter: pagesOrigin + '/letter.html' });
  const logged = await x.login(); let handoff = await inlineLogin(x, logged);
  x.advance(121000);
  assert.equal((await x.post('auth/exchange', handoff, { origin: pagesOrigin })).status, 401);
  handoff = await inlineLogin(x, logged);
  const res = await x.post('auth/exchange', handoff, { origin: pagesOrigin });
  const token = (await res.json()).token; x.advance(3600001);
  assert.equal((await (await x.req('session', { headers: { Origin: pagesOrigin, Authorization: 'Bearer ' + token } })).json()).user, null);
});
test('logging out invalidates an unexchanged handoff', async t => {
  const x = setup(t, { publicLetter: pagesOrigin + '/letter.html' });
  const logged = await x.login(), handoff = await inlineLogin(x, logged);
  assert.equal((await x.post('auth/logout', {}, logged)).status, 200);
  assert.equal((await x.post('auth/exchange', handoff, { origin: pagesOrigin })).status, 401);
});
test('CORS preflight allows only the letter origin and supported inline endpoints', async t => {
  const x = setup(t, { publicLetter: pagesOrigin + '/letter.html' });
  const options = origin => ({ method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } });
  const allowed = await x.req('signatures', options(pagesOrigin));
  assert.equal(allowed.status, 204); assert.equal(allowed.headers.get('access-control-allow-origin'), pagesOrigin);
  assert.equal(allowed.headers.get('access-control-allow-credentials'), null);
  assert.equal((await x.req('signatures', options('https://attacker.example'))).status, 403);
  assert.equal((await x.req('auth/handoff', options(pagesOrigin))).status, 403);
  assert.equal((await x.req('auth/orcid/start', options(pagesOrigin))).status, 403);
});
test('profile prefill uses public names, current affiliations, interests and recent works, excluding email', async t => {
  const x = setup(t, { person: { name: { 'credit-name': { value: 'Researcher Name' } },
    emails: { email: [{ email: 'private@example.org' }] }, keywords: { keyword: [{ content: 'Ecology' }] } },
    activities: { employments: { 'affiliation-group': [{ summaries: [
      { 'employment-summary': { organization: { name: 'Old Lab' }, 'end-date': { year: { value: '2020' } } } },
      { 'employment-summary': { organization: { name: 'Current Lab' }, 'role-title': 'Researcher', 'department-name': 'Biology' } },
    ] }] }, works: { group: [
      { 'work-summary': [{ title: { title: { value: 'Earlier work' } }, 'publication-date': { year: { value: '2020' } } }] },
      { 'work-summary': [{ title: { title: { value: 'Recent work' } }, 'publication-date': { year: { value: '2025' } },
        'external-ids': { 'external-id': [{ 'external-id-type': 'doi', 'external-id-relationship': 'self', 'external-id-value': '10.1234/example' }] } }] },
    ] } } });
  assert.equal((await x.req('profile')).status, 401);
  const logged = await x.login();
  const profile = await (await x.req('profile', { headers: { Cookie: logged.cookie } })).json();
  assert.equal(profile.status, 'retrieved'); assert.equal(profile.name, 'Researcher Name');
  assert.equal(profile.suggestedAffiliation, 'Current Lab');
  assert.equal(profile.affiliations[0].role, 'Researcher');
  assert.deepEqual(profile.keywords, ['Ecology']);
  assert.equal(profile.works[0].title, 'Recent work');
  assert.equal(profile.works[0].url, 'https://doi.org/10.1234/example');
  assert.ok(!JSON.stringify(profile).includes('private@example.org'));
  for (const call of x.calls.filter(call => !call.url.endsWith('/oauth/token'))) {
    assert.equal(call.options.headers.Authorization, 'Bearer sensitive-test-token');
    assert.equal(new URL(call.url).origin, 'https://pub.sandbox.orcid.org');
  }
  assert.ok(!JSON.stringify(profile).includes('sensitive-test-token'));
});
test('empty or unavailable public records leave manual signing available', async t => {
  const x = setup(t, { evidenceError: true }); const logged = await x.login();
  const profile = await (await x.req('profile', { headers: { Cookie: logged.cookie } })).json();
  assert.equal(profile.status, 'unavailable'); assert.equal(profile.suggestedAffiliation, '');
  assert.equal((await x.post('signatures', x.payload, logged)).status, 201);
});
