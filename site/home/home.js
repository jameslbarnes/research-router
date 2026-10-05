(() => {
  const video = document.querySelector('video');
  const error = document.querySelector('.video-error');
  const showError = () => { error.hidden = false; };
  video.addEventListener('error', showError);
  video.querySelector('source').addEventListener('error', showError);
  video.addEventListener('playing', () => { error.hidden = true; });

  // Keep a collaborator's invitation attached when a visitor enters at home.
  const referral = new URL(location.href).searchParams.get('via');
  if (/^[\w-]{22}$/.test(referral || '')) {
    const letter = document.querySelector('.primary-action');
    const destination = new URL(letter.href);
    destination.searchParams.set('via', referral);
    letter.href = destination.href;
  }
})();
