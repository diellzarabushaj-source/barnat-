(() => {
  'use strict';

  const form = document.getElementById('loginForm');
  const password = document.getElementById('password');
  const submit = document.getElementById('loginSubmit');
  const message = document.getElementById('loginMessage');
  const toggle = document.getElementById('togglePassword');
  let busy = false;

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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: value }),
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Hyrja dështoi.');
      setMessage('U verifikua. Po hapet MedIndex…', true);
      password.value = '';
      window.setTimeout(() => location.reload(), 180);
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

  window.addEventListener('pageshow', () => {
    setBusy(false);
    password.focus();
  });
})();
