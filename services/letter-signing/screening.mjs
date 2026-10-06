// Deterministic screening, not a credential or quality assessment. Only public
// ORCID identifiers go to Crossref; tokens and private contact details stay here.
const orcidId = value => typeof value === 'string' ? value.replace(/^https?:\/\/orcid\.org\//, '') : '';
const words = value => typeof value === 'string' ? value.normalize('NFKD').replace(/\p{M}/gu, '')
  .toLowerCase().match(/[\p{L}\p{N}]+/gu) || [] : [];

export function screeningNameMatches(a, b) {
  const x = words(a), y = words(b);
  if (!x.length || !y.length) return false;
  if (x.join(' ') === y.join(' ')) return true;
  // Allow an omitted middle name or a matching middle initial, while holding
  // first-name initials, conflicting middle names and reordered names for review.
  if (x.length < 2 || y.length < 2 || x[0].length < 2 || x[0] !== y[0] || x.at(-1) !== y.at(-1)) return false;
  const xm = x.slice(1, -1), ym = y.slice(1, -1);
  return !xm.length || !ym.length || (xm.length === ym.length && xm.every((v, i) =>
    v === ym[i] || (Math.min(v.length, ym[i].length) === 1 && v[0] === ym[i][0])));
}

export async function screenSignature({ orcid, name }, { fetchImpl, providerJSON, now }) {
  const result = { method: 'crossref-orcid-name-v1', checked_at: now(), status: 'pending_review', reason: 'lookup_unavailable' };
  try {
    const url = new URL('https://api.crossref.org/works');
    url.search = new URLSearchParams({ filter: 'orcid:' + orcid, rows: '20', select: 'DOI,title,author' });
    const data = await providerJSON(fetchImpl, url.href, { timeoutMs: 4000, headers: { Accept: 'application/json' } });
    const items = data?.message?.items;
    if (data?.status !== 'ok' || !Array.isArray(items) || items.length > 20) return result;
    result.reason = 'no_publication_match';
    result.sample_limited = data.message['total-results'] > items.length;
    const matches = [];
    let mismatch = false;
    for (const item of items) {
      if (!item || typeof item.DOI !== 'string' || !/^10\.\d{4,9}\/\S+$/i.test(item.DOI) || !Array.isArray(item.author)) continue;
      const authors = item.author.filter(author => author && orcidId(author.ORCID) === orcid);
      if (authors.length > 1) return { ...result, reason: 'ambiguous_authorship' };
      if (!authors.length) continue;
      const author = authors[0], authorName = [author.given, author.family].filter(v => typeof v === 'string').join(' ');
      if (!screeningNameMatches(name, authorName)) { mismatch = true; continue; }
      matches.push({ source: 'Crossref', url: 'https://doi.org/' + encodeURIComponent(item.DOI),
        doi: item.DOI, author: authorName, authenticated_orcid: author['authenticated-orcid'] === true });
    }
    if (mismatch) return { ...result, reason: 'name_mismatch' };
    if (!matches.length) return result;
    return { ...result, status: 'approved', reason: 'publication_match', matches: matches.slice(0, 3) };
  } catch { return result; }
}
