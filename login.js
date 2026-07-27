(() => {
  'use strict';

  const RETURN_KEY = 'medindex_return_after_login';
  const OFFLINE_LEASE_KEY = 'medindex_offline_lease_v2';
  const MAX_OFFLINE_LEASE_MS = 8 * 60 * 60 * 1000;
  const form = document.getElementById('loginForm');
  const password = document.getElementById('password');
  const submit = document.getElementById('loginSubmit');
  const message = document.getElementById('loginMessage');
  const toggle = document.getElementById('togglePassword');
  const capsHint = document.getElementById('capsLockHint');
  let busy = false;
  let redirecting = false;
  let configurationBlocked = false;

  function connectionProfile() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const type = String(connection?.effectiveType || '');
    return {
      slow:/^(slow-2g|2g)$/i.test(type) || Number(connection?.downlink || 10) < 0.8 || Number(connection?.rtt || 0) > 900,
      saveData:Boolean(connection?.saveData),
    };
  }

  function safeReturnPath(value) {
    const path = String(value || '');
    if (!path.startsWith('/')
      || path.startsWith('//')
      || path.startsWith('/api/')
      || path.startsWith('/login')
      || path.startsWith('/recovery')) return '/index.html';
    return path;
  }

  function destination() {
    const queryReturn = new URLSearchParams(location.search).get('return');
    const stored = (() => { try { return sessionStorage.getItem(RETURN_KEY); } catch { return ''; } })();
    return safeReturnPath(queryReturn || stored || '/index.html');
  }

  function setMessage(text, success = false) {
    message.textContent = text || '';
    message.classList.toggle('success', success);
  }

  function setBusy(value) {
    busy = value;
    submit.disabled = value || configurationBlocked;
    password.disabled = value || configurationBlocked;
    toggle.disabled = value || configurationBlocked;
    submit.classList.toggle('is-loading', value);
    submit.querySelector('span:first-child').textContent = value ? 'Duke verifikuar…' : 'Hyr';
    form.setAttribute('aria-busy', String(value));
  }

  function blockForConfiguration() {
    configurationBlocked = true;
    setBusy(false);
    setMessage('Hyrja private nuk është konfiguruar në server. Kontrollo SESSION_SECRET dhe ACCESS_CODE në Vercel.');
  }

  function saveBootstrapLease(payload = {}) {
    if (payload.hardened !== true) return;
    const duration = Math.min(MAX_OFFLINE_LEASE_MS, Math.max(60 * 60 * 1000, Number(payload.expiresIn || 8 * 60 * 60) * 1000));
    const verifiedAt = Date.now();
    try {
      localStorage.setItem(OFFLINE_LEASE_KEY, JSON.stringify({
        version:2,
        hardened:true,
        bootstrap:true,
        verifiedAt,
        expiresAt:verifiedAt + duration,
      }));
    } catch {}
  }

  async function refreshWorkerInBackground() {
    try {
      if (!('serviceWorker' in navigator)) return;
      const registrations = await navigator.serviceWorker.getRegistrations();
      registrations.forEach(registration => registration.update().catch(() => null));
    } catch {}
  }

  async function purgeOnlyStaleRuntimeEntries() {
    try {
      if (!('caches' in window)) return;
      const names = await caches.keys();
      const targets = ['/offline-runtime.js', '/auth-client.js', '/tailadmin-shell.js'];
      await Promise.allSettled(names
        .filter(name => name.startsWith('medindex-static-'))
        .map(async name => {
          const cache = await caches.open(name);
          await Promise.allSettled(targets.map(target => cache.delete(target, { ignoreSearch:true })));
        }));
    } catch {}
  }

  async function timedFetch(url, options = {}, normalTimeoutMs = 16000, slowTimeoutMs = 42000) {
    const profile = connectionProfile();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), profile.slow || profile.saveData ? slowTimeoutMs : normalTimeoutMs);
    try { return await fetch(url, { ...options, signal:controller.signal }); }
    finally { clearTimeout(timeout); }
  }

  function updateCapsLock(event) {
    const active = Boolean(event?.getModifierState?.('CapsLock'));
    capsHint.hidden = !active;
  }

  ['keydown', 'keyup'].forEach(type => password.addEventListener(type, updateCapsLock));
  password.addEventListener('blur', () => { capsHint.hidden = true; });

  toggle.addEventListener('click', () => {
    const visible = password.type === 'text';
    password.type = visible ? 'password' : 'text';
    toggle.textContent = visible ? 'Shfaq' : 'Fshih';
    toggle.setAttribute('aria-pressed', String(!visible));
    toggle.setAttribute('aria-label', visible ? 'Shfaq password-in' : 'Fshih password-in');
    password.focus();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || configurationBlocked) return;
    const value = password.value;
    if (value.length < 6) {
      setMessage('Shkruaje password-in e plotë.');
      password.focus();
      return;
    }

    setBusy(true);
    setMessage(connectionProfile().slow ? 'Lidhja është e dobët; verifikimi mund të zgjasë pak…' : '');
    try {
      const response = await timedFetch('/api/auth', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Accept:'application/json' },
        body:JSON.stringify({ password:value }),
        cache:'no-store',
        credentials:'same-origin',
      }, 20000, 45000);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 503 && payload.code === 'AUTH_NOT_CONFIGURED') {
          blockForConfiguration();
          return;
        }
        const retryAfter = Number(response.headers.get('retry-after') || 0);
        const suffix = response.status === 429 && retryAfter ? ` Provo pas rreth ${Math.ceil(retryAfter / 60)} minutash.` : '';
        throw new Error((payload.error || 'Hyrja dështoi.') + suffix);
      }
      saveBootstrapLease(payload);
      redirecting = true;
      setMessage('U verifikua. Po hapet MedIndex…', true);
      password.value = '';
      try { sessionStorage.removeItem(RETURN_KEY); } catch {}
      await Promise.race([
        purgeOnlyStaleRuntimeEntries(),
        new Promise(resolve => setTimeout(resolve, 1200)),
      ]);
      location.replace(destination());
    } catch (error) {
      if (configurationBlocked) return;
      const text = error?.name === 'AbortError'
        ? 'Lidhja është shumë e ngadalshme. Password-i nuk u refuzua; provo përsëri kur sinjali të jetë pak më i mirë.'
        : error.message || 'Hyrja dështoi.';
      setMessage(text);
      password.select();
    } finally {
      if (!redirecting && !configurationBlocked) setBusy(false);
    }
  });

  async function checkExistingSession() {
    try {
      const response = await timedFetch('/api/auth', { cache:'no-store', credentials:'same-origin' }, 10000, 24000);
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.authenticated) {
        redirecting = true;
        location.replace(destination());
        return;
      }
      if (response.ok && (payload.hardened === false || payload.accessConfigured === false || payload.sessionConfigured === false)) blockForConfiguration();
    } catch {}
  }

  function init() {
    setBusy(false);
    password.focus();
    refreshWorkerInBackground();
    checkExistingSession();
  }

  window.addEventListener('pageshow', () => { if (!busy && !configurationBlocked) password.focus(); });
  init();
})();
