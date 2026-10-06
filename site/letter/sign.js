/* ORCID is required for new signature requests. OAuth credentials and tokens stay
   in the Cloudflare Worker. These earlier constants remain unchanged and unused. */
var SIGN_ENDPOINT = "";
var SIGN_EMAIL = "barnes.james@gmail.com";

(function () {
  'use strict';
  const script = new URL(document.currentScript.src);
  let api = new URL('api/', script);
  const icon = new URL('assets/orcid-id.svg', script).href;
  const letterURL = new URL('studies/split-view.html', script).href;
  const root = document.querySelector('[data-signing]');
  const referralKey = 'letter-invitation';
  let referral = '';
  try {
    const arrival = new URL(location.href), via = arrival.searchParams.get('via');
    if (/^[\w-]{22}$/.test(via || '')) sessionStorage.setItem(referralKey, JSON.stringify({ id: via, created: Date.now() }));
    const saved = JSON.parse(sessionStorage.getItem(referralKey) || 'null');
    if (saved && /^[\w-]{22}$/.test(saved.id) && Date.now() - saved.created < 7 * 24 * 60 * 60 * 1000) referral = saved.id;
    if (via) { arrival.searchParams.delete('via'); history.replaceState(null, '', arrival); }
  } catch (_) { /* Reading and signing remain available without referral storage. */ }
  const hosting = window.LETTER_HOSTING;
  let hostedSigning = null;
  if (hosting?.signingUrl && location.origin === hosting.siteOrigin) {
    try {
      const target = new URL(hosting.signingUrl);
      if (target.protocol === 'https:' && !target.username && !target.password && !target.search && !target.hash) hostedSigning = target;
    } catch (_) { /* An invalid deployment setting must not redirect a visitor. */ }
  }
  const inline = Boolean(root && !document.body.classList.contains('signing-companion'));
  const remoteInline = Boolean(hostedSigning && inline);
  if (remoteInline) api = new URL('../api/', hostedSigning);
  if (inline) {
    document.querySelectorAll('a[href]').forEach(link => {
      const target = new URL(link.href);
      if (target.origin === location.origin && (target.pathname.endsWith('/letter/sign/') || target.hash === '#sign')) {
        link.href = '#sign'; link.removeAttribute('target');
      }
    });
  } else if (hostedSigning && document.body.classList.contains('signing-companion')) {
    location.replace(hosting.letterUrl + '#sign'); return;
  }
  let current = null;
  let coauthorLookup = null, lookupOrcid = null;
  function resetLookup() { coauthorLookup?.cancel(); coauthorLookup = null; lookupOrcid = null; }
  function startLookup() {
    if (!window.LetterInvitations || current.signature?.status === 'withdrawn') return;
    if (lookupOrcid !== current.user.orcid) {
      resetLookup(); lookupOrcid = current.user.orcid;
      coauthorLookup = window.LetterInvitations.createLookup(request);
    }
    coauthorLookup.start();
  }
  let inlineToken = null;
  const storageKey = 'letter-orcid-connect';
  const proof = value => typeof value === 'string' && /^[\w-]{43}$/.test(value);
  const base64url = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const returnParams = new URLSearchParams(location.hash.slice(1));
  const hasReturn = remoteInline && returnParams.has('sign-ticket');
  if (hasReturn) history.replaceState(null, '', location.pathname + location.search + '#sign');
  let bridge = null;
  if (root && !inline) {
    try {
      const query = new URL(location.href);
      if (proof(query.searchParams.get('connect')) && proof(query.searchParams.get('channel'))) {
        sessionStorage.setItem(storageKey, JSON.stringify({ challenge: query.searchParams.get('connect'),
          channel: query.searchParams.get('channel'), created: Date.now() }));
        query.searchParams.delete('connect'); query.searchParams.delete('channel'); history.replaceState(null, '', query);
      }
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (saved && proof(saved.challenge) && proof(saved.channel) && Date.now() - saved.created < 10 * 60 * 1000) bridge = saved;
    } catch (_) { /* Regular standalone signing remains available when storage is blocked. */ }
  }
  async function request(path, options = {}) {
    const headers = { Accept: 'application/json', ...options.headers };
    if (inlineToken) headers.Authorization = 'Bearer ' + inlineToken;
    if (options.method === 'POST') {
      headers['X-Letter-Request'] = '1'; headers['Content-Type'] = 'application/json';
      if (current?.csrf) headers['X-CSRF-Token'] = current.csrf;
    }
    let response;
    try {
      response = await fetch(new URL(path, api), { ...options, headers,
        credentials: remoteInline ? 'omit' : 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(path === 'coauthors' ? 45000 : 25000) });
    } catch (_) { throw new Error('The signing service could not be reached. Check your connection and try again.'); }
    let data;
    try { data = await response.json(); }
    catch (_) { throw new Error('ORCID signing is not available yet. Please try again later.'); }
    if (!response.ok) throw new Error(data.error || 'Your request could not be completed. Please try again.');
    return data;
  }
  async function startLogin() {
    if (remoteInline) {
      const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
      const channel = base64url(crypto.getRandomValues(new Uint8Array(32)));
      const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
      try { sessionStorage.setItem(storageKey, JSON.stringify({ verifier, channel, created: Date.now() })); }
      catch (_) { throw new Error('Your browser could not keep this sign-in request. Allow session storage for this site and try again.'); }
      const destination = new URL(hostedSigning); destination.search = new URLSearchParams({ connect: challenge, channel });
      location.assign(destination.href);
    } else {
      const data = await request('auth/orcid/start', { method: 'POST', body: '{}' }); location.assign(data.url);
    }
  }
  async function receiveSignIn() {
    if (!hasReturn) return;
    let pending;
    try { pending = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); sessionStorage.removeItem(storageKey); }
    catch (_) { /* A missing browser proof must never accept a returned account. */ }
    if (!pending || !proof(pending.verifier) || pending.channel !== returnParams.get('channel') ||
        Date.now() - pending.created > 10 * 60 * 1000) throw new Error('Start ORCID sign-in again from this letter to connect your account.');
    const data = await request('auth/exchange', { method: 'POST', body: JSON.stringify({ ticket: returnParams.get('sign-ticket'),
      channel: pending.channel, verifier: pending.verifier }) });
    if (!proof(data.token)) throw new Error('ORCID sign-in could not be completed. Please try again.');
    inlineToken = data.token;
  }
  async function returnToLetter() {
    root.innerHTML = '<p data-status role="status">Returning to the letter…</p>';
    try {
      const result = await request('auth/handoff', { method: 'POST', body: JSON.stringify({ challenge: bridge.challenge, channel: bridge.channel }) });
      const destination = new URL(result.url), expected = new URL(current.letter.url);
      if (destination.origin !== expected.origin || destination.pathname !== expected.pathname) throw new Error('Return to the letter and try signing in again.');
      sessionStorage.removeItem(storageKey); location.replace(destination.href);
    } catch (err) {
      root.querySelector('[data-status]').textContent = err.message;
      const retry = document.createElement('button'); retry.className = 'orcid-button'; retry.textContent = 'Try again';
      retry.addEventListener('click', returnToLetter); root.append(retry);
    }
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
      resetLookup();
      out.disabled = true;
      try { await request('auth/logout', { method: 'POST', body: '{}' }); inlineToken = null; await load(); }
      catch (err) { status(err.message, true); out.disabled = false; }
    });
    box.append(label, record, out); return box;
  }
  function showLogin(message) {
    root.innerHTML = '<p>Sign in with ORCID to connect your name to your research record. You’ll review your details before submitting your signature. We’ll look up your public coauthors while you review.</p>' +
      '<button class="orcid-button" type="button"><img alt="" width="24" height="24"><span>Continue with ORCID</span></button>' +
      '<p class="sign-help">ORCID is a free researcher identifier. You can create an account during sign-in.</p>' +
      '<p class="sign-small">We check your ORCID against publication records. Clear matches appear immediately. Other signatures are held for review.</p>' +
      '<p data-status class="sign-status" role="status" aria-live="polite"></p><button class="sign-retry" type="button" hidden>Try again</button>';
    environment();
    const button = root.querySelector('.orcid-button'); button.querySelector('img').src = icon;
    button.disabled = !current?.configured;
    button.addEventListener('click', async () => {
      button.disabled = true; status('Connecting to ORCID…');
      try { await startLogin(); }
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
      (inline ? '' : '<details class="sign-letter"><summary>Read the letter you are signing</summary><div class="sign-letter-body"></div></details>') +
      '<details class="sign-profile"><summary>Your public ORCID record</summary><div data-profile><p class="sign-small">Loading your research details…</p></div></details>' +
      '<form class="sign-fields">' +
      '<div class="sign-field"><label for="sign-name">Name</label><input id="sign-name" name="name" autocomplete="name" maxlength="160" required></div>' +
      '<div class="sign-field"><label for="sign-affiliation">Affiliation or field</label><input id="sign-affiliation" name="affiliation" autocomplete="organization" maxlength="240"><p data-aff-source class="sign-small"></p></div>' +
      '<div class="sign-field"><label for="sign-email">Email for organising updates (optional)</label><input id="sign-email" name="email" type="email" autocomplete="email" maxlength="254"></div>' +
      '<label class="sign-check"><input name="updates" type="checkbox"><span>Email me about organising collective bargaining.</span></label>' +
      '<p class="sign-small">Your name, affiliation and ORCID iD will appear publicly after the research record check. Your email will stay private.</p>' +
      (referral ? '<p class="sign-small">When you sign, we’ll record the invitation link that brought you here.</p>' : '') +
      '<label class="sign-check"><input name="consent" type="checkbox" required><span>I agree to the letter and want my name added.</span></label>' +
      '<button class="sign-submit" type="submit">Submit my signature</button></form>' +
      '<p data-status class="sign-status" role="status" aria-live="polite"></p>';
    root.prepend(identity()); environment();
    const body = root.querySelector('.sign-letter-body');
    if (body) {
      const title = document.createElement('h2'); title.textContent = current.letter.title; body.append(title);
      current.letter.paragraphs.forEach(text => { const p = document.createElement('p'); p.textContent = text; body.append(p); });
    }
    const form = root.querySelector('form'); form.elements.name.value = current.user.name || '';
    for (const field of ['name', 'affiliation']) form.elements[field].addEventListener('input', () => { form.elements[field].dataset.edited = 'true'; });
    fillProfile(form);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (form.elements.updates.checked && !form.elements.email.value.trim()) {
        status('Enter an email address to receive organising updates.', true); form.elements.email.focus(); return;
      }
      const button = form.querySelector('button[type="submit"]'); button.disabled = true;
      status('Saving your signature and checking your research record…');
      try {
        const result = await request('signatures', { method: 'POST', body: JSON.stringify({
          name: form.elements.name.value.trim(), affiliation: form.elements.affiliation.value.trim(),
          email: form.elements.email.value.trim(), updates: form.elements.updates.checked,
          consent: form.elements.consent.checked, letterHash: current.letter.hash, via: referral
        }) });
        current.signature = result.signature; referral = '';
        try { sessionStorage.removeItem(referralKey); } catch (_) { /* Optional attribution. */ }
        showResult();
        if (current.signature.status === 'approved') void loadSignatories();
      } catch (err) { status(err.message, true); button.disabled = false; }
    });
  }
  async function fillProfile(form) {
    const panel = root.querySelector('[data-profile]');
    try {
      const profile = await request('profile');
      if (!root.contains(form)) return;
      if (profile.name && !form.elements.name.dataset.edited) form.elements.name.value = profile.name;
      if (profile.suggestedAffiliation && !form.elements.affiliation.dataset.edited) {
        form.elements.affiliation.value = profile.suggestedAffiliation;
        root.querySelector('[data-aff-source]').textContent = 'From your public ORCID record. You can edit this.';
      }
      panel.textContent = '';
      const paragraph = (text, className = 'sign-small') => { const p = document.createElement('p'); p.className = className; p.textContent = text; panel.append(p); };
      if (profile.status === 'unavailable') { paragraph('Your public ORCID details could not be loaded. You can enter your affiliation below.'); return; }
      if (!profile.affiliations.length && !profile.keywords.length && !profile.works.length) {
        paragraph('Your public ORCID record has no affiliation or research details to show yet. You can enter your affiliation below.'); return;
      }
      paragraph('These details come from your public ORCID record. Only the name and affiliation you submit will appear beside your ORCID iD on the letter.');
      profile.affiliations.slice(0, 4).forEach(affiliation => {
        const row = document.createElement('div'); row.className = 'sign-profile-affiliation';
        const name = document.createElement('p'); name.textContent = affiliation.organization; row.append(name);
        const detail = [affiliation.role, affiliation.department].filter(Boolean).join(', ');
        if (detail) { const p = document.createElement('p'); p.className = 'sign-small'; p.textContent = detail; row.append(p); }
        const choose = document.createElement('button'); choose.type = 'button'; choose.className = 'sign-aff-choice'; choose.textContent = 'Use this affiliation';
        choose.addEventListener('click', () => { form.elements.affiliation.value = affiliation.organization; form.elements.affiliation.dataset.edited = 'true';
          root.querySelector('[data-aff-source]').textContent = 'From your public ORCID record. You can edit this.'; });
        row.append(choose); panel.append(row);
      });
      if (profile.keywords.length) paragraph('Research interests: ' + profile.keywords.join(', '));
      if (profile.works.length) {
        paragraph('Recent works listed on ORCID');
        const list = document.createElement('ul'); list.className = 'sign-profile-works';
        profile.works.forEach(work => { const item = document.createElement('li');
          const title = document.createElement(work.url?.startsWith('https://doi.org/') ? 'a' : 'span');
          title.textContent = work.title; if (title.tagName === 'A') { title.href = work.url; title.target = '_blank'; title.rel = 'noopener noreferrer'; }
          item.append(title); if (work.year) item.append(document.createTextNode(' (' + work.year + ')')); list.append(item); });
        panel.append(list);
      }
      if (profile.status === 'partial') paragraph('Some ORCID details could not be loaded. You can still complete the form.');
    } catch (_) { if (root.contains(form)) panel.textContent = 'Your public ORCID details could not be loaded. You can enter your affiliation below.'; }
  }
  function showResult() {
    root.innerHTML = '<div class="sign-result"><h2></h2><p class="sign-public-name"></p><p class="sign-public-affiliation sign-small"></p><p class="sign-result-note"></p>' +
      '<div class="sign-share" data-invitations></div></div>' +
      '<p data-status class="sign-status" role="status" aria-live="polite"></p>';
    root.prepend(identity()); environment();
    const approved = current.signature.status === 'approved', withdrawn = current.signature.status === 'withdrawn';
    root.querySelector('h2').textContent = approved ? (current.environment === 'sandbox' ? 'Test signature saved.' : 'Your name has been added.') : withdrawn ? 'Your signature has been withdrawn.' : 'Your signature is awaiting review.';
    root.querySelector('.sign-public-name').textContent = current.signature.name;
    root.querySelector('.sign-public-affiliation').textContent = current.signature.affiliation;
    root.querySelector('.sign-result-note').textContent = withdrawn ? 'Your signature is no longer included in the public list.' : approved ? 'Thank you for signing the letter.' : 'Your signature is saved. We need to check your research record before adding your name to the public list.';
    const invitations = root.querySelector('[data-invitations]');
    if (withdrawn) { invitations.remove(); return; }
    if (window.LetterInvitations) {
      window.LetterInvitations.mount(invitations, { request, letter: current.letter, lookup: coauthorLookup || undefined }); return;
    }
    invitations.innerHTML = '<p>Invite a collaborator to read the letter.</p><button type="button">Copy letter link</button>';
    invitations.querySelector('button').addEventListener('click', async () => {
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
      if (inline) {
        const normalise = text => text.replace(/\s+/g, ' ').trim();
        const title = document.querySelector('#letter-title, .study-title');
        const paragraphs = [...document.querySelectorAll('.letter-body > p, .letter-copy > p')].map(p => normalise(p.textContent));
        if (!title || normalise(title.innerText) !== current.letter.title || JSON.stringify(paragraphs) !== JSON.stringify(current.letter.paragraphs)) {
          root.innerHTML = '<p role="status">The letter has been updated. Reload this page to read the current version before signing.</p><button type="button" class="orcid-button">Reload the letter</button>';
          root.querySelector('button').addEventListener('click', () => location.reload());
          return;
        }
      }
      if (bridge && current.user) { await returnToLetter(); return; }
      if (!current.user) {
        resetLookup();
        showLogin(message);
        if (bridge && !message && current.configured) {
          status('Connecting to ORCID…'); root.querySelector('.orcid-button').disabled = true;
          try { await startLogin(); } catch (err) { showLogin(err.message); }
        }
      } else { startLookup(); if (current.signature) showResult(); else showForm(); }
    } catch (err) { resetLookup(); current = null; showLogin(err.message); }
    finally { root.setAttribute('aria-busy', 'false'); }
  }
  let signatoryResize;
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
      const list = [];
      const normalise = value => String(value || '').normalize('NFKC').trim().toLowerCase();
      for (const signer of existing.concat(approved)) {
        const duplicate = list.findIndex(s => (s.orcid && signer.orcid && s.orcid === signer.orcid) ||
          ((!s.orcid || !signer.orcid) && normalise(s.name) === normalise(signer.name) && normalise(s.affiliation) === normalise(signer.affiliation)));
        if (duplicate < 0) list.push(signer); else list[duplicate] = signer;
      }
      const citationCount = s => Number.isSafeInteger(s.citations?.count) && s.citations.count >= 0 &&
        /^https:\/\/openalex\.org\/A\d+$/.test(s.citations.url) ? s.citations.count : null;
      list.sort((a, b) => (citationCount(b) ?? -1) - (citationCount(a) ?? -1));
      if (!list.length) return;
      roll.textContent = '';
      if (study) { roll.setAttribute('role', 'list'); roll.setAttribute('aria-label', 'Signatories'); }
      list.forEach(s => {
        const li = document.createElement(study ? 'div' : 'li'), name = document.createElement(study ? 'p' : 'span');
        if (study) { li.className = 'signature-entry'; li.setAttribute('role', 'listitem'); }
        name.className = study ? 'signature-name' : 'who'; name.textContent = s.name; li.append(name);
        if (/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(s.orcid || '')) {
          const link = document.createElement('a'); link.href = 'https://orcid.org/' + s.orcid; link.textContent = s.name;
          link.target = '_blank'; link.rel = 'noopener noreferrer'; link.setAttribute('aria-label', s.name + ' · ORCID record');
          name.textContent = ''; name.append(link);
        }
        if (s.affiliation) { const aff = document.createElement(study ? 'p' : 'span'); aff.className = study ? 'signature-aff' : 'aff'; aff.textContent = s.affiliation; li.append(aff); }
        if (citationCount(s) !== null) {
          const citations = document.createElement('p'), source = document.createElement('a');
          citations.className = 'signature-citations'; source.href = s.citations.url;
          source.target = '_blank'; source.rel = 'noopener noreferrer';
          source.textContent = citationCount(s).toLocaleString('en-US') + ' citations';
          source.setAttribute('aria-label', source.textContent + ' · OpenAlex');
          if (Number.isFinite(s.citations.retrievedAt)) source.title = 'Checked ' + new Date(s.citations.retrievedAt).toLocaleDateString('en-US');
          citations.append(source); li.append(citations);
        }
        roll.append(li);
      });
      count.textContent = list.length + (list.length === 1 ? ' signature' : ' signatures');
      if (study) {
        signatoryResize?.disconnect();
        study.querySelector('[data-signatory-toggle]')?.remove();
        const meta = study.querySelector('.signature-meta');
        if (meta) {
          const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'signature-toggle';
          toggle.dataset.signatoryToggle = ''; roll.id ||= 'public-signatures'; toggle.setAttribute('aria-controls', roll.id);
          roll.onkeydown = event => {
            if (event.target !== roll || study.dataset.expanded === 'true' || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            roll.scrollLeft = event.key === 'Home' ? 0 : event.key === 'End' ? roll.scrollWidth :
              roll.scrollLeft + (event.key === 'ArrowRight' ? 1 : -1) * roll.clientWidth * .8;
          };
          const update = () => {
            const expanded = study.dataset.expanded === 'true', overflow = roll.scrollWidth > roll.clientWidth + 1;
            toggle.hidden = !expanded && !overflow; toggle.textContent = expanded ? 'Collapse' : 'View all';
            toggle.setAttribute('aria-expanded', String(expanded));
            if (!expanded && overflow) roll.tabIndex = 0; else roll.removeAttribute('tabindex');
          };
          toggle.addEventListener('click', () => { study.dataset.expanded = String(study.dataset.expanded !== 'true'); update(); });
          meta.append(toggle); update();
          if (window.ResizeObserver) { signatoryResize = new ResizeObserver(update); signatoryResize.observe(roll); }
        }
      }
      const context = document.querySelector('[data-signatory-context]');
      if (context && list.length >= 3) {
        const featured = list.filter(s => citationCount(s) !== null).slice(0, 2);
        context.textContent = featured.length === 2 ? 'An open letter from ' + featured[0].name + ', ' + featured[1].name +
          ' and ' + (list.length - 2).toLocaleString('en-US') + (list.length === 3 ? ' other scientist' : ' other scientists') + ' to the frontier labs' :
          'An open letter from ' + list.length.toLocaleString('en-US') + ' scientists to the frontier labs';
      }
    } catch (_) { /* Keep the existing public list when the service is unavailable. */ }
  }
  loadSignatories();
  if (root) {
    receiveSignIn().then(load).catch(async err => { await load(); if (!current?.user) showLogin(err.message); })
      .finally(() => { if (hasReturn) document.getElementById('sign')?.scrollIntoView({ block: 'start' }); });
  }
})();
