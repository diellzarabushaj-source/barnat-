(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);

  // Regimens and product strengths are owned by their versioned data files.
  // The application shell must never overwrite clinical source data.

  async function authJson(url = '/api/auth', options = {}, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        credentials:'same-origin',
        cache:'no-store',
        ...options,
        signal:controller.signal,
        headers:{ Accept:'application/json', ...(options.headers || {}) },
      });
      const payload = await response.json().catch(() => ({}));
      return { response, payload };
    } finally {
      clearTimeout(timer);
    }
  }

  function redirectToLogin() {
    const target = new URL('/landing.html', location.origin);
    target.searchParams.set('return', location.pathname + location.search + location.hash);
    location.replace(target.pathname + target.search);
  }

  async function ensureAuth() {
    const { response, payload } = await authJson();
    if (response.status === 401 || response.status === 403 || (response.ok && payload.authenticated === false)) {
      redirectToLogin();
      throw new Error('Sesioni nuk është aktiv.');
    }
    if (!response.ok || payload.authenticated !== true) throw new Error('Sesioni nuk mund të verifikohet.');
    return payload;
  }

  function loadRuntime(src, marker) {
    const existing = document.querySelector(`script[${marker}]`);
    if (existing) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.setAttribute(marker, '1');
      script.addEventListener('load', resolve, { once:true });
      script.addEventListener('error', reject, { once:true });
      document.head.appendChild(script);
    });
  }

  function loadStylesheet(href, marker) {
    const existing = document.querySelector(`link[${marker}]`);
    if (existing) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.setAttribute(marker, '1');
      link.addEventListener('load', resolve, { once:true });
      link.addEventListener('error', reject, { once:true });
      document.head.appendChild(link);
    });
  }

  async function syncProfile(payload) {
    await loadRuntime('/medindex-brand-runtime.js?v=drx-brand-v7', 'data-drx-profile-runtime').catch(() => null);
    window.MedIndexProfile?.adoptAccount?.(payload);
    window.dispatchEvent(new CustomEvent('medindex:auth-ready', { detail:payload }));
  }

  async function loadAntibioticFormulations() {
    await Promise.all([
      loadStylesheet('/antibiotiket-formulations.css?v=antibiotiket-formulations-20261027', 'data-drx-abx-formulations-css'),
      loadRuntime('/antibiotiket-formulations-data.js?v=antibiotiket-formulations-20261027', 'data-drx-abx-formulations-data'),
    ]);
    window.DRX_ANTIBIOTIC_MARKET={selection:()=>null};
    await loadStylesheet('/antibiotiket-market.css?v=20261028d','data-drx-abx-market-css');
    await loadRuntime('/antibiotiket-market-math.js?v=20261028b','data-drx-abx-market-math');
    await loadRuntime('/antibiotiket-market.js?v=penicillins-20261029','data-drx-abx-market');
    await loadRuntime('/antibiotiket-formulations.js?v=antibiotiket-formulations-20261027', 'data-drx-abx-formulations-runtime');
  }

  async function loadAntibioticPrescription() {
    await Promise.all([
      loadStylesheet('/antibiotiket-prescription.css?v=antibiotiket-phase4-v4', 'data-drx-abx-prescription-css'),
      loadRuntime('/antibiotiket-solids-data.js?v=antibiotiket-phase4-v2', 'data-drx-abx-solids-data'),
    ]);
    await loadRuntime('/antibiotiket-prescription.js?v=penicillins-20261029', 'data-drx-abx-prescription-runtime');
  }

  async function loadAntibioticHospital() {
    await Promise.all([
      loadStylesheet('/antibiotiket-hospital.css?v=antibiotiket-phase5-v1', 'data-drx-abx-hospital-css'),
      loadRuntime('/antibiotiket-hospital-data.js?v=antibiotiket-phase5-v1', 'data-drx-abx-hospital-data'),
    ]);
    await loadRuntime('/antibiotiket-hospital.js?v=penicillins-20261029', 'data-drx-abx-hospital-runtime');
  }

  async function loadAntibioticParenteralPreparation() {
    await Promise.all([
      loadStylesheet('/antibiotiket-parenteral-prep.css?v=antibiotiket-phase6-v2', 'data-drx-abx-prep-css'),
      loadRuntime('/antibiotiket-parenteral-prep-data.js?v=antibiotiket-phase6-v2', 'data-drx-abx-prep-data'),
    ]);
    await loadRuntime('/antibiotiket-parenteral-bridge.js?v=antibiotiket-phase6-v2', 'data-drx-abx-prep-bridge');
    await loadRuntime('/antibiotiket-parenteral-prep.js?v=penicillins-20261029', 'data-drx-abx-prep-runtime');
  }

  function openSidebar() {
    $('#sidebar')?.classList.add('is-open');
    const backdrop = $('#sidebarBackdrop');
    if (backdrop) backdrop.hidden = false;
  }

  function closeSidebar() {
    $('#sidebar')?.classList.remove('is-open');
    const backdrop = $('#sidebarBackdrop');
    if (backdrop) backdrop.hidden = true;
  }

  async function logout() {
    const button = $('#logoutButton');
    if (button) button.disabled = true;
    try {
      const { response } = await authJson('/api/auth', { method:'DELETE' });
      if (!response.ok) throw new Error('Dalja nuk u krye.');
      location.replace('/landing.html');
    } catch {
      if (button) button.disabled = false;
    }
  }

  function bindShell() {
    $('#menuButton')?.addEventListener('click', openSidebar);
    $('#sidebarClose')?.addEventListener('click', closeSidebar);
    $('#sidebarBackdrop')?.addEventListener('click', closeSidebar);
    $('#logoutButton')?.addEventListener('click', logout);
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeSidebar();
    });
  }

  async function boot() {
    bindShell();
    try {
      const auth = await ensureAuth();
      await syncProfile(auth);
      if(document.documentElement.dataset.penicillinProtocols==='required'&&!window.DRX_PENICILLIN_PROTOCOLS)return;
      await loadAntibioticFormulations().catch(() => null);
      await loadAntibioticPrescription().catch(() => null);
      await loadAntibioticHospital().catch(() => null);
      await loadAntibioticParenteralPreparation().catch(() => null);
      document.documentElement.dataset.theme = 'light';
      if ($('#allergyLabel')) $('#allergyLabel').textContent = 'Alergjia ndaj beta-laktameve';
      if ($('#sourceStatus')) $('#sourceStatus').textContent = 'Antibiotikët · AKKPM · skema sipas indikacionit dhe rrugës';
    } catch {
      return;
    } finally {
      $('#appShell')?.setAttribute('aria-busy', 'false');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else void boot();
})();
