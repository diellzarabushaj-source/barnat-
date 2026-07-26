(() => {
  'use strict';
  try {
    const saved = localStorage.getItem('regjistriBarnave_theme_v1');
    document.documentElement.dataset.theme = saved === 'dark' ? 'dark' : 'light';
  } catch {
    document.documentElement.dataset.theme = 'light';
  }
})();
