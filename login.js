(() => {
  'use strict';

  const RETURN_KEY = 'medindex_return_after_login';
  const form = document.getElementById('loginForm');
  const password = document.getElementById('password');
  const submit = document.getElementById('loginSubmit');
  const message = document.getElementById('loginMessage');
  const toggle = document.getElementById('togglePassword');
  let busy = false;

  function safeReturnPath(value) {
    const path = String(value || '');
    if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/api/')) return '/index.html';
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
    submit.disabled = value;
    submit.classList.toggle('is-loading', value);
    submit.querySelector('span:first-child').textContent = value ? 'Duke verifikuar…' : 'Hyr';
    form.setAttribute('aria-busy', String(value));
  }

  async function timedFetch(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try { return await fetch(url, { ...options, signal: controller.signal }); }
    finally { clearTimeout(timeout); }
  }

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
    if (busy) return;
    const value = password.value;
    if (value.length < 6) {
      setMessage('Shkruaje password-in e plotë.');
      password.focus();
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      const response = await timedFetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ password: value }),
        cache: 'no-store',
        credentials: 'same-origin',
      }, 10000);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Hyrja dështoi.');
      setMessage('U verifikua. Po hapet MedIndex…', true);
      password.value = '';
      try { sessionStorage.removeItem(RETURN_KEY); } catch {}
      window.setTimeout(() => location.replace(destination()), 120);
    } catch (error) {
      const text = error?.name === 'AbortError'
        ? 'Serveri nuk u përgjigj me kohë. Provo përsëri.'
        : error.message || 'Hyrja dështoi.';
      setMessage(text);
      password.select();
    } finally {
      setBusy(false);
    }
  });

  async function init() {
    setBusy(true);
    try {
      const response = await timedFetch('/api/auth', { cache: 'no-store', credentials: 'same-origin' });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.authenticated) {
        location.replace(destination());
        return;
      }
    } catch {}
    setBusy(false);
    password.focus();
  }

  window.addEventListener('pageshow', () => {
    if (!busy) password.focus();
  });
  init();
})();
