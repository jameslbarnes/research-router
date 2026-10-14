import {createHash, randomBytes} from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
const TTL = 10 * 60 * 1000;
export function academicAddress(value) {
  if (typeof value !== 'string' || value.length > 254) return null;
  const email = value.trim().toLowerCase();
  if (!/^[a-z0-9!#$%&'*+\/=?^_`{|}~.-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email)) return null;
  const [local, domain] = email.split('@');
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..') || domain.split('.').some(x => x.length > 63)) return null;
  return {email, domain};
}

// ROR is queried with the domain only. Never send the mailbox, name or token.
// Search results are not evidence until their explicit domains match a boundary.
export async function findInstitution(domain, providerJSON, fetchImpl) {
  const parts = domain.split('.');
  const domains = parts.map((_, i) => parts.slice(i).join('.')).filter(d => d.includes('.'));
  const query = 'domains:(' + domains.map(d => '"' + d + '"').join(' OR ') + ')';
  const matches = [];
  for (let page = 1; page <= 3; page++) {
    const params = new URLSearchParams({'query.advanced': query, page: String(page)});
    const data = await providerJSON(fetchImpl, 'https://api.ror.org/v2/organizations?' + params, {timeoutMs: 6000});
    if (!Array.isArray(data.items) || !Number.isInteger(data.number_of_results)) throw new Error('Institution lookup unavailable.');
    for (const item of data.items) {
      if (item.status !== 'active' || !item.types?.some(t => ['education','facility','nonprofit','healthcare','government'].includes(t))) continue;
      if (!/^https:\/\/ror\.org\/[a-z0-9]+$/.test(item.id)) continue;
      for (const candidate of item.domains || []) {
        if (!domains.includes(candidate)) continue;
        const name = item.names?.find(n => n.types?.includes('ror_display'))?.value;
        if (typeof name === 'string' && name.length <= 240) matches.push({id: item.id, name, domain: candidate});
      }
    }
    if (data.items.length * page >= data.number_of_results || !data.items.length) break;
  }
  matches.sort((a,b) => b.domain.length-a.domain.length);
  const first = matches[0];
  if (!first || matches.some(m => m.domain === first.domain && m.id !== first.id)) return null;
  return first;
}

export function createEmailAuth({config, db, now, limit, providerJSON, fetchImpl, sendVerification}) {
  const enabled = Boolean(config.emailEnabled && config.emailFrom && sendVerification);
  const failure = (status, error) => ({status, error});
  async function start(data, origin, address) {
    if (!enabled) return failure(503, 'Academic email sign-in is not available yet. You can continue with ORCID.');
    const parsed = academicAddress(data.email);
    if (!parsed) return failure(400, 'Enter a valid academic or research email address.');
    if (!await limit('email-global', 100) || !await limit('email-ip:' + address, 6) || !await limit('email-address:' + parsed.email, 3)) {
      return failure(429, 'Too many verification requests. Please try again in ten minutes.');
    }
    let institution;
    try {
      const saved = await db.prepare('SELECT institution FROM academic_domains WHERE domain=? AND expires_at>?').get(parsed.domain, now());
      institution = saved ? JSON.parse(saved.institution) : await findInstitution(parsed.domain, providerJSON, fetchImpl);
      if (!saved) await db.prepare('INSERT INTO academic_domains VALUES (?, ?, ?) ON CONFLICT(domain) DO UPDATE SET institution=excluded.institution, expires_at=excluded.expires_at')
        .run(parsed.domain, JSON.stringify(institution), now() + (institution ? 86400000 : 3600000));
    } catch { return failure(503, 'We could not check your institution right now. Try again, or continue with ORCID.'); }
    if (!institution) return failure(400, 'We could not recognise this address as an academic or research institution. You can use ORCID instead.');
    const token = randomBytes(32).toString('base64url');
    const link = new URL('/letter/sign/', config.origin);
    link.hash = new URLSearchParams({'email-token': token});
    await db.prepare('DELETE FROM email_challenges WHERE expires_at<=?').run(now());
    await db.prepare('INSERT INTO email_challenges VALUES (?, ?, ?, ?, ?)')
      .run(hash(token), parsed.email, config.origin, JSON.stringify(institution), now() + TTL);
    try {
      await sendVerification({from: config.emailFrom, to: parsed.email,
        subject: 'Confirm your email for Bargaining for Our Minds',
        text: 'Confirm your academic email and continue:\n' + link.href + '\n\nThis link works once and expires in ten minutes. You will review your details and confirm the letter before your name is published.\n\nIf you did not request this email, you can ignore it. Do not forward this link.',
        html: '<p><a href="' + link.href + '">Confirm your email and continue</a></p><p>This link works once and expires in ten minutes. You will review your details and confirm the letter before your name is published.</p><p>If you did not request this email, you can ignore it. Do not forward this link.</p>'});
    } catch {
      await db.prepare('DELETE FROM email_challenges WHERE token_hash=?').run(hash(token));
      return failure(503, 'The verification email could not be sent. Try again later, or continue with ORCID.');
    }
    return {ok: true, expiresIn: TTL / 1000};
  }
  async function verify(data, origin, address) {
    if (!enabled) return failure(503, 'Academic email sign-in is not available yet. You can continue with ORCID.');
    if (!await limit('email-verify:' + address, 30)) return failure(429, 'Too many verification attempts. Please try again in ten minutes.');
    const invalid = () => failure(400, 'That confirmation link is expired or has already been used. Request a new link from the letter.');
    if (typeof data.token !== 'string' || !/^[\w-]{43}$/.test(data.token)) return invalid();
    // A link is consumed only by an explicit POST on the signing page. Email
    // scanners and previews cannot consume it with a GET. Its fragment is not
    // sent in HTTP requests, referrers or access logs.
    const verified = await db.prepare(`DELETE FROM email_challenges WHERE token_hash=?
      AND client_origin=? AND expires_at>? RETURNING email, institution`).get(hash(data.token), origin, now());
    if (!verified) return invalid();
    const subject = config.environment + ':email:' + hash(verified.email);
    await db.prepare(`INSERT INTO identities (subject, orcid, environment, name, token_encrypted, authenticated_at)
      VALUES (?, '', ?, '', '', ?) ON CONFLICT(subject) DO UPDATE SET authenticated_at=excluded.authenticated_at`)
      .run(subject, config.environment, now());
    await db.prepare(`INSERT INTO email_identities VALUES (?, ?, ?, ?) ON CONFLICT(subject)
      DO UPDATE SET verified_at=excluded.verified_at, institution=excluded.institution`)
      .run(subject, verified.email, now(), verified.institution);
    await db.prepare('DELETE FROM email_challenges WHERE email=?').run(verified.email);
    return {subject};
  }
  return {enabled, start, verify};
}
