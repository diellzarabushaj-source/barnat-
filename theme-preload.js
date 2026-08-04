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
  }
})();
