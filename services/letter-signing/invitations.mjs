import { createHash, randomBytes } from 'node:crypto';
import { sameName, lookupCitations } from './citations.mjs';
import { signatureRowFor } from './signature-records.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const text = (value, max = 240) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
const normalise = value => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const DAY = 24 * 60 * 60 * 1000;
const NETWORK_VERSION = 5;
// Missing citation data stays unknown; use the shared-paper count on its own.
const suggestionScore = candidate => candidate.citations === null ? candidate.papers.length :
  candidate.papers.length * Math.sqrt(candidate.citations.count + 1);
const sortSuggestions = candidates => candidates.sort((a, b) => suggestionScore(b) - suggestionScore(a) ||
  b.papers.length - a.papers.length || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
export const invitationId = value => typeof value === 'string' && /^[\w-]{22}$/.test(value);

// Only public bibliographic data is stored here. Signature emails never become
// discoverable contacts, and a shared name alone never merges researcher records.
export function createInvitations({ config, db, letter, now, fetchImpl, providerJSON, validOrcid, loadEvidence }) {
  async function bibliography(user, signatureName) {
    // DBLP's person-level ORCID links are curated. Query publications through
    // that link instead of treating the user's ORCID works list as exhaustive.
    const query = `PREFIX dblp: <https://dblp.org/rdf/schema#>
SELECT ?person ?personName ?paper ?title ?year ?doi ?coauthor ?name ?orcid WHERE {
 ?person dblp:orcid <https://orcid.org/${user.orcid}>; dblp:primaryCreatorName ?personName .
 ?paper dblp:authoredBy ?person; dblp:title ?title; dblp:yearOfPublication ?year; dblp:authoredBy ?coauthor .
 ?coauthor dblp:primaryCreatorName ?name .
 OPTIONAL { ?paper dblp:doi ?doi . }
 OPTIONAL { ?coauthor dblp:orcid ?orcid . }
} ORDER BY DESC(?year) ?paper ?coauthor LIMIT 2001`;
    try {
      const url = new URL('https://sparql.dblp.org/sparql'); url.search = new URLSearchParams({ query, format: 'json' });
      const data = await providerJSON(fetchImpl, url.href, { timeoutMs: 5000, headers: { Accept: 'application/sparql-results+json' } });
      const rows = data?.results?.bindings;
      if (!Array.isArray(rows) || !rows.length || rows.length > 2001) return null;
      const personUrl = rows[0].person?.value;
      const validPerson = value => typeof value === 'string' && /^https:\/\/dblp\.org\/pid\/[\w/-]+$/.test(value);
      if (!validPerson(personUrl) || rows.some(row => row.person?.value !== personUrl ||
        ![user.name, signatureName].some(name => sameName(name, row.personName?.value)))) return null;
      const authorOrcids = new Map();
      for (const row of rows) {
        const pid = row.coauthor?.value, orcid = text(row.orcid?.value, 80).replace(/^https?:\/\/orcid\.org\//, '');
        if (!authorOrcids.has(pid)) authorOrcids.set(pid, new Set());
        if (validOrcid(orcid)) authorOrcids.get(pid).add(orcid);
      }
      const people = new Map(), papers = new Map();
      let limited = rows.length > 2000;
      for (const row of rows.slice(0, 2000)) {
        const paperUrl = row.paper?.value, authorUrl = row.coauthor?.value;
        const title = text(row.title?.value, 400), name = text(row.name?.value, 160).replace(/ \d{4}$/, '');
        if (typeof paperUrl !== 'string' || !/^https:\/\/dblp\.org\/rec\/[\w/.-]+$/.test(paperUrl) || !title || !validPerson(authorUrl) || !name) continue;
        let paper = papers.get(paperUrl);
        if (!paper) {
          const doi = text(row.doi?.value, 320).replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '').toLowerCase();
          paper = { id: paperUrl, doi: /^10\.\d{4,9}\/\S+$/.test(doi) ? doi : '', title,
            year: text(row.year?.value, 4), url: paperUrl };
          papers.set(paperUrl, paper);
        }
        if (authorUrl === personUrl) continue;
        const ids = authorOrcids.get(authorUrl);
        // Several ORCIDs can belong to one bibliography. Keep its stable PID
        // instead of splitting that coauthor or choosing an arbitrary ORCID.
        const orcid = ids.size === 1 ? [...ids][0] : '';
        if (orcid === user.orcid) continue;
        const id = digest(config.environment + ':' + (orcid ? 'orcid:' + orcid : 'dblp:' + authorUrl));
        let candidate = people.get(id);
        if (!candidate) {
          if (people.size >= 500) { limited = true; continue; }
          candidate = { id, name, orcid, affiliation: '', dblpUrl: authorUrl, papers: [] }; people.set(id, candidate);
        }
        if (!candidate.papers.some(p => p.id === paper.id)) candidate.papers.push(paper);
      }
      if (!papers.size) return null;
      return { candidates: [...people.values()], scannedWorks: papers.size, availableWorks: papers.size, limited,
        source: { name: 'DBLP', url: personUrl }, status: 'retrieved' };
    } catch { return null; }
  }
  async function rankSuggestions(candidates) {
    const result = await lookupCitations(candidates, { fetchImpl, providerJSON, now });
    sortSuggestions(candidates);
    return result;
  }
  async function network(subject) {
    const row = await db.prepare('SELECT snapshot, refreshed_at FROM research_networks WHERE subject=?').get(subject);
    return row ? { ...JSON.parse(row.snapshot), refreshedAt: row.refreshed_at } : null;
  }
  async function discover(user) {
    const saved = await network(user.subject);
    const ttl = saved?.status === 'retrieved' ? DAY : 60 * 1000;
    if (saved?.version === NETWORK_VERSION && now() - saved.refreshedAt < ttl) return saved;
    const signature = await db.prepare(`SELECT evidence, name FROM signatures WHERE rowid=(${signatureRowFor()})`).get(user.subject);
    const expanded = await bibliography(user, signature?.name);
    if (expanded) return saveNetwork(user.subject, expanded);
    let evidence = signature ? JSON.parse(signature.evidence) : null;
    if (evidence?.status !== 'retrieved' || now() - evidence.retrieved_at > DAY) evidence = await loadEvidence(user);
    const works = (evidence.works || []).flatMap(group => (group['work-summary'] || []).map(work => ({
      doi: work['external-ids']?.['external-id']?.find(id => id['external-id-type'] === 'doi' && id['external-id-relationship'] === 'self')?.['external-id-value'],
      year: text(work['publication-date']?.year?.value, 4),
    }))).filter(work => typeof work.doi === 'string' && /^10\.\d{4,9}\/\S+$/i.test(work.doi) && work.doi.length <= 300)
      .sort((a, b) => b.year.localeCompare(a.year));
    const dois = [...new Set(works.map(work => work.doi.toLowerCase()))];
    // Bound both provider work and the local graph. Each suggestion retains the
    // paper that supports it; this is a sample, not a complete coauthor directory.
    const results = [];
    if (dois.length) {
      const owner = randomBytes(16).toString('base64url');
      // Crossref's public pool permits one concurrent request. Share a short
      // lease across Worker instances, pace requests, and stop on throttling.
      const lease = await db.prepare(`INSERT INTO discovery_locks VALUES ('crossref', ?, ?)
        ON CONFLICT(lock_key) DO UPDATE SET owner=excluded.owner, expires_at=excluded.expires_at
        WHERE expires_at<=? RETURNING owner`).get(owner, now() + 45000, now());
      if (!lease) return { error: 'The paper lookup is busy. Try again in a moment, or enter a collaborator’s name.', status: 429 };
      try {
        const deadline = performance.now() + 18000;
        let previousStart = -Infinity;
        for (const doi of dois.slice(0, 12)) {
          const delay = Math.max(0, 250 - (performance.now() - previousStart));
          if (delay) await new Promise(resolve => setTimeout(resolve, delay));
          if (deadline - performance.now() < 500) break;
          previousStart = performance.now();
          try {
            results.push({ status: 'fulfilled', value: await providerJSON(fetchImpl,
              'https://api.crossref.org/works/' + encodeURIComponent(doi), {
                timeoutMs: Math.max(1, Math.min(2500, Math.floor(deadline - performance.now()))),
                headers: { Accept: 'application/json', 'User-Agent': 'BargainingForOurMinds/1.0 (+https://jameslbarnes.github.io/research-router/site/letter/)' },
              }) });
          } catch (reason) {
            results.push({ status: 'rejected' });
            if (reason.status === 429 || reason.status === 403) break;
          }
        }
      } finally { await db.prepare("DELETE FROM discovery_locks WHERE lock_key='crossref' AND owner=?").run(owner); }
    }
    const people = new Map();
    let scanned = 0, limited = dois.length > 12 || Boolean(evidence.sample_limited);
    for (const [index, result] of results.entries()) {
      if (result.status !== 'fulfilled') continue;
      const work = result.value?.message;
      if (!work || typeof work.DOI !== 'string' || work.DOI.toLowerCase() !== dois[index] || !Array.isArray(work.author)) continue;
      scanned++;
      const paper = { doi: dois[index], title: text(work.title?.[0], 400) || dois[index],
        year: String(work.published?.['date-parts']?.[0]?.[0] || '').slice(0, 4),
        url: 'https://doi.org/' + encodeURIComponent(dois[index]) };
      if (work.author.length > 200) limited = true;
      for (const author of work.author.slice(0, 200)) {
        const name = text([author.given, author.family].filter(Boolean).join(' '), 160);
        const rawOrcid = String(author.ORCID || '').replace(/^https?:\/\/orcid\.org\//, '');
        const orcid = validOrcid(rawOrcid) ? rawOrcid : '';
        if (!name || orcid === user.orcid || (!orcid && [user.name, signature?.name].filter(Boolean).some(n => normalise(n) === normalise(name)))) continue;
        const affiliation = text((Array.isArray(author.affiliation) ? author.affiliation : []).map(a => a.name).filter(Boolean).join('; '));
        // Without an ORCID, identity is scoped to a paper. Namesakes across
        // publications must not silently become one person in our database.
        const id = digest(config.environment + ':' + (orcid ? 'orcid:' + orcid : paper.doi + ':' + normalise(name)));
        let candidate = people.get(id);
        if (!candidate) {
          if (people.size >= 60) { limited = true; continue; }
          candidate = { id, name, orcid, affiliation, papers: [] }; people.set(id, candidate);
        }
        if (!candidate.papers.some(p => p.doi === paper.doi)) candidate.papers.push(paper);
      }
    }
    const candidates = [...people.values()];
    return saveNetwork(user.subject, { candidates, scannedWorks: scanned, availableWorks: evidence.returned_work_groups || 0, limited,
      source: { name: 'ORCID' }, status: evidence.status !== 'retrieved' ? 'unavailable' : scanned < Math.min(dois.length, 12) ? 'partial' : 'retrieved' });
  }
  async function saveNetwork(subject, snapshot) {
    const candidates = snapshot.candidates;
    snapshot.version = NETWORK_VERSION;
    // Return useful coauthors before requesting citation data. The second,
    // authenticated request enriches this stored snapshot independently.
    for (const candidate of candidates) candidate.citations = null;
    sortSuggestions(candidates);
    snapshot.citationLookup = { status: candidates.some(c => c.orcid) ? 'pending' : 'not_available', matchedCandidates: 0 };
    snapshot.revision = randomBytes(12).toString('base64url');
    // Batched inserts keep D1 query and parameter counts bounded.
    for (let offset = 0; offset < candidates.length; offset += 12) {
      const batch = candidates.slice(offset, offset + 12);
      await db.prepare(`INSERT INTO researchers (id, environment, orcid, name, affiliation, updated_at)
        VALUES ${batch.map(() => '(?, ?, ?, ?, ?, ?)').join(',')}
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, affiliation=excluded.affiliation, updated_at=excluded.updated_at`)
        .run(...batch.flatMap(c => [c.id, config.environment, c.orcid || null, c.name, c.affiliation, now()]));
    }
    await db.prepare(`INSERT INTO research_networks VALUES (?, ?, ?) ON CONFLICT(subject)
      DO UPDATE SET snapshot=excluded.snapshot, refreshed_at=excluded.refreshed_at`).run(subject, JSON.stringify(snapshot), now());
    return { ...snapshot, refreshedAt: now() };
  }
  async function enrich(user) {
    const row = await db.prepare('SELECT snapshot, refreshed_at FROM research_networks WHERE subject=?').get(user.subject);
    const saved = row ? JSON.parse(row.snapshot) : null;
    if (saved?.version !== NETWORK_VERSION) return { error: 'Look up your coauthors again to load their citation counts.', status: 409 };
    if (['retrieved', 'not_available'].includes(saved.citationLookup.status) ||
      (saved.citationLookup.status === 'unavailable' && now() - saved.citationLookup.retrievedAt < 60000)) {
      return { ...saved, refreshedAt: row.refreshed_at };
    }
    saved.citationLookup = await rankSuggestions(saved.candidates);
    // Another discovery request may replace the bibliography during this lookup.
    // Never overwrite that newer snapshot with this request's older records.
    await db.prepare('UPDATE research_networks SET snapshot=? WHERE subject=? AND snapshot=?')
      .run(JSON.stringify(saved), user.subject, row.snapshot);
    return network(user.subject);
  }
  function publicInvitation(row) {
    const url = new URL(config.publicLetterUrl); url.searchParams.set('via', row.id);
    return { id: row.id, name: row.recipient_name, url: url.href, papers: JSON.parse(row.evidence),
      createdAt: row.created_at, lastAction: row.last_action, actedAt: row.acted_at };
  }
  async function list(subject) {
    const rows = await db.prepare('SELECT * FROM invitations WHERE inviter_subject=? AND letter_hash=? ORDER BY created_at DESC LIMIT 100')
      .all(subject, letter.hash);
    return { invitations: rows.map(publicInvitation), network: await network(subject) };
  }
  async function prepare(subject, data) {
    let name = '', researcher = null, papers = [], key = 'general';
    if (data.candidateId) {
      const saved = await network(subject);
      const candidate = saved?.candidates.find(c => c.id === data.candidateId);
      if (!candidate) return { error: 'That coauthor suggestion is no longer available. Find your coauthors again.', status: 400 };
      name = candidate.name; researcher = candidate.id; papers = candidate.papers; key = researcher;
    } else if (data.name !== undefined) {
      if (typeof data.name !== 'string' || data.name.length > 160 || /[\u0000-\u001f\u007f]/.test(data.name)) {
        return { error: 'Enter a name of up to 160 characters.', status: 400 };
      }
      name = data.name.trim();
      if (name) key = 'manual:' + digest(normalise(name));
    }
    const existing = await db.prepare('SELECT * FROM invitations WHERE inviter_subject=? AND letter_hash=? AND recipient_key=?')
      .get(subject, letter.hash, key);
    if (existing) return { invitation: publicInvitation(existing) };
    const count = await db.prepare('SELECT count(*) AS count FROM invitations WHERE inviter_subject=? AND letter_hash=?').get(subject, letter.hash);
    if (count.count >= 100) return { error: 'You have prepared 100 invitation links. Reuse one of your existing links to invite more people.', status: 429 };
    await db.prepare(`INSERT OR IGNORE INTO invitations
      (id, inviter_subject, letter_hash, recipient_key, recipient_name, researcher_id, evidence, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(randomBytes(16).toString('base64url'), subject, letter.hash, key, name, researcher, JSON.stringify(papers), now());
    return { invitation: publicInvitation(await db.prepare('SELECT * FROM invitations WHERE inviter_subject=? AND letter_hash=? AND recipient_key=?')
      .get(subject, letter.hash, key)) };
  }
  async function action(subject, data) {
    if (!invitationId(data.id) || !['copied', 'share_menu'].includes(data.action)) return false;
    return Boolean(await db.prepare(`UPDATE invitations SET last_action=?, acted_at=?
      WHERE id=? AND inviter_subject=? AND letter_hash=? RETURNING id`).get(data.action, now(), data.id, subject, letter.hash));
  }
  async function attribute(subject, via) {
    if (!invitationId(via)) return;
    // Attribution follows the link, not an assumed recipient identity. Forwarded
    // links are welcome. Only a newly submitted signature can create a referral.
    await db.prepare(`INSERT OR IGNORE INTO invitation_referrals (subject, letter_hash, invitation_id, created_at)
      SELECT ?, ?, invitations.id, ? FROM invitations JOIN signatures ON
      signatures.rowid=(${signatureRowFor('invitations.inviter_subject')})
      JOIN identities ON identities.subject=invitations.inviter_subject
      WHERE invitations.id=? AND invitations.letter_hash=? AND invitations.inviter_subject<>?
      AND signatures.status IN ('pending_review', 'approved') AND identities.environment=?`)
      .run(subject, letter.hash, now(), via, letter.hash, subject, config.environment);
  }
  return { list, discover, enrich, prepare, action, attribute };
}
