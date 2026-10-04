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
    panel.innerHTML = '<h3>Invite your collaborators</h3>' +
      '<p>A personal invitation can help someone decide to join. Choose a collaborator, review your message, then share it in the app you use with them.</p>' +
      '<button type="button" class="invite-discover">Refresh suggestions</button>' +
      '<h4 class="invite-suggestions-heading" hidden>Suggested invitations</h4>' +
      '<p class="sign-small invite-discovery-note" role="status" aria-live="polite"></p>' +
      '<div class="invite-candidates"></div>' +
      '<form class="invite-manual"><div class="sign-field"><label for="invite-name">Invite someone by name</label>' +
      '<input id="invite-name" name="name" autocomplete="off" maxlength="160" required placeholder="Collaborator’s name"></div>' +
      '<button type="submit">Prepare invitation</button></form>' +
      '<div class="invite-composer" hidden><h4 data-invite-heading tabindex="-1">Your invitation</h4>' +
      '<div class="sign-field"><label for="invite-message">Your message</label><textarea id="invite-message" rows="6" maxlength="3000"></textarea></div>' +
      '<div class="sign-field"><label for="invite-link">Invitation link</label><input id="invite-link" readonly></div>' +
      '<div class="invite-actions"><button type="button" class="invite-native">Share invitation</button>' +
      '<button type="button" class="invite-copy">Copy invitation</button><button type="button" class="invite-copy-link">Copy link</button></div>' +
      '<p class="sign-small">On your phone, choose Messages or another app from the share menu. Choose the recipient and send it there.</p></div>' +
      '<p data-invite-status class="sign-status" role="status" aria-live="polite">Preparing your invitation link…</p>' +
      '<details class="invite-history" hidden><summary>Prepared invitations</summary><div></div></details>' +
      '<p class="sign-small invite-privacy">We keep your invitation links and the coauthor suggestions you load. A link can connect an invitation to a new signature. Your contacts and phone numbers stay in the app you use to send.</p>';
    const find = selector => panel.querySelector(selector);
    const composer = find('.invite-composer'), message = find('#invite-message'), link = find('#invite-link');
    const status = (text, error = false) => { const el = find('[data-invite-status]'); el.textContent = text; el.classList.toggle('error', error); };
    let selected = null, invitations = [], busy = false, chosenByUser = false;
    let keepOrder = false, shownNetwork = null, shownRevision = null;
    const rows = new Map();
    // Citation results must not move a card out from under a click or discard
    // an open paper list while someone is deciding whom to invite.
    for (const event of ['pointerdown', 'keydown', 'wheel']) find('.invite-candidates').addEventListener(event, () => { keepOrder = true; }, { passive: true });
    const drafts = new Map();
    const native = find('.invite-native'); native.hidden = typeof navigator.share !== 'function';
    if (native.hidden) composer.querySelector('.sign-small').textContent = 'Copy the invitation into the conversation you use with your collaborator.';

    function showInvitation(invitation, focus = false) {
      if (selected) drafts.set(selected.id, message.value);
      panel.querySelector('.invite-copy-fallback')?.remove();
      selected = invitation; composer.hidden = false;
      find('[data-invite-heading]').textContent = invitation.name ? 'Invite ' + invitation.name : 'Your invitation';
      message.value = drafts.get(invitation.id) ?? ((invitation.name ? 'Hi ' + invitation.name + ', ' : '') +
        'I’ve signed Bargaining For Our Minds, an open letter asking AI labs to negotiate with researchers over training on our future research conversations and agent sessions. Would you read it and consider signing?');
      link.value = invitation.url;
      if (focus) find('[data-invite-heading]').focus();
      status('Review the message before sharing.');
    }
    function showHistory() {
      const history = find('.invite-history'); history.hidden = invitations.length < 2;
      const list = history.querySelector('div'); list.textContent = '';
      invitations.forEach(invitation => {
        const button = document.createElement('button'); button.type = 'button';
        button.textContent = invitation.name || 'General invitation';
        button.addEventListener('click', () => {
          if (busy) return;
          chosenByUser = true;
          showInvitation(invitation, true);
        }); list.append(button);
      });
    }
    // Keep edits local. The server stores the link and recipient label, never the message.
    message.addEventListener('input', () => status('Your message is saved only on this page.'));
    async function prepare(data, focus = true) {
      if (busy) return;
      if (focus) chosenByUser = true;
      busy = true; status('Preparing the invitation…');
      panel.setAttribute('aria-busy', 'true');
      try {
        const result = await request('invitations', { method: 'POST', body: JSON.stringify(data) });
        if (!panel.isConnected) return;
        invitations = [result.invitation, ...invitations.filter(i => i.id !== result.invitation.id)];
        showInvitation(result.invitation, focus); showHistory();
      } catch (err) { status(err.message, true); }
      finally { busy = false; panel.removeAttribute('aria-busy'); }
    }
    function showNetwork(network) {
      const list = find('.invite-candidates'), note = find('.invite-discovery-note');
      if (network.revision !== shownRevision) {
        rows.clear(); list.textContent = ''; shownRevision = network.revision;
      }
      const count = network.candidates.length;
      find('.invite-suggestions-heading').hidden = !count;
      const ranked = network.citationLookup?.matchedCandidates > 0, loadingCitations = network.citationLookup?.status === 'pending';
      note.textContent = network.status === 'unavailable' ? 'Your public research record could not be loaded. Try again, or enter a collaborator’s name below.' :
        count ? (ranked && !keepOrder ? 'Ordered by shared papers and total citations in OpenAlex. ' : '') + 'Coauthors found across ' + network.scannedWorks + (network.scannedWorks === 1 ? ' publication' : ' publications') + (network.source?.name === 'DBLP' ? ' in DBLP.' : ' on your ORCID.') :
          'We couldn’t find coauthors in the public paper metadata available for your ORCID. You can enter a collaborator’s name below.';
      if (count && loadingCitations) note.append(' Loading citation counts. You can choose someone now.');
      else if (count && !ranked) note.append(' Citation counts are unavailable. Sorted by shared papers.');
      if (ranked && keepOrder) note.append(' Citation counts updated. Refresh suggestions to update their order.');
      if (ranked && network.citationLookup.matchedCandidates < count) note.append(' Where citation counts are unavailable, we use shared papers alone.');
      if (network.status === 'partial') note.append(' Some paper records could not be loaded.');
      if (network.limited) note.append(' This lookup includes only part of your publication record.');
      const ids = new Set(network.candidates.map(candidate => candidate.id));
      for (const [id, row] of rows) if (!ids.has(id)) { row.remove(); rows.delete(id); }
      const byId = new Map(network.candidates.map(candidate => [candidate.id, candidate]));
      const ordered = keepOrder ? [...rows.keys()].map(id => byId.get(id)).concat(network.candidates.filter(candidate => !rows.has(candidate.id))) : network.candidates;
      ordered.forEach(candidate => {
        let row = rows.get(candidate.id);
        if (!row) {
          row = makeCandidate(candidate); rows.set(candidate.id, row);
        }
        const citations = row.querySelector('.invite-citation-count'); citations.textContent = '';
        if (candidate.citations && Number.isSafeInteger(candidate.citations.count) && candidate.citations.count >= 0 && /^https:\/\/openalex\.org\/A\d+$/.test(candidate.citations.url)) {
          const source = document.createElement('a'); source.href = candidate.citations.url; source.target = '_blank'; source.rel = 'noopener noreferrer';
          source.textContent = candidate.citations.count.toLocaleString('en-US') + (candidate.citations.count === 1 ? ' citation' : ' citations') + ' · OpenAlex';
          source.title = 'Total citations across this author’s work indexed by OpenAlex.';
          citations.append(source);
        } else citations.textContent = loadingCitations && candidate.orcid ? 'Loading citation count…' : 'Citation count unavailable.';
        if (!keepOrder || !row.isConnected) list.append(row);
      });
      // Safari can anchor the scroller to a moved row during the first ranking.
      if (!keepOrder) list.scrollTop = 0;
    }
    function makeCandidate(candidate) {
        const row = document.createElement('article'); row.className = 'invite-candidate';
        const name = document.createElement('p'); name.className = 'invite-candidate-name'; name.textContent = candidate.name;
        const affiliation = document.createElement('p'); affiliation.className = 'sign-small'; affiliation.textContent = candidate.affiliation;
        const citations = document.createElement('p'); citations.className = 'sign-small invite-citation-count';
        const papers = document.createElement('details'); const summary = document.createElement('summary');
        summary.textContent = candidate.papers.length + (candidate.papers.length === 1 ? ' shared paper' : ' shared papers'); papers.append(summary);
        candidate.papers.forEach(paper => {
          const a = document.createElement('a'); a.textContent = paper.title;
          a.href = paper.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; papers.append(a);
        });
        const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Prepare invitation';
        button.setAttribute('aria-label', 'Prepare invitation for ' + candidate.name);
        button.addEventListener('click', () => prepare({ candidateId: candidate.id }));
        row.append(name); if (candidate.affiliation) row.append(affiliation); row.append(citations, papers, button); return row;
    }
    find('.invite-discover').addEventListener('click', () => { keepOrder = false; shownNetwork = null; lookup.start(true); });
    lookup.subscribe(({ network, loading, error }) => {
      if (!panel.isConnected) return;
      if (network && network !== shownNetwork) { showNetwork(network); shownNetwork = network; }
      const button = find('.invite-discover'); button.disabled = loading;
      button.textContent = loading ? 'Looking up coauthors…' : error ? 'Try lookup again' : 'Refresh suggestions';
      if (error) find('.invite-discovery-note').textContent = error;
      else if (!network && loading) find('.invite-discovery-note').textContent = 'Looking up your publications and coauthors…';
    });
    lookup.start();
    find('.invite-manual').addEventListener('submit', event => {
      event.preventDefault(); const name = find('#invite-name').value.trim();
      if (name) prepare({ name }); else status('Enter your collaborator’s name to prepare a personal invitation.', true);
    });
    async function recordAction(invitation, action) {
      try { await request('invitations/action', { method: 'POST', body: JSON.stringify({ id: invitation.id, action }) }); }
      catch (_) { /* A bookkeeping failure must not claim that sharing failed. */ }
    }
    native.addEventListener('click', async () => {
      if (!selected || busy) return;
      const invitation = selected;
      // Call share immediately in the click handler, before any network request,
      // to preserve the browser's required user activation.
      try {
        const sharing = navigator.share({ title: letter.title, text: message.value.trim(), url: invitation.url });
        busy = true; native.disabled = true;
        await sharing;
        status('Finish sending in the app you chose.'); recordAction(invitation, 'share_menu');
      } catch (err) {
        if (err.name === 'AbortError') status('You can share the invitation when you’re ready.');
        else status('The share menu could not open. Copy the invitation and paste it into your conversation.', true);
      } finally { busy = false; native.disabled = false; }
    });
    async function copy(includeMessage) {
      if (!selected || busy) return;
      const invitation = selected, value = includeMessage ? message.value.trim() + '\n\n' + invitation.url : invitation.url;
      try { await navigator.clipboard.writeText(value); panel.querySelector('.invite-copy-fallback')?.remove();
        status(includeMessage ? 'Invitation copied. Paste it into your conversation.' : 'Invitation link copied.'); recordAction(invitation, 'copied'); }
      catch (_) {
        // Leave a selectable, complete invitation when clipboard permission fails.
        const fallback = document.createElement('textarea'); fallback.className = 'invite-copy-fallback'; fallback.readOnly = true;
        fallback.setAttribute('aria-label', 'Select and copy this invitation'); fallback.value = value;
        panel.querySelector('.invite-copy-fallback')?.remove(); composer.append(fallback); fallback.focus(); fallback.select();
        status('Your browser could not copy automatically. Select and copy the text shown below.', true);
      }
    }
    find('.invite-copy').addEventListener('click', () => copy(true));
    find('.invite-copy-link').addEventListener('click', () => copy(false));
    (async () => {
      try {
        const result = await request('invitations'); if (!panel.isConnected) return;
        invitations = [...invitations, ...result.invitations.filter(i => !invitations.some(known => known.id === i.id))]; showHistory();
        if (chosenByUser) return;
        const general = invitations.find(i => !i.name);
        if (general) showInvitation(general); else await prepare({}, false);
      } catch (err) {
        if (chosenByUser) return;
        status(err.message, true);
        const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Prepare a sharing link';
        retry.addEventListener('click', () => { retry.remove(); prepare({}, false); }); panel.append(retry);
      }
    })();
  }
})();
