(() => {
  'use strict';

  const MODULES = [
    ['emergency-readiness-v6.js?v=20260824-1', 'readiness'],
    ['emergency-learning-flow-v7.js?v=20260824-1', 'learning-flow'],
    ['emergency-review-controller-v17.js?v=20260824-1', 'review-controller'],
  ];

  function loadModule(src, name) {
    return new Promise(resolve => {
      const pathname = src.split('?')[0];
      const existing = [...document.scripts].find(script => {
        const value = script.getAttribute('src') || '';
        return value === pathname || value.startsWith(`${pathname}?`);
      });

      if (existing) {
        if (existing.dataset.ckPhysicianLoaded === '1') return resolve();
        existing.addEventListener('load', resolve, { once:true });
        existing.addEventListener('error', resolve, { once:true });
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.ckPhysicianModule = name;
      script.addEventListener('load', () => {
        script.dataset.ckPhysicianLoaded = '1';
        resolve();
      }, { once:true });
      script.addEventListener('error', () => {
        document.documentElement.dataset.ckPhysicianModuleError = name;
        resolve();
      }, { once:true });
      document.body.appendChild(script);
    });
  }

  async function boot() {
    if (['loading', 'ready'].includes(document.documentElement.dataset.ckPhysicianBootstrap || '')) return;
    document.documentElement.dataset.ckPhysicianBootstrap = 'loading';
    await Promise.all(MODULES.map(([src, name]) => loadModule(src, name)));
    document.documentElement.dataset.ckPhysicianBootstrap = 'ready';
    window.dispatchEvent(new CustomEvent('medindex:emergency-physician-ready', {
      detail:{ version:'18.0', modules:MODULES.map(([, name]) => name) },
    }));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
})();
