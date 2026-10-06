import { createHash, randomBytes, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
import { createInvitations } from './invitations.mjs';
import { createSignatories } from './signatories.mjs';
import { screenSignature } from './screening.mjs';
import { signatureRowFor } from './signature-records.mjs';

const API = '/letter/api';
const SIGN_PAGE = '/letter/sign/';
const FLOW_TTL = 10 * 60 * 1000;
const SESSION_TTL = 12 * 60 * 60 * 1000;
const INLINE_TTL = 60 * 60 * 1000;
const HANDOFF_TTL = 2 * 60 * 1000;
const token = () => randomBytes(32).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('hex');
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function configFromEnv(env = process.env) {
  const origin = new URL(env.APP_ORIGIN || 'http://localhost:8766');
  const environment = env.ORCID_ENV || 'sandbox';
  if (!['sandbox', 'production'].includes(environment)) throw new Error('ORCID_ENV must be sandbox or production.');
  if (origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) {
    throw new Error('APP_ORIGIN must contain only a scheme, hostname and optional port.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && local && environment === 'sandbox')) {
    throw new Error('HTTPS is required except for a local sandbox.');
  }
  const key = env.TOKEN_ENCRYPTION_KEY || '';
  if (key && !/^[a-f0-9]{64}$/i.test(key)) throw new Error('TOKEN_ENCRYPTION_KEY must be 64 hexadecimal characters.');
  const configured = Boolean(env.ORCID_CLIENT_ID && env.ORCID_CLIENT_SECRET && key);
  if (environment === 'production' && !configured) throw new Error('Production requires ORCID credentials and TOKEN_ENCRYPTION_KEY.');
  const publicLetter = new URL(env.PUBLIC_LETTER_URL || '/letter/studies/split-view.html', origin);
  if (publicLetter.username || publicLetter.password || publicLetter.search || publicLetter.hash ||
      (publicLetter.protocol !== 'https:' && !(environment === 'sandbox' && publicLetter.origin === origin.origin))) {
    throw new Error('PUBLIC_LETTER_URL must be an HTTPS page URL.');
  }
  const publicAudit = new URL(env.PUBLIC_AUDIT_URL || '../check/', publicLetter);
  if (publicAudit.origin !== publicLetter.origin || publicAudit.username || publicAudit.password) {
    throw new Error('PUBLIC_AUDIT_URL must use the letter site origin.');
  }
  return {
    origin: origin.origin, environment, secure: origin.protocol === 'https:', configured,
    publicLetterUrl: publicLetter.href, publicAuditUrl: publicAudit.href,
    clientId: env.ORCID_CLIENT_ID || '', clientSecret: env.ORCID_CLIENT_SECRET || '',
    encryptionKey: key ? Buffer.from(key, 'hex') : null,
    issuer: environment === 'production' ? 'https://orcid.org' : 'https://sandbox.orcid.org',
    publicApi: environment === 'production' ? 'https://pub.orcid.org' : 'https://pub.sandbox.orcid.org',
    redirectUri: `${origin.origin}${API}/auth/orcid/callback`,
  };
}

export function parseLetter(source) {
  const body = source.match(/<div class="letter-body">([\s\S]*?)<\/div>/)?.[1];
  if (!body) throw new Error('Cannot find the canonical letter.');
  const plain = text => text.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  const paragraphs = [...body.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(m => plain(m[1]));
  const title = plain(source.match(/<h1 id="letter-title">([\s\S]*?)<\/h1>/)?.[1] || '');
  if (!title || paragraphs.length < 2) throw new Error('The canonical letter is incomplete.');
  const text = `${title}\n\n${paragraphs.join('\n\n')}`;
  return { title, paragraphs, text, hash: hash(text) };
}

export function validOrcid(value) {
  if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(value)) return false;
  const digits = value.replaceAll('-', '');
  const total = [...digits.slice(0, 15)].reduce((sum, digit) => (sum + Number(digit)) * 2, 0);
  const remainder = (12 - total % 11) % 11;
  return digits[15] === (remainder === 10 ? 'X' : String(remainder));
}

function encrypt(value, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64url')).join('.');
}

function publicReadHeaders(encrypted, key) {
  const headers = { Accept: 'application/json' };
  try {
    const [iv, tag, ciphertext] = encrypted.split('.').map(part => Buffer.from(part, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', key, iv); decipher.setAuthTag(tag);
    const data = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
    if (typeof data.access_token === 'string' && data.access_token) headers.Authorization = 'Bearer ' + data.access_token;
  } catch { /* Public data remains readable if the stored token is unavailable. */ }
  return headers;
}

export async function providerJSON(fetchImpl, url, options = {}) {
  const { timeoutMs = 12000, ...fetchOptions } = options;
  const response = await fetchImpl(url, { ...fetchOptions, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) { await response.body?.cancel(); const err = new Error('Provider request failed.'); err.status = response.status; throw err; }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 2 * 1024 * 1024) { await reader.cancel(); throw new Error('Provider response too large.'); }
    chunks.push(Buffer.from(value));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function researchEvidence(config, orcid, fetchImpl, now, headers = { Accept: 'application/json' }) {
  const evidence = { profile: `${config.issuer}/${orcid}`, retrieved_at: now, status: 'unavailable' };
  try {
    const activities = await providerJSON(fetchImpl, `${config.publicApi}/v3.0/${orcid}/activities`, {
      headers,
    });
    const affiliations = ['employments', 'educations'].flatMap(kind =>
      (activities[kind]?.['affiliation-group'] || []).flatMap(group => group.summaries || []));
    const works = activities.works?.group || [];
    return { ...evidence, status: 'retrieved', affiliations: affiliations.slice(0, 30),
      works: works.slice(0, 30), returned_work_groups: works.length,
      sample_limited: affiliations.length > 30 || works.length > 30 };
  } catch { return evidence; }
}

export async function researchProfile(config, orcid, fetchImpl = fetch, headers = { Accept: 'application/json' }) {
  const results = await Promise.allSettled(['person', 'activities'].map(section =>
    providerJSON(fetchImpl, `${config.publicApi}/v3.0/${orcid}/${section}`, { headers })));
  const [person, activities] = results.map(result => result.status === 'fulfilled' ? result.value : {});
  const text = (value, max = 240) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
  const name = text(person.name?.['credit-name']?.value ||
    [person.name?.['given-names']?.value, person.name?.['family-name']?.value].filter(Boolean).join(' '), 160);
  const affiliations = ['employments', 'educations'].flatMap(kind =>
    (activities[kind]?.['affiliation-group'] || []).flatMap(group => (group.summaries || []).map(item => {
      const entry = item[kind === 'employments' ? 'employment-summary' : 'education-summary'] || {};
      return { organization: text(entry.organization?.name), department: text(entry['department-name']),
        role: text(entry['role-title']), current: !entry['end-date'], kind,
        source: text(entry.source?.['source-name']?.value), startYear: text(entry['start-date']?.year?.value, 4) };
    }))).filter(a => a.organization).sort((a, b) => Number(b.current) - Number(a.current) ||
      Number(a.kind === 'educations') - Number(b.kind === 'educations') || b.startYear.localeCompare(a.startYear)).slice(0, 8);
  const groups = activities.works?.group || [];
  const works = groups.map(group => {
    const entry = (group['work-summary'] || []).slice().sort((a, b) => Number(b['display-index'] || 0) - Number(a['display-index'] || 0))[0] || {};
    const doi = entry['external-ids']?.['external-id']?.find(id => id['external-id-type'] === 'doi' && id['external-id-relationship'] === 'self')?.['external-id-value'];
    return { title: text(entry.title?.title?.value, 400), year: text(entry['publication-date']?.year?.value, 4),
      url: typeof doi === 'string' && /^10\.\d{4,9}\/\S+$/i.test(doi) ? 'https://doi.org/' + encodeURI(doi).replaceAll('#', '%23').replaceAll('?', '%3F') : '' };
  }).filter(work => work.title).sort((a, b) => b.year.localeCompare(a.year)).slice(0, 3);
  return { status: results.every(r => r.status === 'rejected') ? 'unavailable' : results.some(r => r.status === 'rejected') ? 'partial' : 'retrieved',
    name, affiliations, suggestedAffiliation: affiliations.find(a => a.current)?.organization || '',
    keywords: [...new Set((person.keywords?.keyword || []).map(k => text(k.content, 100)).filter(Boolean))].slice(0, 8),
    works, workCount: groups.length };
}

export function createApp({ config, db, letter, fetchImpl = fetch, now = Date.now }) {
  const publicOrigin = new URL(config.publicLetterUrl).origin;
  const inlinePaths = new Set(['session', 'profile', 'auth/exchange', 'auth/logout', 'signatures',
    'coauthors', 'coauthors/citations', 'invitations', 'invitations/action'].map(path => `${API}/${path}`));
  const sessionName = config.secure ? '__Host-letter_session' : 'letter_session';
  const flowName = config.secure ? '__Host-letter_oauth' : 'letter_oauth';
  const cookie = (name, value, seconds) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${config.secure ? '; Secure' : ''}`;
  const cookies = request => Object.fromEntries((request.headers.get('cookie') || '').split(';').map(item => {
    const i = item.indexOf('='); return i < 0 ? ['', ''] : [item.slice(0, i).trim(), item.slice(i + 1)];
  }));
  const json = (data, status = 200) => Response.json(data, { status, headers: {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  } });
  const error = (status, message) => json({ error: message }, status);
  const redirect = (result, setCookies = []) => new Response(null, { status: 303, headers: [
    ['Location', `${SIGN_PAGE}?auth=${result}`], ['Cache-Control', 'no-store'], ['Referrer-Policy', 'no-referrer'],
    ...setCookies.map(value => ['Set-Cookie', value]),
  ] });
  const session = async request => {
    const bearer = request.headers.get('authorization')?.match(/^Bearer ([\w-]{43})$/)?.[1];
    const requestOrigin = request.headers.get('origin');
    if (bearer ? requestOrigin !== publicOrigin : requestOrigin && requestOrigin !== config.origin) return null;
    const value = bearer || cookies(request)[sessionName];
    if (!value || !/^[\w-]{43}$/.test(value)) return null;
    return await db.prepare(`SELECT sessions.*, identities.orcid, identities.name, identities.environment
      FROM sessions JOIN identities USING(subject) WHERE session_hash=? AND expires_at>? AND environment=?
      AND COALESCE(client_origin, ?)=?`).get(hash(value), now(), config.environment, config.origin, bearer ? publicOrigin : config.origin);
  };
  const signature = async subject => await db.prepare(`SELECT name, affiliation, status, submitted_at
    FROM signatures WHERE rowid=(${signatureRowFor()})`).get(subject) || null;
  const profileHeaders = async subject => {
    const identity = await db.prepare('SELECT token_encrypted FROM identities WHERE subject=?').get(subject);
    return publicReadHeaders(identity?.token_encrypted, config.encryptionKey);
  };
  const invitations = createInvitations({ config, db, letter, now, fetchImpl, providerJSON, validOrcid,
    loadEvidence: async user => researchEvidence(config, user.orcid, fetchImpl, now(), await profileHeaders(user.subject)) });
  const signatories = createSignatories({ db, now, fetchImpl, providerJSON });
  async function limit(bucket, max = 60) {
    const key = hash(bucket);
    const time = now();
    await db.prepare('DELETE FROM rate_limits WHERE expires_at<=?').run(time);
    await db.prepare(`INSERT INTO rate_limits VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count=count+1`).run(key, time + FLOW_TTL);
    return (await db.prepare('SELECT count FROM rate_limits WHERE bucket=?').get(key)).count <= max;
  }
  async function clean() {
    await db.prepare('DELETE FROM signing_handoffs WHERE expires_at<=?').run(now());
    await db.prepare('DELETE FROM oauth_states WHERE expires_at<=?').run(now());
    await db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now());
  }

  async function handle(request, clientAddress) {
    const url = new URL(request.url);
    const path = url.pathname;
    await clean();
    if (request.method === 'GET' && path === `${API}/session`) {
      const user = await session(request);
      return json({ configured: config.configured, environment: config.environment,
        letter: { title: letter.title, paragraphs: letter.paragraphs, hash: letter.hash, url: config.publicLetterUrl },
        user: user ? { orcid: user.orcid, name: user.name, url: `${config.issuer}/${user.orcid}` } : null,
        csrf: user?.csrf || null, signature: user ? await signature(user.subject) : null });
    }
    if (request.method === 'GET' && path === `${API}/profile`) {
      const user = await session(request);
      if (!user) return error(401, 'Sign in with ORCID to load your research details.');
      if (!await limit(`profile:${user.subject}`, 12)) return error(429, 'Your ORCID details have been requested too often. Please try again in ten minutes.');
      return json(await researchProfile(config, user.orcid, fetchImpl, await profileHeaders(user.subject)));
    }
    if (request.method === 'GET' && path === `${API}/invitations`) {
      const user = await session(request);
      if (!user) return error(401, 'Sign in with ORCID to see your invitations.');
      if (!['pending_review', 'approved'].includes((await signature(user.subject))?.status)) return error(403, 'Submit your signature before preparing invitations.');
      return json(await invitations.list(user.subject));
    }
    if (request.method === 'GET' && path === `${API}/signatures`) {
      const response = json(await signatories());
      // Only approved public records are readable from the separate letter site.
      response.headers.set('Access-Control-Allow-Origin', new URL(config.publicLetterUrl).origin);
      return response;
    }
    if (request.method === 'GET' && path === `${API}/auth/orcid/callback`) {
      if (!config.configured) return redirect('unavailable');
      const state = url.searchParams.get('state') || '';
      const browser = cookies(request)[flowName] || '';
      if (!/^[\w-]{43}$/.test(state) || !/^[\w-]{43}$/.test(browser)) return redirect('expired');
      // DELETE RETURNING consumes a browser-bound state atomically, including cancellation.
      const flow = await db.prepare('DELETE FROM oauth_states WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING state_hash')
        .get(hash(state), hash(browser), now());
      if (!flow) return redirect('expired');
      const clearFlow = cookie(flowName, '', 0);
      if (url.searchParams.has('error')) return redirect('cancelled', [clearFlow]);
      const code = url.searchParams.get('code');
      if (!code || code.length > 2048) return redirect('failed', [clearFlow]);
      try {
        const data = await providerJSON(fetchImpl, `${config.issuer}/oauth/token`, {
          method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret,
            grant_type: 'authorization_code', code, redirect_uri: config.redirectUri }),
        });
        if (!validOrcid(data.orcid || '') || typeof data.access_token !== 'string' || !data.access_token ||
            !String(data.scope || '').split(/\s+/).includes('/authenticate') || String(data.token_type).toLowerCase() !== 'bearer') {
          throw new Error('Invalid token response.');
        }
        const subject = `${config.environment}:${data.orcid}`;
        const sid = token();
        await db.prepare(`INSERT INTO identities VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(subject) DO UPDATE SET name=excluded.name, token_encrypted=excluded.token_encrypted, authenticated_at=excluded.authenticated_at`)
          .run(subject, data.orcid, config.environment, String(data.name || '').slice(0, 160), encrypt(data, config.encryptionKey), now());
        const oldSession = await session(request);
        if (oldSession) await db.prepare('DELETE FROM sessions WHERE session_hash=?').run(oldSession.session_hash);
        await db.prepare('INSERT INTO sessions (session_hash, subject, csrf, expires_at) VALUES (?, ?, ?, ?)').run(hash(sid), subject, token(), now() + SESSION_TTL);
        return redirect('connected', [clearFlow, cookie(sessionName, sid, SESSION_TTL / 1000)]);
      } catch { return redirect('failed', [clearFlow]); }
    }
    if (request.method !== 'POST') return error(404, 'This signing service address was not found.');
    const requestOrigin = request.headers.get('origin');
    const fromInline = requestOrigin === publicOrigin && inlinePaths.has(path);
    if ((requestOrigin !== config.origin && !fromInline) || request.headers.get('x-letter-request') !== '1') {
      return error(403, 'Open the letter on this site and try again.');
    }
    if (path === `${API}/auth/exchange`) {
      if (requestOrigin !== publicOrigin) return error(403, 'Return to the letter to finish signing in.');
      if (!await limit(`exchange:${clientAddress}`)) return error(429, 'Too many sign-in attempts. Please try again in ten minutes.');
      let data;
      try { const body = await request.text(); if (body.length > 1024) throw new Error(); data = JSON.parse(body); }
      catch { return error(400, 'Start ORCID sign-in again from the letter.'); }
      if (![data?.ticket, data?.verifier, data?.channel].every(value => typeof value === 'string' && /^[\w-]{43}$/.test(value))) {
        return error(400, 'Start ORCID sign-in again from the letter.');
      }
      const challenge = createHash('sha256').update(data.verifier).digest('base64url');
      const handoff = await db.prepare('DELETE FROM signing_handoffs WHERE code_hash=? AND challenge=? AND channel=? AND expires_at>? RETURNING session_hash')
        .get(hash(data.ticket), challenge, data.channel, now());
      const source = handoff && await db.prepare('SELECT subject FROM sessions WHERE session_hash=? AND expires_at>? AND client_origin IS NULL')
        .get(handoff.session_hash, now());
      if (!source) return error(401, 'That sign-in link has expired. Please connect with ORCID again.');
      const sid = token();
      await db.prepare('INSERT INTO sessions (session_hash, subject, csrf, expires_at, client_origin) VALUES (?, ?, ?, ?, ?)')
        .run(hash(sid), source.subject, token(), now() + INLINE_TTL, publicOrigin);
      return json({ token: sid });
    }
    if (path === `${API}/auth/orcid/start`) {
      if (!config.configured) return error(503, 'ORCID signing is not available yet. Please try again later.');
      if (!await limit(`login:${clientAddress}`)) return error(429, 'Too many sign-in attempts. Please try again in ten minutes.');
      const state = token(), browser = token();
      await db.prepare('INSERT INTO oauth_states VALUES (?, ?, ?)').run(hash(state), hash(browser), now() + FLOW_TTL);
      const target = new URL('/oauth/authorize', config.issuer);
      target.search = new URLSearchParams({ client_id: config.clientId, response_type: 'code', scope: '/authenticate',
        redirect_uri: config.redirectUri, state }).toString();
      const response = json({ url: target.href });
      response.headers.append('Set-Cookie', cookie(flowName, browser, FLOW_TTL / 1000));
      return response;
    }
    const user = await session(request);
    if (!user) return error(401, 'Your sign-in has expired. Sign in with ORCID again.');
    if (!same(request.headers.get('x-csrf-token'), user.csrf)) return error(403, 'Refresh this page and try again.');
    if ([`${API}/coauthors`, `${API}/coauthors/citations`, `${API}/invitations`, `${API}/invitations/action`].includes(path)) {
      const discovering = path === `${API}/coauthors` || path === `${API}/coauthors/citations`;
      const signed = await signature(user.subject);
      if (signed?.status === 'withdrawn') return error(403, 'Your signature has been withdrawn. Invitation tools are unavailable.');
      if (!discovering && !['pending_review', 'approved'].includes(signed?.status)) return error(403, 'Submit your signature before preparing invitations.');
      if (!await limit(`invite:${user.subject}`, 80)) return error(429, 'Too many invitation requests. Please try again in ten minutes.');
      if (!request.headers.get('content-type')?.startsWith('application/json')) return error(415, 'Refresh this page and try again.');
      let data;
      try { const body = await request.text(); if (Buffer.byteLength(body) > 2048) throw new Error();
        data = JSON.parse(body); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(); }
      catch { return error(400, 'The invitation could not be read. Refresh this page and try again.'); }
      if (discovering) {
        const citations = path === `${API}/coauthors/citations`;
        if (!await limit(`${citations ? 'citations' : 'coauthors'}:${user.subject}`, 6)) return error(429, 'Your coauthors have been requested too often. Try again in ten minutes.');
        const result = await (citations ? invitations.enrich(user) : invitations.discover(user));
        return result.error ? error(result.status, result.error) : json(result);
      }
      if (path === `${API}/invitations/action`) {
        if (!await invitations.action(user.subject, data)) return error(404, 'That invitation was not found. Prepare it again from this page.');
        return json({ ok: true });
      }
      const result = await invitations.prepare(user.subject, data);
      return result.error ? error(result.status, result.error) : json(result);
    }
    if (path === `${API}/auth/handoff`) {
      if (requestOrigin !== config.origin || request.headers.has('authorization')) return error(403, 'Complete ORCID sign-in in this window.');
      let data;
      try { const body = await request.text(); if (body.length > 1024) throw new Error(); data = JSON.parse(body); }
      catch { return error(400, 'Return to the letter and start ORCID sign-in again.'); }
      if (![data?.challenge, data?.channel].every(value => typeof value === 'string' && /^[\w-]{43}$/.test(value))) {
        return error(400, 'Return to the letter and start ORCID sign-in again.');
      }
      const ticket = token();
      await db.prepare('INSERT INTO signing_handoffs VALUES (?, ?, ?, ?, ?)')
        .run(hash(ticket), user.session_hash, data.challenge, data.channel, now() + HANDOFF_TTL);
      const target = new URL(config.publicLetterUrl);
      target.hash = new URLSearchParams({ 'sign-ticket': ticket, channel: data.channel }).toString();
      return json({ url: target.href });
    }
    if (path === `${API}/auth/logout`) {
      await db.prepare('DELETE FROM sessions WHERE session_hash=?').run(user.session_hash);
      const response = json({ ok: true });
      response.headers.append('Set-Cookie', cookie(sessionName, '', 0));
      return response;
    }
    if (path !== `${API}/signatures`) return error(404, 'This signing service address was not found.');
    if (!await limit(`sign:${user.subject}`, 12)) return error(429, 'Too many requests. Please try again in ten minutes.');
    if (!request.headers.get('content-type')?.startsWith('application/json')) return error(415, 'Refresh this page and try again.');
    let data;
    try {
      const body = await request.text();
      if (Buffer.byteLength(body) > 8192) return error(413, 'Your submission is too long. Shorten the fields and try again.');
      data = JSON.parse(body);
      if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error();
    } catch { return error(400, 'Your submission could not be read. Refresh this page and try again.'); }
    if (data.letterHash !== letter.hash) return error(409, 'The letter has changed. Refresh this page and read it before signing.');
    if (data.consent !== true) return error(400, 'Confirm that you agree to the letter before adding your name.');
    const field = (name, max) => typeof data[name] === 'string' && data[name].length <= max && !/[\u0000-\u001f\u007f]/.test(data[name]) ? data[name].trim() : null;
    const name = field('name', 160), affiliation = field('affiliation', 240), email = field('email', 254);
    if (!name) return error(400, 'Enter your name as you want it to appear.');
    if (affiliation === null) return error(400, 'Keep your affiliation or field under 240 characters.');
    if (email === null || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return error(400, 'Enter a valid email address or leave the email field empty.');
    if (typeof data.updates !== 'boolean') return error(400, 'Choose whether you want email updates.');
    if (data.updates && !email) return error(400, 'Enter an email address to receive organising updates.');
    const existing = await signature(user.subject);
    if (existing) return json({ signature: existing });
    const screening = await screenSignature({ orcid: user.orcid, name }, { fetchImpl, providerJSON, now });
    const evidence = { profile: `${config.issuer}/${user.orcid}`, screening };
    // The authenticated session supplies the identity. Client-supplied ORCID values are ignored.
    // A unique key makes a retried or concurrent submission idempotent.
    const inserted = await db.prepare(`INSERT OR IGNORE INTO signatures
      (subject, letter_hash, letter_text, name, affiliation, email, updates, status, evidence, submitted_at, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING subject`)
      .get(user.subject, letter.hash, letter.text, name, affiliation, email, Number(data.updates), screening.status,
        JSON.stringify(evidence), now(), screening.status === 'approved' ? screening.checked_at : null);
    if (inserted) {
      // An optional referral must never make an otherwise successful signature fail.
      try { await invitations.attribute(user.subject, data.via); } catch { /* The signature is safely stored. */ }
    }
    return json({ signature: await signature(user.subject) }, 201);
  }
  return async (request, clientAddress = 'local') => {
    const allowed = request.headers.get('origin') === publicOrigin && inlinePaths.has(new URL(request.url).pathname);
    if (request.method === 'OPTIONS') {
      if (!allowed || !['GET', 'POST'].includes(request.headers.get('access-control-request-method'))) return error(403, 'This origin cannot use the signing service.');
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': publicOrigin,
        'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Letter-Request, X-CSRF-Token',
        'Access-Control-Max-Age': '600', Vary: 'Origin' } });
    }
    const response = await handle(request, clientAddress);
    if (allowed) { response.headers.set('Access-Control-Allow-Origin', publicOrigin); response.headers.set('Vary', 'Origin'); }
    return response;
  };
}
