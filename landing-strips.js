'use strict';

(() => {
  const STRIP_COUNT = 128;
  const ACTIVE_RADIUS = 10;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function ensureEkgStyles() {
    if (document.getElementById('medindexEkgStyles')) return;

    const style = document.createElement('style');
    style.id = 'medindexEkgStyles';
    style.textContent = `
      html[data-mi-page="login"] .ekg-overlay{
        position:absolute;
        z-index:5;
        top:50%;
        left:4%;
        width:92%;
        height:96px;
        pointer-events:none;
        overflow:visible;
        opacity:.68;
        transform:translateY(-50%);
        filter:drop-shadow(0 6px 14px rgba(30,78,183,.18));
        transition:opacity .4s ease,transform .55s cubic-bezier(.2,.8,.2,1),filter .4s ease;
      }
      html[data-mi-page="login"] .ekg-glow,
      html[data-mi-page="login"] .ekg-line{
        fill:none;
        vector-effect:non-scaling-stroke;
        stroke-linecap:round;
        stroke-linejoin:round;
      }
      html[data-mi-page="login"] .ekg-glow{
        stroke:rgba(116,180,255,.38);
        stroke-width:9;
        filter:blur(5px);
      }
      html[data-mi-page="login"] .ekg-line{
        stroke:rgba(255,255,255,.94);
        stroke-width:2.2;
        stroke-dasharray:11 8;
        animation:medindexEkgFlow 3.8s linear infinite;
      }
      html[data-mi-page="login"] .artwork-label{
        z-index:7!important;
      }
      @media(hover:hover) and (pointer:fine){
        html[data-mi-page="login"] .visual-login:hover .ekg-overlay{
          opacity:.94;
          transform:translateY(-50%) scaleY(1.08);
          filter:drop-shadow(0 10px 22px rgba(31,83,205,.28));
        }
      }
      @media(max-width:600px){
        html[data-mi-page="login"] .ekg-overlay{
          left:3%;
          width:94%;
          height:68px;
          opacity:.72;
        }
      }
      @media(prefers-reduced-motion:reduce){
        html[data-mi-page="login"] .ekg-line{animation:none!important}
        html[data-mi-page="login"] .ekg-overlay{transition:none!important}
      }
      @keyframes medindexEkgFlow{
        to{stroke-dashoffset:-38}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureEkgOverlay(artwork) {
    if (artwork.querySelector('.ekg-overlay')) return;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'ekg-overlay');
    svg.setAttribute('viewBox', '0 0 1000 180');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');

    const pathData = 'M0 92 L86 92 L118 76 L146 108 L178 92 L246 92 L278 52 L306 132 L334 18 L366 156 L398 92 L460 92 L488 70 L516 112 L546 92 L630 92 L658 64 L690 122 L720 92 L792 92 L822 78 L850 106 L882 92 L1000 92';

    const glow = document.createElementNS(SVG_NS, 'path');
    glow.setAttribute('class', 'ekg-glow');
    glow.setAttribute('d', pathData);

    const line = document.createElementNS(SVG_NS, 'path');
    line.setAttribute('class', 'ekg-line');
    line.setAttribute('d', pathData);

    svg.append(glow, line);
    artwork.appendChild(svg);
  }

  function initClinicalRibbon() {
    const stripLayer = document.querySelector('.micro-strips');
    const artwork = stripLayer?.closest('.artwork');
    if (!stripLayer || !artwork) return;

    ensureEkgStyles();
    ensureEkgOverlay(artwork);
    if (stripLayer.childElementCount) return;

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
