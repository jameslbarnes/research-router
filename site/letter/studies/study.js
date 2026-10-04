(() => {
  const still = new URLSearchParams(location.search).has('still');
  if (still) document.body.classList.add('still');
  else {
    const script = document.createElement('script');
    script.src = '../research-film.js?v=a39adc59b8';
    document.body.appendChild(script);
  }
  const refs = [...document.querySelectorAll('[data-note]')];
  const notes = [...document.querySelectorAll('.annotation')];
  function choose(index, trigger) {
    refs.forEach(ref => ref.setAttribute('aria-pressed', String(Number(ref.dataset.note) === index)));
    notes.forEach((note, i) => note.hidden = i !== index);
    document.querySelector('.mobile-note')?.remove();
    if (matchMedia('(max-width:720px)').matches && trigger) {
      const inline = document.createElement('div');
      inline.className = 'mobile-note';
      inline.innerHTML = notes[index].innerHTML;
      inline.querySelector('.annotation-next')?.remove();
      const close = document.createElement('button');
      close.textContent = 'Close note';
      close.type = 'button';
      close.addEventListener('click', () => { inline.remove(); trigger.focus(); });
      inline.append(close);
      const paragraph = trigger.closest('p');
      (paragraph || trigger.closest('.more-context')).after(inline);
      inline.scrollIntoView({block:'nearest',behavior:'smooth'});
    }
  }
  refs.forEach(ref => ref.addEventListener('click', () => choose(Number(ref.dataset.note), ref)));
  document.querySelectorAll('.annotation-next').forEach(button => button.addEventListener('click', () => {
    const index = Number(button.dataset.next);
    choose(index);
    document.querySelector(`.note-ref[data-note="${index}"]`)?.scrollIntoView({block:'center',behavior:'smooth'});
  }));
  if (notes.length) choose(0);
})();
