(() => {
  'use strict';

  try {
    const saved = localStorage.getItem('regjistriBarnave_theme_v1');
    document.documentElement.dataset.theme = saved === 'dark' ? 'dark' : 'light';
  } catch {
    document.documentElement.dataset.theme = 'light';
  }

  if (document.documentElement.dataset.miPage !== 'login') return;

  const landingEffects = document.createElement('link');
  landingEffects.rel = 'stylesheet';
  landingEffects.href = '/landing-effects.css?v=20260805-2';
  landingEffects.dataset.miLandingEffects = 'true';
  document.head.appendChild(landingEffects);

  const soundUiOverride = document.createElement('style');
  soundUiOverride.textContent = 'html[data-mi-page="login"] .ecg-sound-hint{display:none!important}';
  soundUiOverride.dataset.miEcgSoundUi = 'hidden';
  document.head.appendChild(soundUiOverride);

  const soundScript = document.createElement('script');
  soundScript.src = '/ecg-sound.js?v=20260804-3';
  soundScript.async = true;
  soundScript.dataset.miEcgSound = 'true';
  document.head.appendChild(soundScript);

  function installSignatureLayer() {
    if (!document.querySelector('link[data-mi-signature-style]')) {
      const signature = document.createElement('link');
      signature.rel = 'stylesheet';
      signature.href = '/landing-signature.css?v=20260805-2';
      signature.dataset.miSignatureStyle = 'true';
      document.head.appendChild(signature);
    }

    document.documentElement.dataset.miSignature = '20260805';

    if (!window.matchMedia('(hover:hover) and (pointer:fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;

    const targets = document.querySelectorAll('.plan-block,.artwork,.login-card');
    targets.forEach(target => {
      let frame = 0;
      let nextX = 50;
      let nextY = 50;

      const render = () => {
        frame = 0;
        target.style.setProperty('--mx', `${nextX.toFixed(2)}%`);
        target.style.setProperty('--my', `${nextY.toFixed(2)}%`);
      };

      const schedule = event => {
        const bounds = target.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        nextX = Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100));
        nextY = Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100));
        if (!frame) frame = requestAnimationFrame(render);
      };

      const reset = () => {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        if (target.classList.contains('plan-block')) {
          target.style.setProperty('--mx', '72%');
          target.style.setProperty('--my', '12%');
        } else if (target.classList.contains('login-card')) {
          target.style.setProperty('--mx', '78%');
          target.style.setProperty('--my', '3%');
        } else {
          target.style.setProperty('--mx', '50%');
          target.style.setProperty('--my', '50%');
        }
      };

      target.addEventListener('pointermove', schedule, { passive: true });
      target.addEventListener('pointerleave', reset, { passive: true });
    });
  }

  const scheduleSignatureLayer = () => window.setTimeout(installSignatureLayer, 0);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleSignatureLayer, { once: true });
  } else {
    scheduleSignatureLayer();
  }
})();
