(() => {
  'use strict';

  const AUTH_URL = '/api/auth';
  const RETURN_KEY = 'medindex_return_after_login';
  const publicPage = /(?:^|\/)login\.html$/i.test(location.pathname);

  function safeReturnPath(value) {
    const raw = String(value || '');
    if (!raw.startsWith('/') || raw.startsWith('//')) return '/index.html';
    if (/^\/api\//i.test(raw)) return '/index.html';
    return raw;
  }

  async function requestAuth(options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      return await fetch(AUTH_URL, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', ...(options.headers || {}) },
        ...options,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  function screen() { return document.getElementById('accessScreen'); }
  function form() { return document.getElementById('accessForm'); }
  function message() { return document.getElementById('accessMessage'); }

  function unlock() {
    document.body.classList.remove('auth-locked');
    document.body.classList.add('auth-ready');
    document.documentElement.classList.remove('auth-pending');
    const gate = screen();
    if (gate) gate.hidden = true;
    installLogout();
    window.dispatchEvent(new CustomEvent('medindex:authenticated'));
  }

  function lock(reason = '') {
    document.body.classList.add('auth-locked', 'auth-ready');
    document.documentElement.classList.remove('auth-pending');
    const gate = screen();
    if (!gate) {
      const here = safeReturnPath(location.pathname + location.search + location.hash);
      sessionStorage.setItem(RETURN_KEY, here);
      location.replace('/index.html?login=1');
      return;
    }
    gate.hidden = false;
    const input = document.getElementById('accessCode');
    const status = message();
    if (status) status.textContent = reason;
    requestAnimationFrame(() => input?.focus());
  }

  function installPasswordToggle() {
    const input = document.getElementById('accessCode');
    if (!input || document.getElementById('accessToggle')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'accessToggle';
    button.className = 'access-toggle';
    button.setAttribute('aria-label', 'Shfaq ose fsheh password-in');
    button.textContent = '◉';
    button.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(input.type === 'text'));
      input.focus();
    });
    input.parentElement?.appendChild(button);
  }

  function installSecurityNote() {
    const target = form();
    if (!target || target.querySelector('.access-security')) return;
    const note = document.createElement('p');
    note.className = 'access-security';
    note.textContent = 'Sesioni ruhet në cookie të sigurt HttpOnly dhe skadon pas 8 orësh. Pas pesë tentativave të pasakta hyrja bllokohet përkohësisht.';
    target.appendChild(note);
  }

  async function submitLogin(event) {
    event.preventDefault();
    const input = document.getElementById('accessCode');
    const submit = document.getElementById('accessSubmit');
    const status = message();
    const password = String(input?.value || '');
    if (!password) {
      if (status) status.textContent = 'Shkruaje password-in.';
      input?.focus();
      return;
    }

    if (submit) { submit.disabled = true; submit.textContent = 'Duke hyrë…'; }
    if (status) status.textContent = '';
    try {
      const response = await requestAuth({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Hyrja dështoi.');
      const fallback = sessionStorage.getItem(RETURN_KEY) || '/index.html';
      sessionStorage.removeItem(RETURN_KEY);
      location.replace(safeReturnPath(fallback));
    } catch (error) {
      if (status) status.textContent = error?.name === 'AbortError' ? 'Serveri nuk u përgjigj me kohë.' : (error.message || 'Hyrja dështoi.');
      if (input) { input.value = ''; input.focus(); }
    } finally {
      if (submit) { submit.disabled = false; submit.textContent = 'Hyr'; }
    }
  }

  function installLogout() {
    const host = document.querySelector('.theme-control, .atc-theme, .med-side-footer');
    if (!host || document.getElementById('medindexLogout')) return;
    const button = document.createElement('button');
    button.id = 'medindexLogout';
    button.type = 'button';
    button.className = 'medindex-logout';
    button.textContent = 'Dil';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await requestAuth({ method: 'DELETE' }); } catch {}
      location.replace('/index.html?login=1');
    });
    host.appendChild(button);
  }

  async function init() {
    if (publicPage) {
      document.body.classList.add('auth-ready');
      document.documentElement.classList.remove('auth-pending');
      return;
    }
    installPasswordToggle();
    installSecurityNote();
    form()?.addEventListener('submit', submitLogin);

    try {
      const response = await requestAuth();
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.authenticated) unlock();
      else lock(new URLSearchParams(location.search).has('login') ? 'Shkruaje password-in për të vazhduar.' : 'Sesioni nuk është aktiv.');
    } catch (error) {
      lock(error?.name === 'AbortError' ? 'Kontrolli i sesionit zgjati tepër. Provo përsëri.' : 'Nuk u verifikua sesioni.');
    }
  }

  window.MedIndexAuth = { requestAuth, lock, unlock };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
