'use strict';

(() => {
  const SAMPLE_BASE64 = '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';
  const BEAT_INTERVAL_MS = 800;
  const FINE_POINTER = window.matchMedia('(hover:hover) and (pointer:fine)');
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  let context = null;
  let sampleBuffer = null;
  let decodePromise = null;
  let beatTimer = 0;
  let active = false;
  let unlocked = false;
  const liveSources = new Set();

  function base64ToArrayBuffer(value) {
    const binary = window.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes.buffer;
  }

  function ensureStyles() {
    if (document.getElementById('medindexEcgSoundStyles')) return;
    const style = document.createElement('style');
    style.id = 'medindexEcgSoundStyles';
    style.textContent = `
      html[data-mi-page="login"] .ecg-sound-hint{
        position:absolute;
        z-index:12;
        top:18px;
        right:18px;
        display:inline-flex;
        min-height:34px;
        align-items:center;
        gap:8px;
        padding:0 12px;
        border:1px solid rgba(255,255,255,.58);
        border-radius:999px;
        background:rgba(255,255,255,.17);
        color:rgba(255,255,255,.94);
        font-size:8px;
        font-weight:820;
        letter-spacing:.08em;
        text-transform:uppercase;
        box-shadow:0 10px 28px rgba(35,74,164,.14);
        backdrop-filter:blur(12px);
        -webkit-backdrop-filter:blur(12px);
        pointer-events:none;
        transition:transform .28s cubic-bezier(.2,.8,.2,1),background .28s ease,box-shadow .28s ease,opacity .28s ease;
      }
      html[data-mi-page="login"] .ecg-sound-hint svg{
        width:15px;
        height:15px;
        overflow:visible;
        fill:none;
        stroke:currentColor;
        stroke-width:1.8;
        stroke-linecap:round;
        stroke-linejoin:round;
      }
      html[data-mi-page="login"] .artwork.is-sound-active .ecg-sound-hint{
        background:rgba(27,94,222,.72);
        box-shadow:0 13px 34px rgba(29,83,201,.3),0 0 0 5px rgba(255,255,255,.09);
        transform:translateY(-2px) scale(1.025);
      }
      html[data-mi-page="login"] .artwork.is-sound-active .ecg-sound-hint svg{
        filter:drop-shadow(0 0 7px rgba(255,255,255,.6));
      }
      html[data-mi-page="login"] .artwork.is-sound-active .heart-beacon{
        box-shadow:0 20px 48px rgba(35,74,164,.34),0 0 0 8px rgba(255,255,255,.08),inset 0 1px 0 rgba(255,255,255,.9)!important;
      }
      @media(hover:hover) and (pointer:fine){
        html[data-mi-page="login"] .artwork:hover .ecg-sound-hint{
          background:rgba(255,255,255,.25);
          transform:translateY(-2px);
        }
        html[data-mi-page="login"] .artwork.is-sound-active:hover .ecg-sound-hint{
          background:rgba(27,94,222,.78);
        }
      }
      @media(max-width:600px){
        html[data-mi-page="login"] .ecg-sound-hint{
          top:12px;
          right:12px;
          min-height:29px;
          gap:6px;
          padding:0 9px;
          font-size:7px;
        }
        html[data-mi-page="login"] .ecg-sound-hint svg{width:13px;height:13px}
      }
      @media(prefers-reduced-motion:reduce){
        html[data-mi-page="login"] .ecg-sound-hint{transition:none!important}
      }
    `;
    document.head.appendChild(style);
  }

  function createHint(artwork) {
    let hint = artwork.querySelector('.ecg-sound-hint');
    if (hint) return hint;
    hint = document.createElement('span');
    hint.className = 'ecg-sound-hint';
    hint.setAttribute('aria-hidden', 'true');
    hint.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 9v6h4l5 4V5L9 9H5Z"/><path d="M17 9.5a4 4 0 0 1 0 5"/><path d="M19.5 7a7.5 7.5 0 0 1 0 10"/></svg><span>Preke për zë</span>';
    artwork.appendChild(hint);
    return hint;
  }

  async function ensureAudio(userGesture = false) {
    if (!AudioContextClass) return false;
    try {
      if (!context) context = new AudioContextClass({ latencyHint:'interactive' });
      const mayUnlock = userGesture || Boolean(navigator.userActivation?.hasBeenActive);
      if (context.state === 'suspended' && mayUnlock) await context.resume();
      if (context.state !== 'running') return false;
      if (!decodePromise) {
        decodePromise = context.decodeAudioData(base64ToArrayBuffer(SAMPLE_BASE64).slice(0));
      }
      sampleBuffer = sampleBuffer || await decodePromise;
      unlocked = true;
      return Boolean(sampleBuffer);
    } catch {
      return false;
    }
  }

  function playBeat() {
    if (!active || !context || context.state !== 'running' || !sampleBuffer) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = sampleBuffer;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.24, context.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.36);
    source.connect(gain);
    gain.connect(context.destination);
    source.addEventListener('ended', () => liveSources.delete(source), { once:true });
    liveSources.add(source);
    source.start();
  }

  function restartVisualBeat(artwork) {
    const animated = artwork.querySelectorAll('.heart-icon,.heart-pulse-ring,.ekg-track,.ekg-sweep');
    animated.forEach(element => { element.style.animationName = 'none'; });
    void artwork.offsetWidth;
    animated.forEach(element => { element.style.animationName = ''; });
  }

  function setHint(hint, value) {
    const label = hint.querySelector('span');
    if (label) label.textContent = value;
  }

  async function startSound(artwork, hint, userGesture = false) {
    if (active) return;
    const ready = await ensureAudio(userGesture);
    if (!ready) {
      setHint(hint, AudioContextClass ? 'Kliko për zë' : 'Zëri nuk mbështetet');
      artwork.classList.toggle('is-sound-locked', Boolean(AudioContextClass));
      return;
    }
    active = true;
    artwork.classList.remove('is-sound-locked');
    artwork.classList.add('is-sound-active');
    artwork.setAttribute('aria-pressed', 'true');
    setHint(hint, 'Zëri aktiv');
    restartVisualBeat(artwork);
    playBeat();
    window.clearInterval(beatTimer);
    beatTimer = window.setInterval(playBeat, BEAT_INTERVAL_MS);
  }

  function stopSound(artwork, hint) {
    if (!active) {
      if (unlocked) setHint(hint, FINE_POINTER.matches ? 'Kalo për zë' : 'Mbaje për zë');
      return;
    }
    active = false;
    artwork.classList.remove('is-sound-active');
    artwork.setAttribute('aria-pressed', 'false');
    window.clearInterval(beatTimer);
    beatTimer = 0;
    liveSources.forEach(source => {
      try { source.stop(); } catch {}
    });
    liveSources.clear();
    setHint(hint, FINE_POINTER.matches ? 'Kalo për zë' : 'Mbaje për zë');
  }

  function initEcgSound() {
    const artwork = document.querySelector('.artwork');
    if (!artwork) return;
    ensureStyles();
    const hint = createHint(artwork);
    artwork.tabIndex = 0;
    artwork.setAttribute('role', 'button');
    artwork.setAttribute('aria-label', 'EKG interaktive. Mbaje kursorin ose gishtin mbi panel për ta dëgjuar.');
    artwork.setAttribute('aria-pressed', 'false');

    artwork.addEventListener('pointerenter', () => {
      if (FINE_POINTER.matches) void startSound(artwork, hint, false);
    }, { passive:true });

    artwork.addEventListener('pointerleave', () => stopSound(artwork, hint), { passive:true });

    artwork.addEventListener('pointerdown', event => {
      void startSound(artwork, hint, true);
      if (!FINE_POINTER.matches && artwork.setPointerCapture) {
        try { artwork.setPointerCapture(event.pointerId); } catch {}
      }
    }, { passive:true });

    artwork.addEventListener('pointerup', () => {
      if (!FINE_POINTER.matches) stopSound(artwork, hint);
    }, { passive:true });

    artwork.addEventListener('pointercancel', () => stopSound(artwork, hint), { passive:true });

    artwork.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      void startSound(artwork, hint, true);
    });

    artwork.addEventListener('keyup', event => {
      if (event.key === 'Enter' || event.key === ' ') stopSound(artwork, hint);
    });

    artwork.addEventListener('blur', () => stopSound(artwork, hint));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopSound(artwork, hint);
    });
    window.addEventListener('blur', () => stopSound(artwork, hint));
    window.addEventListener('pagehide', () => stopSound(artwork, hint));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initEcgSound, { once:true });
  else initEcgSound();
})();
