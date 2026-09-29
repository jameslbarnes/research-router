(() => {
  'use strict';
  const compact = matchMedia('(max-width:1000px)');
  const contents = document.querySelector('.contents');
  const setContents = () => { if (contents) contents.open = !compact.matches; };
  setContents();
  compact.addEventListener('change', setContents);

  const links = [...document.querySelectorAll('.toc a[href^="#"], .jump a[href^="#"]')];
  const sections = links.map(link => document.getElementById(link.hash.slice(1)));
  let pending = false;
  function markCurrent() {
    pending = false;
    let current = 0;
    sections.forEach((section, index) => {
      if (section && section.getBoundingClientRect().top <= innerHeight * .3) current = index;
    });
    links.forEach((link, index) => {
      if (index === current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  function schedule() {
    if (!pending) { pending = true; requestAnimationFrame(markCurrent); }
  }
  window.addEventListener('scroll', schedule, { passive:true });
  window.addEventListener('resize', markCurrent);
  window.addEventListener('hashchange', markCurrent);
  window.addEventListener('load', markCurrent);
  document.fonts?.ready.then(schedule);
  markCurrent();

  document.querySelectorAll('.tablebox').forEach((box, index) => {
    box.setAttribute('role', 'region');
    const heading = box.closest('.prov')?.querySelector('h2')?.textContent;
    box.setAttribute('aria-label', heading ? `${heading} plan comparison` : `Table ${index + 1}`);
    const hint = document.createElement('p');
    hint.className = 'table-scroll-hint';
    hint.id = `table-scroll-hint-${index + 1}`;
    hint.textContent = 'Scroll across to see all columns.';
    hint.hidden = true;
    box.before(hint);
    const size = () => {
      const overflow = box.scrollWidth > box.clientWidth + 1;
      hint.hidden = !overflow;
      box.tabIndex = overflow ? 0 : -1;
      if (overflow) box.setAttribute('aria-describedby', hint.id);
      else box.removeAttribute('aria-describedby');
    };
    if ('ResizeObserver' in window) new ResizeObserver(size).observe(box);
    else window.addEventListener('resize', size);
    document.fonts?.ready.then(size);
    size();
  });
})();
