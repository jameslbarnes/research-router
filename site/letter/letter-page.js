/* Expand the existing signatory list without duplicating or changing it. */
(() => {
  const section = document.querySelector('#signatures');
  const toggle = document.querySelector('#roll-toggle');
  const roll = document.querySelector('#roll');
  if (!section || !toggle || !roll) return;
  toggle.hidden = false;
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(expanded));
    section.classList.toggle('is-expanded', expanded);
    toggle.firstChild.textContent = expanded ? 'Collapse signatories ' : 'Expand signatories ';
    toggle.querySelector('span').textContent = expanded ? '↙' : '↗';
    if (expanded) roll.scrollLeft = 0;
  });
})();
