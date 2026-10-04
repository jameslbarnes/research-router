/* Local preview only. Uses public bibliographic data with a simulated session. */
(async () => {
  const root = document.querySelector('[data-signing]');
  try {
    const [profile, session] = await Promise.all(['/qa/profile.json', '/letter/api/session'].map(async url => {
      const response = await fetch(url); if (!response.ok) throw new Error('The preview could not load. Reload this page to try again.'); return response.json();
    }));
    document.querySelector('#sign-heading').textContent = profile.name;
    root.innerHTML = '<p class="sign-public-affiliation"></p><p class="sign-small">Local invitation preview using public research records. ORCID authentication and signing are simulated.</p>' +
      '<p class="sign-small"><a data-record target="_blank" rel="noopener noreferrer"></a> (unauthenticated)</p>' +
      '<p class="sign-small">Coauthor suggestions use Andrew’s broader DBLP bibliography. Citation counts come from OpenAlex.</p><div class="sign-share"></div>';
    root.querySelector('.sign-public-affiliation').textContent = profile.affiliation;
    const record = root.querySelector('[data-record]'); record.href = profile.url; record.textContent = profile.url;
    async function request(path, options = {}) {
      const headers = { Accept: 'application/json' };
      if (options.method === 'POST') Object.assign(headers, { 'Content-Type': 'application/json', 'X-Letter-Request': '1', 'X-CSRF-Token': session.csrf });
      const response = await fetch('/letter/api/' + path, { ...options, headers });
      const data = await response.json(); if (!response.ok) throw new Error(data.error); return data;
    }
    const panel = root.querySelector('.sign-share');
    window.LetterInvitations.mount(panel, { request, letter: session.letter });
    root.setAttribute('aria-busy', 'false');
    document.querySelector('#sign').scrollIntoView();
  } catch (error) { root.textContent = error.message; root.setAttribute('aria-busy', 'false'); }
})();
