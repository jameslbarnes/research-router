import { createHash, randomBytes, timingSafeEqual, createCipheriv } from 'node:crypto';

const API = '/letter/api';
const SIGN_PAGE = '/letter/sign/';
const FLOW_TTL = 10 * 60 * 1000;
const SESSION_TTL = 12 * 60 * 60 * 1000;
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

async function providerJSON(fetchImpl, url, options = {}) {
  const response = await fetchImpl(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('Provider request failed.');
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

async function researchEvidence(config, orcid, fetchImpl, now) {
  const evidence = { profile: `${config.issuer}/${orcid}`, retrieved_at: now, status: 'unavailable' };
  try {
    const activities = await providerJSON(fetchImpl, `${config.publicApi}/v3.0/${orcid}/activities-summary`, {
      headers: { Accept: 'application/json' },
    });
    const affiliations = ['employments', 'educations'].flatMap(kind =>
      (activities[kind]?.['affiliation-group'] || []).flatMap(group => group.summaries || []));
    const works = activities.works?.group || [];
    return { ...evidence, status: 'retrieved', affiliations: affiliations.slice(0, 30),
      works: works.slice(0, 30), returned_work_groups: works.length,
      sample_limited: affiliations.length > 30 || works.length > 30 };
  } catch { return evidence; }
}

export function createApp({ config, db, letter, fetchImpl = fetch, now = Date.now }) {
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
    const value = cookies(request)[sessionName];
    if (!value || !/^[\w-]{43}$/.test(value)) return null;
    return await db.prepare(`SELECT sessions.*, identities.orcid, identities.name, identities.environment
      FROM sessions JOIN identities USING(subject) WHERE session_hash=? AND expires_at>? AND environment=?`).get(hash(value), now(), config.environment);
  };
  const signature = async subject => await db.prepare('SELECT name, affiliation, status, submitted_at FROM signatures WHERE subject=? AND letter_hash=?').get(subject, letter.hash) || null;
  async function limit(bucket, max = 60) {
    const key = hash(bucket);
    const time = now();
    await db.prepare('DELETE FROM rate_limits WHERE expires_at<=?').run(time);
    await db.prepare(`INSERT INTO rate_limits VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count=count+1`).run(key, time + FLOW_TTL);
    return (await db.prepare('SELECT count FROM rate_limits WHERE bucket=?').get(key)).count <= max;
  }
  async function clean() {
    await db.prepare('DELETE FROM oauth_states WHERE expires_at<=?').run(now());
    await db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now());
  }

  return async function handle(request, clientAddress = 'local') {
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
    if (request.method === 'GET' && path === `${API}/signatures`) {
      const response = json(await db.prepare(`SELECT signatures.name, affiliation, orcid FROM signatures JOIN identities USING(subject)
        WHERE status='approved' AND environment='production' AND letter_hash=? ORDER BY submitted_at`).all(letter.hash));
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
        await db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run(hash(sid), subject, token(), now() + SESSION_TTL);
        return redirect('connected', [clearFlow, cookie(sessionName, sid, SESSION_TTL / 1000)]);
      } catch { return redirect('failed', [clearFlow]); }
    }
    if (request.method !== 'POST') return error(404, 'This signing service address was not found.');
    if (request.headers.get('origin') !== config.origin || request.headers.get('x-letter-request') !== '1') {
      return error(403, 'Open the letter on this site and try again.');
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
    const evidence = await researchEvidence(config, user.orcid, fetchImpl, now());
    // The authenticated session supplies the identity. Client-supplied ORCID values are ignored.
    // A unique key makes a retried or concurrent submission idempotent.
    await db.prepare(`INSERT OR IGNORE INTO signatures
      (subject, letter_hash, letter_text, name, affiliation, email, updates, status, evidence, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, ?)`)
      .run(user.subject, letter.hash, letter.text, name, affiliation, email, Number(data.updates), JSON.stringify(evidence), now());
    return json({ signature: await signature(user.subject) }, 201);
  };
}
