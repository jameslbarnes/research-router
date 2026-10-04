/* Spatial threads. Decorative motion, independent of the letter's argument.
 * Seek coalescing adapted from scroll-world.
 * Copyright (c) 2026 cyw. MIT licence in SCROLL_WORLD_LICENSE.txt.
 */
(() => {
  'use strict';
  const stage = document.querySelector('.research-stage');
  const story = document.querySelector('#ideas');
  const control = document.querySelector('#motion-toggle');
  if (!stage || !story || !control) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const portrait = matchMedia('(max-aspect-ratio: 1/1)');
  const coarse = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const steps = [...story.querySelectorAll('.story-step')];
  const links = [...story.querySelectorAll('[data-chapter]')];
  const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
  const assetRoot = new URL('assets/spatial-threads/', document.currentScript.src);
  let clips = {}, generation = 0, userPaused = false;
  let width = innerWidth, height = innerHeight, anchors = [];
  let openingEnd = 1, journeyEnd = 2, storyEnd = 3;
  let progress = 0, visible = true, aspect = '';
  const openingShare = .06;

  function measure() {
    width = innerWidth;
    height = innerHeight;
    const top = story.getBoundingClientRect().top + scrollY;
    anchors = steps.map(step => step.getBoundingClientRect().top + scrollY);
    // Begin the camera journey with the first scroll through the letter.
    // Keep the opening view wide while the letter is on screen.
    const sheet = document.querySelector('.letter-sheet');
    const sheetBottom = sheet ? sheet.getBoundingClientRect().bottom + scrollY : top;
    openingEnd = Math.max(height * .5, sheetBottom - height * .25);
    journeyEnd = Math.max(openingEnd + height, anchors[anchors.length - 1] + height * .2);
    storyEnd = top + story.offsetHeight;
    document.documentElement.style.setProperty('--scrollbar', `${innerWidth - document.documentElement.clientWidth}px`);
    read();
  }

  function frameReady(clip) {
    if (clip.generation !== generation) return;
    clip.painted = true;
    clip.video.pause();
    read();
  }

  function load(kind) {
    if (clips[kind] || reduced.matches || document.hidden) return;
    const clip = clips[kind] = { kind, generation, ready: false,
      painted: false, target: 0, failed: false };
    const video = document.createElement('video');
    clip.video = video;
    video.className = `research-film research-film--${kind}`;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    video.tabIndex = -1;
    video.addEventListener('loadeddata', () => {
      if (clip.generation !== generation) return;
      clip.ready = true;
      // A decoded frame is enough for paused seeking. Waiting for play()
      // can keep Safari buffering even when the requested frame is ready.
      frameReady(clip);
    });
    video.addEventListener('seeked', () => {
      seek(clip);
    });
    video.addEventListener('error', () => {
      if (clip.generation !== generation) return;
      clip.failed = true;
      clip.painted = false;
      stage.dataset.videoError = kind;
      read();
    });
    // Let the browser request and decode small ranges immediately. Fetching
    // a Blob first left the poster static until the whole film downloaded.
    video.src = new URL(`${kind}-${aspect}.mp4?v=stream-1`, assetRoot).href;
    stage.appendChild(video);
    video.load();
  }

  function seek(clip) {
    if (!clip?.ready || !clip.painted || clip.failed || userPaused || reduced.matches || document.hidden || !visible) return;
    const video = clip.video;
    if (video.seeking || !Number.isFinite(video.duration)) return;
    // A fast scroll updates target while the current seek finishes. At most one
    // seek is in flight, and its completion picks up the latest target.
    const time = clamp(clip.target) * Math.max(0, video.duration - 1 / 24);
    if (Math.abs(video.currentTime - time) > (coarse ? .035 : .02)) {
      try { video.currentTime = time; } catch (_) { /* Poster remains available. */ }
    }
  }

  function read() {
    const y = scrollY;
    progress = y <= openingEnd
      ? openingShare * clamp(y / openingEnd)
      : openingShare + (1 - openingShare) * clamp((y - openingEnd) / (journeyEnd - openingEnd));
    const fade = clamp((storyEnd - y) / (height * .6));
    visible = fade > .001;
    stage.style.opacity = String(fade);
    control.hidden = reduced.matches || !visible;
    let active = 0;
    anchors.forEach((anchor, index) => { if (y + height * .4 >= anchor) active = index; });
    links.forEach((link, index) => {
      if (index === active) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
    if (reduced.matches) return;
    if (visible && !document.hidden) load('journey');
    const journey = clips.journey;
    const stopped = userPaused || document.hidden || !visible;
    if (journey?.video) {
      journey.video.pause();
      journey.video.style.opacity = journey.painted && !journey.failed ? '1' : '0';
      // A page position always maps to the same frame. Holding that position
      // holds the film, including at the very top of the page.
      journey.target = progress;
      if (!stopped) seek(journey);
    }
    stage.dataset.mode = stopped ? 'paused' : y > 0 ? 'scroll' : 'still';
    stage.dataset.progress = progress.toFixed(4);
  }

  function reset() {
    generation += 1;
    for (const clip of Object.values(clips)) {
      if (clip.video) {
        clip.video.pause();
        clip.video.removeAttribute('src');
        clip.video.load();
        clip.video.remove();
      }
    }
    clips = {};
    aspect = portrait.matches ? 'mobile' : 'desktop';
    stage.dataset.aspect = aspect;
    delete stage.dataset.videoError;
    measure();
  }
  control.hidden = reduced.matches;
  control.addEventListener('click', () => {
    userPaused = !userPaused;
    control.setAttribute('aria-pressed', String(userPaused));
    control.textContent = userPaused ? 'Resume motion' : 'Pause motion';
    read();
  });
  window.addEventListener('scroll', read, { passive: true });
  window.addEventListener('resize', () => {
    // URL bar changes on touch devices must not remap the scroll journey.
    if (coarse && innerWidth === width) return;
    if (aspect !== (portrait.matches ? 'mobile' : 'desktop')) reset();
    else measure();
  });
  window.addEventListener('orientationchange', () => requestAnimationFrame(reset));
  window.addEventListener('load', measure);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      Object.values(clips).forEach(clip => clip.video?.pause());
    }
    else {
      if (aspect !== (portrait.matches ? 'mobile' : 'desktop')) {
        reset();
        return;
      }
      read();
    }
  });
  window.addEventListener('pagehide', () => {
    Object.values(clips).forEach(clip => clip.video?.pause());
  });
  window.addEventListener('pageshow', read);
  reduced.addEventListener('change', reset);
  portrait.addEventListener('change', () => {
    if (aspect !== (portrait.matches ? 'mobile' : 'desktop')) reset();
  });
  document.fonts?.ready.then(measure);
  reset();
})();
