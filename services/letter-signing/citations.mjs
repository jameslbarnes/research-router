const normalise = value => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
export const sameName = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const parts = value => value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const x = parts(a), y = parts(b);
  return normalise(a) === normalise(b) || (x.length > 1 && y.length > 1 && x[0] === y[0] && x.at(-1) === y.at(-1));
};

export async function lookupCitations(candidates, { fetchImpl, providerJSON, now, budget = 8000 }) {
  for (const candidate of candidates) candidate.citations = null;
  const orcids = [...new Set(candidates.map(c => c.orcid).filter(Boolean))];
  let status = 'not_available';
  const deadline = performance.now() + budget;
  for (let offset = 0; offset < orcids.length; offset += 50) {
    const batch = orcids.slice(offset, offset + 50);
    try {
      if (deadline - performance.now() < 500) throw new Error('Citation lookup deadline reached');
      const url = new URL('https://api.openalex.org/authors');
      url.search = new URLSearchParams({ filter: 'orcid:' + batch.map(id => 'https://orcid.org/' + id).join('|'),
        per_page: '100', select: 'id,orcid,display_name,cited_by_count' });
      // Public batch lookups. No ORCID access token or private signer data.
      const data = await providerJSON(fetchImpl, url.href, { timeoutMs: Math.min(4000, Math.floor(deadline - performance.now())), headers: { Accept: 'application/json' } });
      if (!Array.isArray(data?.results) || data.results.length > 100 || data.meta?.count > data.results.length) throw new Error('Incomplete citation records');
      status = 'retrieved';
      for (const candidate of candidates) {
        if (!batch.includes(candidate.orcid)) continue;
        // ORCID filters can also return observed IDs. Require the primary ID
        // and a compatible name; ambiguous profiles keep unknown counts.
        const matches = data.results.filter(author => author &&
          String(author.orcid || '').replace(/^https?:\/\/orcid\.org\//, '') === candidate.orcid &&
          sameName(candidate.name, author.display_name));
        if (matches.length !== 1) continue;
        const author = matches[0];
        if (!Number.isSafeInteger(author.cited_by_count) || author.cited_by_count < 0 || !/^https:\/\/openalex\.org\/A\d+$/.test(author.id)) continue;
        candidate.citations = { count: author.cited_by_count, url: author.id, source: 'OpenAlex', retrievedAt: now() };
      }
    } catch { status = 'unavailable'; break; }
  }
  return { status, matchedCandidates: candidates.filter(c => c.citations !== null).length, retrievedAt: now() };
}
