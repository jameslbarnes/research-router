/* Personal invitations use the device share menu. This page never sends a message. */
(function () {
  'use strict';
  window.LetterInvitations = { mount, createLookup };
  // A single lookup survives the transition from reviewing a signature to
  // inviting collaborators. It does not prepare invitations or sign anything.
  function createLookup(request) {
    let state = { network: null, loading: false, error: '' }, pending = null, attempted = false, cancelled = false;
    const listeners = new Set();
    function update(changes) {
      if (cancelled) return;
      state = { ...state, ...changes }; listeners.forEach(listener => listener(state));
    }
    function start(refresh = false) {
      if (cancelled || (attempted && !refresh && !pending)) return Promise.resolve();
      if (pending) return pending;
      attempted = true; update({ loading: true, error: '' });
      pending = (async () => {
        try {
          const network = await request('coauthors', { method: 'POST', body: '{}' });
          if (cancelled) return;
          update({ network });
          if (['pending', 'unavailable'].includes(network.citationLookup?.status)) {
            try {
              const ranked = await request('coauthors/citations', { method: 'POST', body: '{}' });
              update({ network: ranked });
            } catch (_) {
              update({ network: { ...network, citationLookup: { ...network.citationLookup, status: 'unavailable' } } });
            }
          }
        } catch (err) { update({ error: err.message }); }
        finally { pending = null; update({ loading: false }); }
      })();
      return pending;
    }
    return { start, subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener); },
      cancel() { cancelled = true; listeners.clear(); } };
  }
  function mount(panel, { request, letter, lookup = createLookup(request) }) {
    panel.innerHTML = '<p class="invite-prompt" aria-live="polite">Would you invite a collaborator to read the letter?</p>' +
      '<div class="invite-actions"><button type="button" class="invite-native">Share invitation</button>' +
      '<button type="button" class="invite-copy">Copy invitation</button></div>' +
      '<p class="sign-small invite-help">Choose the recipient in your usual messaging app.</p>' +
      '<p data-invite-status class="sign-status" role="status" aria-live="polite"></p>' +
      '<p class="sign-small invite-privacy" hidden>Your invitation link lets us count new signatures.</p>';
    const find = selector => panel.querySelector(selector);
    const native = find('.invite-native'), copyButton = find('.invite-copy');
    const message = 'I’ve signed this letter asking AI labs to negotiate collectively with researchers. Would you take a look and consider joining me?';
    const status = (text, error = false) => {
      const el = find('[data-invite-status]'); el.textContent = text; el.classList.toggle('error', error);
    };
    let prepared = null, busy = false, interacted = false;
    native.hidden = typeof navigator.share !== 'function';
    if (native.hidden) find('.invite-help').textContent = 'Paste the invitation into your usual messaging app.';
    function setBusy(value) { busy = value; native.disabled = value; copyButton.disabled = value; }
    function invitation() { return prepared || { url: letter.url }; }

    lookup.subscribe(({ network, loading }) => {
      if (!panel.isConnected || interacted || loading || !network) return;
      // Wait for ranking to settle, then use up to two distinct names in the
      // prompt. The shared message stays general; the recipient is chosen later.
      const candidates = network.candidates || [], names = [], seen = new Set();
      for (const candidate of candidates) {
        const name = candidate.name?.trim(), key = name?.normalize('NFKC').toLocaleLowerCase();
        if (!name || seen.has(key)) continue;
        names.push(name); seen.add(key);
        if (names.length === 2) break;
      }
      const prompt = find('.invite-prompt');
      const moreCoauthors = candidates.length > names.length;
      prompt.replaceChildren('Would you invite ');
      names.forEach((name, index) => {
        if (index) prompt.append(moreCoauthors ? ', ' : ' or ');
        const person = document.createElement('strong'); person.textContent = name; prompt.append(person);
      });
      if (!names.length) prompt.append('a collaborator');
      else if (moreCoauthors) prompt.append(', or any of the ' + candidates.length.toLocaleString('en-US') + ' coauthors we found');
      prompt.append(' to read the letter?');
    });
    lookup.start();

    // The general link is idempotent per signer and letter version. Sharing
    // works with the canonical URL while it loads or if preparation fails.
    request('invitations', { method: 'POST', body: '{}' }).then(result => {
      if (panel.isConnected) {
        prepared = result.invitation;
        find('.invite-privacy').hidden = !prepared?.id;
      }
    }).catch(() => {
      if (panel.isConnected) find('.invite-privacy').hidden = true;
    });
    async function recordAction(invite, action) {
      if (!invite.id) return;
      try { await request('invitations/action', { method: 'POST', body: JSON.stringify({ id: invite.id, action }) }); }
      catch (_) { /* Bookkeeping cannot turn a successful share into an error. */ }
    }
    native.addEventListener('click', async () => {
      if (busy) return;
      const invite = invitation(); interacted = true; setBusy(true);
      // Preserve the click's user activation: call share before any await or
      // network request. Capture the URL so late preparation cannot misattribute it.
      try {
        await navigator.share({ title: letter.title, text: message, url: invite.url });
        status('Finish sending in the app you chose.'); recordAction(invite, 'share_menu');
      } catch (err) {
        if (err.name === 'AbortError') status('You can share the invitation when you’re ready.');
        else status('The share menu could not open. Copy the invitation and paste it into your conversation.', true);
      } finally { setBusy(false); }
    });
    copyButton.addEventListener('click', async () => {
      if (busy) return;
      const invite = invitation(), value = message + '\n\n' + invite.url;
      interacted = true; setBusy(true);
      try {
        await navigator.clipboard.writeText(value);
        panel.querySelector('.invite-copy-fallback')?.remove();
        status('Invitation copied. Paste it into your conversation.'); recordAction(invite, 'copied');
      } catch (_) {
        const fallback = document.createElement('textarea'); fallback.className = 'invite-copy-fallback'; fallback.readOnly = true;
        fallback.setAttribute('aria-label', 'Select and copy this invitation'); fallback.value = value;
        panel.querySelector('.invite-copy-fallback')?.remove(); find('[data-invite-status]').after(fallback);
        fallback.focus(); fallback.select();
        status('Your browser could not copy automatically. Select and copy the invitation below.', true);
      } finally { setBusy(false); }
    });
  }
})();
