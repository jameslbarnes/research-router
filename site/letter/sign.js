/* ORCID is required for new signature requests. OAuth credentials and tokens stay
   in the Cloudflare Worker. These earlier constants remain unchanged and unused. */
var SIGN_ENDPOINT = "";
var SIGN_EMAIL = "barnes.james@gmail.com";

(function () {
  'use strict';
  const script = new URL(document.currentScript.src);
  const api = new URL('api/', script);
  const icon = new URL('assets/orcid-id.svg', script).href;
  const letterURL = new URL('studies/split-view.html', script).href;
  const root = document.querySelector('[data-signing]');
  const hosting = window.LETTER_HOSTING;
  let hostedSigning = null;
  if (hosting?.signingUrl && location.origin === hosting.siteOrigin) {
    try {
      const target = new URL(hosting.signingUrl);
      if (target.protocol === 'https:' && !target.username && !target.password && !target.search && !target.hash) hostedSigning = target;
    } catch (_) { /* An invalid deployment setting must not redirect a visitor. */ }
  }
  if (hostedSigning) {
    document.querySelectorAll('a[href]').forEach(link => {
      const target = new URL(link.href);
      if (target.origin === location.origin && (target.pathname.endsWith('/letter/sign/') || target.hash === '#sign')) link.href = hostedSigning.href;
    });
    if (document.body.classList.contains('signing-companion')) {
      location.replace(hostedSigning.href);
      return;
    }
    if (root) {
      root.textContent = '';
      const link = document.createElement('a'); link.className = 'orcid-button';
      link.href = hostedSigning.href; link.textContent = 'Continue to signing'; root.append(link);
      root.setAttribute('aria-busy', 'false');
    }
  }
  let current = null;
  async function request(path, options = {}) {
    const headers = { Accept: 'application/json', ...options.headers };
    if (options.method === 'POST') {
      headers['X-Letter-Request'] = '1'; headers['Content-Type'] = 'application/json';
      if (current?.csrf) headers['X-CSRF-Token'] = current.csrf;
    }
    let response;
    try {
      response = await fetch(new URL(path, api), { ...options, headers,
        credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(25000) });
    } catch (_) { throw new Error('The signing service could not be reached. Check your connection and try again.'); }
    let data;
    try { data = await response.json(); }
    catch (_) { throw new Error('ORCID signing is not available on this preview. Please try again when the signing service is connected.'); }
    if (!response.ok) throw new Error(data.error || 'Your request could not be completed. Please try again.');
    return data;
  }
  function status(message, isError = false) {
    const el = root.querySelector('[data-status]');
    el.textContent = message; el.className = 'sign-status' + (isError ? ' error' : '');
  }
  function environment() {
    if (current?.environment === 'sandbox') {
      const note = document.createElement('p'); note.className = 'sign-environment';
      note.textContent = 'ORCID sandbox · Test signatures stay private.'; root.prepend(note);
    }
  }
  function identity() {
    const box = document.createElement('div'); box.className = 'orcid-identity';
    const label = document.createElement('p'); label.className = 'sign-small'; label.textContent = 'Connected with ORCID';
    const record = document.createElement('div'); record.className = 'orcid-record';
    const image = document.createElement('img'); image.src = icon; image.alt = '';
    const link = document.createElement('a'); link.href = current.user.url; link.textContent = current.user.url;
    link.target = '_blank'; link.rel = 'noopener noreferrer'; record.append(image, link);
    const out = document.createElement('button'); out.type = 'button'; out.className = 'sign-out'; out.textContent = 'Sign out';
    out.addEventListener('click', async () => {
      out.disabled = true;
      try { await request('auth/logout', { method: 'POST', body: '{}' }); await load(); }
      catch (err) { status(err.message, true); out.disabled = false; }
    });
    box.append(label, record, out); return box;
  }
  function showLogin(message) {
    root.innerHTML = '<p>Sign in with ORCID to connect your name to your research record. You’ll review your details before submitting your signature.</p>' +
      '<button class="orcid-button" type="button"><img alt="" width="24" height="24"><span>Continue with ORCID</span></button>' +
      '<p class="sign-help">ORCID is a free researcher identifier. You can create an account during sign-in.</p>' +
      '<p class="sign-small">We’ll review your research identity before publishing your signature. Your name, affiliation and ORCID iD will appear on the letter once approved.</p>' +
      '<p data-status class="sign-status" role="status" aria-live="polite"></p><button class="sign-retry" type="button" hidden>Try again</button>';
    environment();
    const button = root.querySelector('.orcid-button'); button.querySelector('img').src = icon;
    button.disabled = !current?.configured;
    button.addEventListener('click', async () => {
      button.disabled = true; status('Connecting to ORCID…');
      try { const data = await request('auth/orcid/start', { method: 'POST', body: '{}' }); location.assign(data.url); }
      catch (err) { status(err.message, true); button.disabled = false; }
    });
    if (message) status(message, true);
    else if (!current?.configured) status('ORCID signing is being set up. Please try again later.');
    if (!current?.configured) {
      const retry = root.querySelector('.sign-retry'); retry.hidden = false; retry.addEventListener('click', load);
    }
  }
  function showForm() {
    root.innerHTML = '<p>Choose how your name will appear on the letter.</p>' +
      '<details class="sign-letter"><summary>Read the letter you are signing</summary><div class="sign-letter-body"></div></details>' +
      '<form class="sign-fields">' +
      '<div class="sign-field"><label for="sign-name">Name</label><input id="sign-name" name="name" autocomplete="name" maxlength="160" required></div>' +
      '<div class="sign-field"><label for="sign-affiliation">Affiliation or field</label><input id="sign-affiliation" name="affiliation" autocomplete="organization" maxlength="240"></div>' +
      '<div class="sign-field"><label for="sign-email">Email for organising updates (optional)</label><input id="sign-email" name="email" type="email" autocomplete="email" maxlength="254"></div>' +
      '<label class="sign-check"><input name="updates" type="checkbox"><span>Email me about organising collective bargaining.</span></label>' +
      '<p class="sign-small">Your name, affiliation and ORCID iD will be public once approved. Your email will stay private.</p>' +
      '<label class="sign-check"><input name="consent" type="checkbox" required><span>I agree to the letter and want my name added.</span></label>' +
      '<button class="sign-submit" type="submit">Submit my signature</button></form>' +
      '<p data-status class="sign-status" role="status" aria-live="polite"></p>';
    root.prepend(identity()); environment();
    const body = root.querySelector('.sign-letter-body');
    const title = document.createElement('h2'); title.textContent = current.letter.title; body.append(title);
    current.letter.paragraphs.forEach(text => { const p = document.createElement('p'); p.textContent = text; body.append(p); });
    const form = root.querySelector('form'); form.elements.name.value = current.user.name || '';
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (form.elements.updates.checked && !form.elements.email.value.trim()) {
        status('Enter an email address to receive organising updates.', true); form.elements.email.focus(); return;
      }
      const button = form.querySelector('button[type="submit"]'); button.disabled = true;
      status('Submitting your signature…');
      try {
        const result = await request('signatures', { method: 'POST', body: JSON.stringify({
          name: form.elements.name.value.trim(), affiliation: form.elements.affiliation.value.trim(),
          email: form.elements.email.value.trim(), updates: form.elements.updates.checked,
          consent: form.elements.consent.checked, letterHash: current.letter.hash
        }) });
        current.signature = result.signature; showResult();
      } catch (err) { status(err.message, true); button.disabled = false; }
    });
  }
  function showResult() {
    root.innerHTML = '<div class="sign-result"><h2></h2><p class="sign-public-name"></p><p class="sign-public-affiliation sign-small"></p><p class="sign-result-note"></p>' +
      '<div class="sign-share"><p>Invite a collaborator to read the letter.</p><button type="button">Copy letter link</button></div></div>' +
      '<p data-status class="sign-status" role="status" aria-live="polite"></p>';
    root.prepend(identity()); environment();
    const approved = current.signature.status === 'approved', withdrawn = current.signature.status === 'withdrawn';
    root.querySelector('h2').textContent = approved ? 'Your name has been added.' : withdrawn ? 'Your signature has been withdrawn.' : 'Your signature is awaiting review.';
    root.querySelector('.sign-public-name').textContent = current.signature.name;
    root.querySelector('.sign-public-affiliation').textContent = current.signature.affiliation;
    root.querySelector('.sign-result-note').textContent = withdrawn ? 'Your signature is no longer included in the public list.' : approved ? 'Thank you for signing the letter.' : 'Your ORCID account is connected. We’ll check your research identity before adding your name to the public list.';
    root.querySelector('.sign-share button').addEventListener('click', async () => {
      const shareURL = current.letter.url || letterURL;
      try { await navigator.clipboard.writeText(shareURL); status('Letter link copied.'); }
      catch (_) { status('Copy this address to share the letter: ' + shareURL); }
    });
  }
  async function load() {
    root.setAttribute('aria-busy', 'true');
    try {
      current = await request('session');
      const query = new URL(location.href);
      const errors = { cancelled: 'ORCID sign-in was cancelled. Try again when you’re ready.',
        expired: 'That sign-in link has expired. Please start again.', failed: 'ORCID sign-in could not be completed. Please try again.',
        unavailable: 'ORCID signing is not available yet. Please try again later.' };
      const message = errors[query.searchParams.get('auth')];
      if (query.searchParams.has('auth')) { query.searchParams.delete('auth'); history.replaceState(null, '', query); }
      if (!current.user) showLogin(message); else if (current.signature) showResult(); else showForm();
    } catch (err) { current = null; showLogin(err.message); }
    finally { root.setAttribute('aria-busy', 'false'); }
  }
  async function loadSignatories() {
    const study = document.querySelector('[data-signatories]');
    const roll = document.getElementById('roll') || study?.querySelector('[data-signatory-list]');
    const count = document.getElementById('signed-count') || study?.querySelector('[data-signatory-count]');
    if (!roll || !count) return;
    try {
      const [existing, approved] = await Promise.all([
        fetch(new URL('signatories.json', script), { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
        (hostedSigning ? fetch(new URL('../api/signatures', hostedSigning), { credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(12000) })
          .then(r => { if (!r.ok) throw new Error(); return r.json(); }) : request('signatures')).catch(() => [])
      ]);
      const list = existing.concat(approved); if (!list.length) return;
      roll.textContent = '';
      list.forEach(s => {
        const li = document.createElement(study ? 'div' : 'li'), name = document.createElement(study ? 'p' : 'span');
        name.className = study ? 'signature-name' : 'who'; name.textContent = s.name; li.append(name);
        if (s.affiliation) { const aff = document.createElement(study ? 'p' : 'span'); aff.className = study ? 'signature-aff' : 'aff'; aff.textContent = s.affiliation; li.append(aff); }
        if (/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(s.orcid || '')) {
          const link = document.createElement('a'); link.href = 'https://orcid.org/' + s.orcid; link.textContent = link.href; li.append(link);
        }
        roll.append(li);
      });
      count.textContent = list.length + (list.length === 1 ? ' signature' : ' signatures');
    } catch (_) { /* Keep the existing public list when the service is unavailable. */ }
  }
  loadSignatories();
  if (root && !hostedSigning) load();
})();
