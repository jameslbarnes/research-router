import test from 'node:test';
import assert from 'node:assert/strict';
import { screenSignature, screeningNameMatches } from './screening.mjs';
import { providerJSON } from './app.mjs';

const orcid = '0000-0002-1825-0097';
const author = { given: 'Test', family: 'Researcher', ORCID: 'https://orcid.org/' + orcid };
const paper = { DOI: '10.1234/fixture', author: [author] };
const screen = (items, options = {}) => screenSignature({ orcid, name: 'Test Researcher', ...options.signer }, {
  now: () => 1234, providerJSON,
  fetchImpl: options.fetchImpl || (async (url, request) => {
    const query = new URL(url);
    assert.equal(query.origin, 'https://api.crossref.org');
    assert.equal(query.searchParams.get('filter'), 'orcid:' + orcid);
    assert.equal(request.headers.Authorization, undefined);
    assert.ok(request.signal instanceof AbortSignal);
    return Response.json({ status: 'ok', message: { items, 'total-results': items.length } });
  }),
});

test('a matching ORCID and author in publisher metadata approves without a citation threshold', async () => {
  const result = await screen([paper]);
  assert.equal(result.status, 'approved'); assert.equal(result.reason, 'publication_match');
  assert.equal(result.checked_at, 1234); assert.equal(result.method, 'crossref-orcid-name-v1');
  assert.deepEqual(result.matches, [{ source: 'Crossref', url: 'https://doi.org/10.1234%2Ffixture',
    doi: paper.DOI, author: 'Test Researcher', authenticated_orcid: false }]);
});
test('missing records, namesakes, conflicting names and ambiguous authorship stay private', async () => {
  for (const [items, reason] of [
    [[], 'no_publication_match'],
    [[{ ...paper, author: [{ ...author, ORCID: 'https://orcid.org/0000-0001-5109-3700' }] }], 'no_publication_match'],
    [[{ ...paper, author: [{ ...author, given: 'Other' }] }], 'name_mismatch'],
    [[paper, { ...paper, author: [{ ...author, given: 'Other' }] }], 'name_mismatch'],
    [[{ ...paper, author: [author, author] }], 'ambiguous_authorship'],
    [[{ ...paper, DOI: 'invalid' }], 'no_publication_match'],
  ]) {
    const result = await screen(items);
    assert.equal(result.status, 'pending_review'); assert.equal(result.reason, reason);
    assert.equal(result.matches, undefined);
  }
});
test('provider errors and malformed or oversized responses never approve', async () => {
  for (const fetchImpl of [
    async () => { throw new Error('Timed out'); },
    async () => new Response('Rate limited', { status: 429 }),
    async () => Response.json({ status: 'ok', message: { items: {} } }),
    async () => Response.json({ status: 'ok', message: { items: Array(21).fill(paper) } }),
    async () => new Response(' '.repeat(2 * 1024 * 1024 + 1)),
  ]) {
    const result = await screen([], { fetchImpl });
    assert.equal(result.status, 'pending_review'); assert.equal(result.reason, 'lookup_unavailable');
  }
});
test('name matching accepts harmless variations and holds conflicting initials or names', () => {
  for (const [a, b] of [['Test Researcher', 'TEST Researcher'], ['José García', 'Jose Garcia'],
    ['Test A. Researcher', 'Test Alice Researcher'], ['Test Researcher', 'Test Alice Researcher']]) {
    assert.equal(screeningNameMatches(a, b), true, a + ' / ' + b);
  }
  for (const [a, b] of [['Test Alice Researcher', 'Test Bob Researcher'], ['T Researcher', 'Test Researcher'],
    ['Researcher Test', 'Test Researcher'], ['', ''], ['---', '...']]) {
    assert.equal(screeningNameMatches(a, b), false, a + ' / ' + b);
  }
});
