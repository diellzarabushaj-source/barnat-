(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);

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
      loadStylesheet('/antibiotiket-formulations.css?v=antibiotiket-formulations-v1', 'data-drx-abx-formulations-css'),
      loadRuntime('/antibiotiket-formulations-data.js?v=antibiotiket-formulations-v1', 'data-drx-abx-formulations-data'),
    ]);
    await loadRuntime('/antibiotiket-formulations.js?v=antibiotiket-formulations-v1', 'data-drx-abx-formulations-runtime');
  }

  async function loadAntibioticPrescription() {
    await Promise.all([
      loadStylesheet('/antibiotiket-prescription.css?v=antibiotiket-phase4-v1', 'data-drx-abx-prescription-css'),
      loadRuntime('/antibiotiket-solids-data.js?v=antibiotiket-phase4-v1', 'data-drx-abx-solids-data'),
    ]);
    await loadRuntime('/antibiotiket-prescription.js?v=antibiotiket-phase4-v1', 'data-drx-abx-prescription-runtime');
  }

  async function loadAntibioticHospital() {
    await Promise.all([
      loadStylesheet('/antibiotiket-hospital.css?v=antibiotiket-phase5-v1', 'data-drx-abx-hospital-css'),
      loadRuntime('/antibiotiket-hospital-data.js?v=antibiotiket-phase5-v1', 'data-drx-abx-hospital-data'),
    ]);
    await loadRuntime('/antibiotiket-hospital.js?v=antibiotiket-phase5-v1', 'data-drx-abx-hospital-runtime');
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
      await loadAntibioticFormulations().catch(() => null);
      await loadAntibioticPrescription().catch(() => null);
      await loadAntibioticHospital().catch(() => null);
      document.documentElement.dataset.theme = 'light';
      if ($('#allergyLabel')) $('#allergyLabel').textContent = 'Alergjia ndaj beta-laktameve';
      if ($('#sourceStatus')) $('#sourceStatus').textContent = 'Antibiotikët · CM / CDC / CPS / CHOP · PO + Hospital IV/IM';
    } catch {
      return;
    } finally {
      $('#appShell')?.setAttribute('aria-busy', 'false');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else void boot();
})();