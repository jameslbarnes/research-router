// Fictional collaborators and publications, for local tests and preview only.
export const fixtureActivities = { works: { group: [1, 2].map(n => ({ 'work-summary': [{
  title: { title: { value: n === 1 ? 'Learning from scientific judgement' : 'Collaborative methods in research' } },
  'publication-date': { year: { value: '2026' } },
  'external-ids': { 'external-id': [{ 'external-id-type': 'doi', 'external-id-relationship': 'self', 'external-id-value': `10.1234/fixture-${n}` }] },
}] })) } };
export const fixturePapers = Object.fromEntries([1, 2].map(n => [`10.1234/fixture-${n}`, { message: {
  DOI: `10.1234/fixture-${n}`, title: [n === 1 ? 'Learning from scientific judgement' : 'Collaborative methods in research'],
  published: { 'date-parts': [[2026]] }, author: [
    { given: 'Test', family: 'Researcher', ORCID: 'https://orcid.org/0000-0002-1825-0097' },
    { given: 'Maya', family: 'Chen', ORCID: 'https://orcid.org/0000-0001-5109-3700', affiliation: [{ name: 'Example Institute' }] },
    { given: 'Alex', family: 'Morgan', affiliation: [{ name: n === 1 ? 'Example Lab' : 'Example University' }] },
  ],
} }]));
export const fixtureCitationAuthors = { meta: { count: 1 }, results: [{
  id: 'https://openalex.org/A100', orcid: 'https://orcid.org/0000-0001-5109-3700',
  display_name: 'Maya Chen', cited_by_count: 1250,
}] };
// A broader curated bibliography, independent of the two ORCID-listed works.
export const fixtureBibliography = { results: { bindings: Array.from({ length: 15 }, (_, n) =>
  [
    ['test', 'Test Researcher', '0000-0002-1825-0097'],
    ['maya', 'Maya Chen', '0000-0001-5109-3700'],
    ['alex-' + n % 2, 'Alex Morgan', ''],
  ].map(([id, name, orcid]) => Object.fromEntries(Object.entries({
    person: 'https://dblp.org/pid/test', personName: 'Test Researcher',
    paper: 'https://dblp.org/rec/conf/fixture/' + n, title: 'Public research paper ' + n,
    year: '2026', coauthor: 'https://dblp.org/pid/' + id, name,
    ...(orcid ? { orcid: 'https://orcid.org/' + orcid } : {}),
  }).map(([key, value]) => [key, { value }])))).flat() } };
