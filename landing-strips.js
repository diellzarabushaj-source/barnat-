'use strict';

(() => {
  const STRIP_COUNT = 128;
  const ACTIVE_RADIUS = 10;

  function initClinicalRibbon() {
    const stripLayer = document.querySelector('.micro-strips');
    const artwork = stripLayer?.closest('.artwork');
    if (!stripLayer || !artwork || stripLayer.childElementCount) return;

    const fragment = document.createDocumentFragment();
    const strips = [];

    for (let index = 0; index < STRIP_COUNT; index += 1) {
      const strip = document.createElement('span');
      strip.className = 'micro-strip';
      strip.setAttribute('aria-hidden', 'true');
      strip.style.setProperty('--pos', `${(index / (STRIP_COUNT - 1)) * 100}%`);
      strip.style.setProperty('--delay', `${(index % 12) * 4}ms`);
      fragment.appendChild(strip);
      strips.push(strip);
    }

    stripLayer.appendChild(fragment);

    let activeIndexes = new Set();
    let pointerClientX = null;
    let frame = 0;
    let releaseTimer = 0;

    function clearStrip(strip) {
      strip.style.setProperty('--lift', '0px');
      strip.style.setProperty('--scale-x', '1');
      strip.style.setProperty('--scale-y', '1');
      strip.style.setProperty('--tilt', '0deg');
      strip.style.setProperty('--brightness', '1');
      strip.style.setProperty('--saturation', '1');
      strip.style.setProperty('--shadow-alpha', '0');
      strip.classList.remove('is-near-pointer');
    }

    function resetActive() {
      activeIndexes.forEach(index => clearStrip(strips[index]));
      activeIndexes = new Set();
    }

    function renderPointerEffect(extraStrength = 0) {
      frame = 0;
      if (pointerClientX === null) return;

      const bounds = artwork.getBoundingClientRect();
      if (!bounds.width) return;

      const relativeX = Math.min(bounds.width, Math.max(0, pointerClientX - bounds.left));
      const centerIndex = Math.round((relativeX / bounds.width) * (STRIP_COUNT - 1));
      const nextActive = new Set();
      const mobileFactor = window.matchMedia('(max-width: 600px)').matches ? 0.68 : 1;

      for (let index = Math.max(0, centerIndex - ACTIVE_RADIUS); index <= Math.min(STRIP_COUNT - 1, centerIndex + ACTIVE_RADIUS); index += 1) {
        const distance = Math.abs(index - centerIndex);
        const intensity = Math.max(0, 1 - distance / (ACTIVE_RADIUS + 1));
        const strength = Math.min(1.25, intensity + extraStrength);
        const direction = index === centerIndex ? 0 : Math.sign(index - centerIndex);
        const strip = strips[index];

        strip.style.setProperty('--lift', `${(-4 - strength * 20) * mobileFactor}px`);
        strip.style.setProperty('--scale-x', `${1 + strength * 0.42}`);
        strip.style.setProperty('--scale-y', `${1 + strength * 0.055}`);
        strip.style.setProperty('--tilt', `${direction * strength * 2.2}deg`);
        strip.style.setProperty('--brightness', `${1 + strength * 0.2}`);
        strip.style.setProperty('--saturation', `${1 + strength * 0.25}`);
        strip.style.setProperty('--shadow-alpha', `${0.08 + strength * 0.28}`);
        strip.classList.add('is-near-pointer');
        nextActive.add(index);
      }

      activeIndexes.forEach(index => {
        if (!nextActive.has(index)) clearStrip(strips[index]);
      });
      activeIndexes = nextActive;
    }

    function schedulePointerEffect() {
      if (frame) return;
      frame = requestAnimationFrame(() => renderPointerEffect(0));
    }

    artwork.addEventListener('pointermove', event => {
      pointerClientX = event.clientX;
      schedulePointerEffect();
    }, { passive: true });

    artwork.addEventListener('pointerenter', event => {
      pointerClientX = event.clientX;
      schedulePointerEffect();
    }, { passive: true });

    artwork.addEventListener('pointerleave', () => {
      pointerClientX = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      window.clearTimeout(releaseTimer);
      resetActive();
    }, { passive: true });

    artwork.addEventListener('pointerdown', event => {
      pointerClientX = event.clientX;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      renderPointerEffect(0.28);
      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => renderPointerEffect(0), 260);
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initClinicalRibbon, { once: true });
  } else {
    initClinicalRibbon();
  }
})();
