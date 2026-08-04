'use strict';

(() => {
  const STRIP_COUNT = 128;
  const ACTIVE_RADIUS = 10;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function buildBeatPath(startX, baseline = 100) {
    return [
      `M${startX} ${baseline}`,
      `L${startX + 30} ${baseline}`,
      `C${startX + 38} ${baseline} ${startX + 42} ${baseline - 12} ${startX + 52} ${baseline - 12}`,
      `C${startX + 62} ${baseline - 12} ${startX + 66} ${baseline} ${startX + 78} ${baseline}`,
      `L${startX + 104} ${baseline}`,
      `L${startX + 112} ${baseline + 5}`,
      `L${startX + 120} ${baseline - 56}`,
      `L${startX + 130} ${baseline + 50}`,
      `L${startX + 143} ${baseline - 16}`,
      `L${startX + 156} ${baseline}`,
      `L${startX + 185} ${baseline}`,
      `C${startX + 197} ${baseline} ${startX + 201} ${baseline - 20} ${startX + 219} ${baseline - 20}`,
      `C${startX + 239} ${baseline - 20} ${startX + 247} ${baseline} ${startX + 268} ${baseline}`,
      `L${startX + 300} ${baseline}`,
    ].join(' ');
  }

  function ensureClinicalPulseStyles() {
    if (document.getElementById('medindexClinicalPulseStyles')) return;

    const style = document.createElement('style');
    style.id = 'medindexClinicalPulseStyles';
    style.textContent = `
      html[data-mi-page="login"] .clinical-pulse{
        position:absolute;
        z-index:5;
        top:50%;
        left:7.5%;
        width:88.5%;
        height:118px;
        pointer-events:none;
        overflow:hidden;
        opacity:.82;
        transform:translateY(-50%);
        filter:drop-shadow(0 7px 18px rgba(27,76,184,.18));
        -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 4%,#000 95%,transparent 100%);
        mask-image:linear-gradient(90deg,transparent 0,#000 4%,#000 95%,transparent 100%);
        transition:opacity .38s ease,transform .55s cubic-bezier(.2,.8,.2,1),filter .38s ease;
      }
      html[data-mi-page="login"] .ekg-track{
        transform-box:view-box;
        transform-origin:0 50%;
        will-change:transform;
        animation:medindexEkgStrip 3.2s linear infinite;
      }
      html[data-mi-page="login"] .ekg-glow,
      html[data-mi-page="login"] .ekg-line{
        fill:none;
        vector-effect:non-scaling-stroke;
        stroke-linecap:round;
        stroke-linejoin:round;
      }
      html[data-mi-page="login"] .ekg-glow{
        stroke:rgba(68,134,255,.42);
        stroke-width:10;
        filter:blur(5px);
      }
      html[data-mi-page="login"] .ekg-line{
        stroke:rgba(255,255,255,.97);
        stroke-width:2.45;
      }
      html[data-mi-page="login"] .ekg-sweep{
        position:absolute;
        z-index:6;
        top:22%;
        bottom:22%;
        left:8%;
        width:2px;
        pointer-events:none;
        opacity:.52;
        background:linear-gradient(180deg,transparent,rgba(255,255,255,.92),transparent);
        box-shadow:0 0 10px rgba(255,255,255,.78),0 0 25px rgba(52,118,247,.56);
        animation:medindexEkgSweep 3.2s linear infinite;
      }
      html[data-mi-page="login"] .heart-beacon{
        position:absolute;
        z-index:7;
        top:50%;
        left:2.2%;
        display:grid;
        width:58px;
        height:58px;
        place-items:center;
        pointer-events:none;
        border:1px solid rgba(255,255,255,.62);
        border-radius:18px;
        background:linear-gradient(145deg,rgba(255,255,255,.3),rgba(112,159,255,.18));
        box-shadow:0 14px 34px rgba(35,74,164,.22),inset 0 1px 0 rgba(255,255,255,.78);
        transform:translateY(-50%);
        backdrop-filter:blur(12px);
        -webkit-backdrop-filter:blur(12px);
        transition:transform .45s cubic-bezier(.2,.8,.2,1),box-shadow .35s ease,background .35s ease;
      }
      html[data-mi-page="login"] .heart-beacon::after{
        content:"";
        position:absolute;
        inset:8px;
        border:1px solid rgba(255,255,255,.24);
        border-radius:13px;
      }
      html[data-mi-page="login"] .heart-icon{
        width:29px;
        height:29px;
        overflow:visible;
        filter:drop-shadow(0 5px 12px rgba(24,78,199,.3));
        animation:medindexHeartBeat .8s cubic-bezier(.2,.7,.25,1) infinite;
      }
      html[data-mi-page="login"] .heart-icon path{
        fill:rgba(35,108,238,.92);
        stroke:rgba(255,255,255,.96);
        stroke-width:1.8;
        vector-effect:non-scaling-stroke;
      }
      html[data-mi-page="login"] .heart-pulse-ring{
        position:absolute;
        inset:12px;
        border:1px solid rgba(255,255,255,.7);
        border-radius:50%;
        opacity:0;
        animation:medindexHeartRing .8s ease-out infinite;
      }
      html[data-mi-page="login"] .artwork-label{
        z-index:8!important;
      }
      @media(hover:hover) and (pointer:fine){
        html[data-mi-page="login"] .visual-login:hover .clinical-pulse{
          opacity:1;
          transform:translateY(-50%) scaleY(1.035);
          filter:drop-shadow(0 11px 26px rgba(26,81,205,.3));
        }
        html[data-mi-page="login"] .visual-login:hover .heart-beacon{
          background:linear-gradient(145deg,rgba(255,255,255,.4),rgba(94,147,255,.27));
          box-shadow:0 18px 44px rgba(35,74,164,.3),inset 0 1px 0 rgba(255,255,255,.88);
          transform:translateY(-50%) scale(1.06) rotate(-2deg);
        }
      }
      @media(max-width:600px){
        html[data-mi-page="login"] .clinical-pulse{
          left:12%;
          width:84%;
          height:74px;
          opacity:.88;
        }
        html[data-mi-page="login"] .ekg-sweep{
          left:12%;
        }
        html[data-mi-page="login"] .heart-beacon{
          left:2.5%;
          width:42px;
          height:42px;
          border-radius:13px;
        }
        html[data-mi-page="login"] .heart-beacon::after{
          inset:6px;
          border-radius:9px;
        }
        html[data-mi-page="login"] .heart-icon{
          width:22px;
          height:22px;
        }
        html[data-mi-page="login"] .heart-pulse-ring{
          inset:8px;
        }
      }
      @media(prefers-reduced-motion:reduce){
        html[data-mi-page="login"] .ekg-track,
        html[data-mi-page="login"] .ekg-sweep,
        html[data-mi-page="login"] .heart-icon,
        html[data-mi-page="login"] .heart-pulse-ring{
          animation:none!important;
        }
        html[data-mi-page="login"] .clinical-pulse,
        html[data-mi-page="login"] .heart-beacon{
          transition:none!important;
        }
      }
      @keyframes medindexEkgStrip{
        to{transform:translateX(-1200px)}
      }
      @keyframes medindexEkgSweep{
        from{transform:translateX(0);opacity:0}
        8%{opacity:.72}
        92%{opacity:.72}
        to{transform:translateX(80vw);opacity:0}
      }
      @keyframes medindexHeartBeat{
        0%,100%{transform:scale(1)}
        12%{transform:scale(1.17)}
        24%{transform:scale(1.02)}
        34%{transform:scale(1.1)}
        46%,86%{transform:scale(1)}
      }
      @keyframes medindexHeartRing{
        0%,8%{opacity:0;transform:scale(.72)}
        16%{opacity:.64}
        48%,100%{opacity:0;transform:scale(1.55)}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureClinicalPulse(artwork) {
    if (artwork.querySelector('.clinical-pulse')) return;

    const heart = document.createElement('span');
    heart.className = 'heart-beacon';
    heart.setAttribute('aria-hidden', 'true');
    const heartRing = document.createElement('span');
    heartRing.className = 'heart-pulse-ring';

    const heartSvg = document.createElementNS(SVG_NS, 'svg');
    heartSvg.setAttribute('class', 'heart-icon');
    heartSvg.setAttribute('viewBox', '0 0 32 29');
    heartSvg.setAttribute('focusable', 'false');
    heartSvg.setAttribute('aria-hidden', 'true');

    const heartPath = document.createElementNS(SVG_NS, 'path');
    heartPath.setAttribute('d', 'M16 27.2 3.1 15.1C-2.7 9.7.8.2 8.8.2c3.1 0 5.8 1.7 7.2 4.2C17.4 1.9 20.1.2 23.2.2c8 0 11.5 9.5 5.7 14.9L16 27.2Z');
    heartSvg.appendChild(heartPath);
    heart.append(heartRing, heartSvg);

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'clinical-pulse');
    svg.setAttribute('viewBox', '0 0 1200 200');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');

    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'ekg-track');

    const pathData = Array.from({ length: 8 }, (_, index) => buildBeatPath(index * 300)).join(' ');

    const glow = document.createElementNS(SVG_NS, 'path');
    glow.setAttribute('class', 'ekg-glow');
    glow.setAttribute('d', pathData);

    const line = document.createElementNS(SVG_NS, 'path');
    line.setAttribute('class', 'ekg-line');
    line.setAttribute('d', pathData);

    group.append(glow, line);
    svg.appendChild(group);

    const sweep = document.createElement('span');
    sweep.className = 'ekg-sweep';
    sweep.setAttribute('aria-hidden', 'true');

    artwork.append(heart, svg, sweep);
  }

  function initClinicalRibbon() {
    const stripLayer = document.querySelector('.micro-strips');
    const artwork = stripLayer?.closest('.artwork');
    if (!stripLayer || !artwork) return;

    ensureClinicalPulseStyles();
    ensureClinicalPulse(artwork);
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
