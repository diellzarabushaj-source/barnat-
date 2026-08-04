(() => {
  'use strict';
  try {
    const saved = localStorage.getItem('regjistriBarnave_theme_v1');
    document.documentElement.dataset.theme = saved === 'dark' ? 'dark' : 'light';
  } catch {
    document.documentElement.dataset.theme = 'light';
  }

  if (document.documentElement.dataset.miPage === 'login') {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/landing-effects.css?v=20260804-1';
    link.dataset.miLandingEffects = 'true';
    document.head.appendChild(link);

    const soundUiOverride = document.createElement('style');
    soundUiOverride.textContent = 'html[data-mi-page="login"] .ecg-sound-hint{display:none!important}';
    soundUiOverride.dataset.miEcgSoundUi = 'hidden';
    document.head.appendChild(soundUiOverride);

    const soundScript = document.createElement('script');
    soundScript.src = '/ecg-sound.js?v=20260804-2';
    soundScript.async = true;
    soundScript.dataset.miEcgSound = 'true';
    document.head.appendChild(soundScript);
  }
})();
