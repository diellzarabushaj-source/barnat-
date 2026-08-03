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
  const fallback = document.getElementById('passwordFallback');
  const googleButton = document.getElementById('googleLoginButton');
  const googleStatus = document.getElementById('googleLoginStatus');
  const retryButton = document.getElementById('retryLoginConfig');
  let busy = false;
  let redirecting = false;
  let configurationBlocked = false;
  let csrfToken = '';
  let googleInitialized = false;
  let googleIdentity = null;
  let googleButtonWidth = 0;
  let googleResizeFrame = 0;
  let lastConfiguration = null;

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
    if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/api/') || path.startsWith('/login') || path.startsWith('/recovery')) return '/index.html';
    return path;
  }

  function destination() {
    const queryReturn = new URLSearchParams(location.search).get('return');
    const stored = (() => { try { return sessionStorage.getItem(RETURN_KEY); } catch { return ''; } })();
    return safeReturnPath(queryReturn || stored || '/index.html');
  }

  function setMessage(value, tone = 'error') {
    if (!message) return;
    const text = String(value || '');
    const error = Boolean(text) && tone === 'error';
    message.textContent = text;
    message.classList.toggle('success', tone === 'success');
    message.dataset.tone = text ? tone : '';
    message.setAttribute('role', error ? 'alert' : 'status');
    message.setAttribute('aria-live', error ? 'assertive' : 'polite');
  }

  function setGoogleStatus(value, error = false) {
    if (!googleStatus) return;
    googleStatus.textContent = value || '';
    googleStatus.classList.toggle('is-error', error);
    googleStatus.setAttribute('role', error ? 'alert' : 'status');
    googleStatus.setAttribute('aria-live', error ? 'assertive' : 'polite');
  }

  function announceProviderError(provider, value) {
    if (provider === 'google') {
      setMessage('', 'status');
      setGoogleStatus(value, true);
      return;
    }
    setGoogleStatus('', false);
    setMessage(value);
  }

  function showRetry(value) {
    if (retryButton) retryButton.hidden = !value;
  }

  function setBusy(value, provider = '') {
    busy = value;
    if (submit) submit.disabled = value || configurationBlocked;
    if (password) password.disabled = value || configurationBlocked;
    if (toggle) toggle.disabled = value || configurationBlocked;
    if (retryButton) retryButton.disabled = value || configurationBlocked;
    if (submit) {
      submit.classList.toggle('is-loading', value);
      const label = submit.querySelector('span:first-child');
      if (label) label.textContent = value ? 'Duke verifikuar…' : 'Hyr me password';
    }
    form?.setAttribute('aria-busy', String(value));
    if (googleButton) {
      googleButton.setAttribute('aria-busy', String(value));
      googleButton.style.pointerEvents = value ? 'none' : '';
      googleButton.style.opacity = value ? '.65' : '';
    }
    if (value && provider === 'google') setGoogleStatus('Google po verifikon identitetin…');
  }

  function blockForConfiguration() {
    configurationBlocked = true;
    showRetry(false);
    setBusy(false);
    setGoogleStatus('Hyrja private nuk është konfiguruar ende në server.', true);
    setMessage('Vendos SESSION_SECRET dhe GOOGLE_CLIENT_ID në Vercel. Password-i rezervë është opsional.', 'status');
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
      const targets = ['/offline-runtime.js', '/auth-client.js', '/tailadmin-shell.js', '/user-library-client.js'];
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

  async function completeLogin(payload, provider) {
    saveBootstrapLease(payload);
    redirecting = true;
    showRetry(false);
    const success = `U verifikua ${payload.user?.email || 'llogaria'}. Po hapet MedIndex…`;
    if (provider === 'google') {
      setMessage('', 'status');
      setGoogleStatus(success);
    } else {
      setGoogleStatus('', false);
      setMessage(success, 'success');
    }
    if (password) {
      password.value = '';
      password.removeAttribute('aria-invalid');
    }
    try { sessionStorage.removeItem(RETURN_KEY); } catch {}
    await Promise.race([purgeOnlyStaleRuntimeEntries(), new Promise(resolve => setTimeout(resolve, 1200))]);
    location.replace(destination());
  }

  async function submitCredential(body, provider) {
    if (busy || configurationBlocked) return;
    showRetry(false);
    setBusy(true, provider);
    const slowMessage = connectionProfile().slow ? 'Lidhja është e dobët; verifikimi mund të zgjasë pak…' : '';
    if (provider === 'google') {
      setMessage('', 'status');
      if (slowMessage) setGoogleStatus(slowMessage);
    } else {
      setMessage(slowMessage, 'status');
    }
    try {
      const response = await timedFetch('/api/auth', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Accept:'application/json', 'X-CSRF-Token':csrfToken },
        body:JSON.stringify({ ...body, csrfToken }),
        cache:'no-store',
        credentials:'same-origin',
      }, 20000, 45000);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 503 && payload.code === 'AUTH_NOT_CONFIGURED') {
          blockForConfiguration();
          return;
        }
        if (payload.code === 'CSRF_INVALID') location.reload();
        const retryAfter = Number(response.headers.get('retry-after') || 0);
        const suffix = response.status === 429 && retryAfter ? ` Provo pas rreth ${Math.ceil(retryAfter / 60)} minutash.` : '';
        throw new Error((payload.error || 'Hyrja dështoi.') + suffix);
      }
      await completeLogin(payload, provider);
    } catch (error) {
      if (configurationBlocked) return;
      const value = error?.name === 'AbortError'
        ? 'Lidhja është shumë e ngadalshme. Provo përsëri kur sinjali të jetë më i mirë.'
        : error.message || 'Hyrja dështoi.';
      announceProviderError(provider, value);
      if (provider === 'google') {
        showRetry(true);
      } else {
        password?.setAttribute('aria-invalid', 'true');
        password?.select();
      }
    } finally {
      if (!redirecting && !configurationBlocked) setBusy(false);
    }
  }

  function updateCapsLock(event) {
    if (!capsHint) return;
    capsHint.hidden = !Boolean(event?.getModifierState?.('CapsLock'));
  }

  ['keydown', 'keyup'].forEach(type => password?.addEventListener(type, updateCapsLock));
  password?.addEventListener('blur', () => { if (capsHint) capsHint.hidden = true; });
  password?.addEventListener('input', () => password.removeAttribute('aria-invalid'));

  toggle?.addEventListener('click', () => {
    if (!password) return;
    const visible = password.type === 'text';
    password.type = visible ? 'password' : 'text';
    toggle.textContent = visible ? 'Shfaq' : 'Fshih';
    toggle.setAttribute('aria-pressed', String(!visible));
    toggle.setAttribute('aria-label', visible ? 'Shfaq password-in' : 'Fshih password-in');
    password.focus();
  });

  form?.addEventListener('submit', event => {
    event.preventDefault();
    const value = password?.value || '';
    if (value.length < 6) {
      password?.setAttribute('aria-invalid', 'true');
      setGoogleStatus('', false);
      setMessage('Shkruaje password-in e plotë.');
      password?.focus();
      return;
    }
    password.removeAttribute('aria-invalid');
    void submitCredential({ password:value }, 'password');
  });

  function waitForGoogle(timeoutMs = 12000) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        if (window.google?.accounts?.id) return resolve(window.google.accounts.id);
        if (Date.now() - started >= timeoutMs) return reject(new Error('Google Sign-In nuk u ngarkua.'));
        setTimeout(check, 80);
      };
      check();
    });
  }

  function targetGoogleButtonWidth() {
    const available = Math.floor(googleButton?.getBoundingClientRect().width || googleButton?.clientWidth || 320);
    return Math.max(200, Math.min(400, available));
  }

  function renderGoogleButton(force = false) {
    if (!googleInitialized || !googleIdentity || !googleButton) return;
    const width = targetGoogleButtonWidth();
    if (!force && googleButton.firstElementChild && Math.abs(width - googleButtonWidth) < 8) return;
    googleButton.replaceChildren();
    googleIdentity.renderButton(googleButton, {
      type:'standard',
      theme:'outline',
      size:'large',
      text:'continue_with',
      shape:'rectangular',
      logo_alignment:'left',
      width,
    });
    googleButtonWidth = width;
  }

  async function initializeGoogle(config) {
    if (googleInitialized || !config.googleConfigured || !config.googleClientId) return;
    try {
      const identity = await waitForGoogle();
      identity.initialize({
        client_id:config.googleClientId,
        callback:response => {
          const credential = String(response?.credential || '');
          if (!credential) return setGoogleStatus('Google nuk ktheu credential-in e hyrjes.', true);
          void submitCredential({ credential }, 'google');
        },
        nonce:csrfToken,
        auto_select:false,
        cancel_on_tap_outside:true,
        use_fedcm_for_prompt:true,
      });
      googleIdentity = identity;
      googleInitialized = true;
      renderGoogleButton(true);
      showRetry(false);
      setGoogleStatus('Zgjidh llogarinë e aprovuar Google.');
    } catch (error) {
      setMessage('', 'status');
      setGoogleStatus(error.message || 'Google Sign-In nuk u ngarkua.', true);
      showRetry(true);
      if (config.passwordFallbackConfigured && fallback) {
        fallback.hidden = false;
        fallback.open = true;
        password?.focus();
      }
    }
  }

  function configureProviders(config) {
    lastConfiguration = config;
    csrfToken = String(config.csrfToken || '');
    showRetry(false);
    const fallbackRequested = new URLSearchParams(location.search).get('fallback') === '1';
    if (fallback) {
      fallback.hidden = !config.passwordFallbackConfigured || (config.googleConfigured && !fallbackRequested);
      fallback.open = Boolean(config.passwordFallbackConfigured && fallbackRequested);
    }
    if (!config.googleConfigured) {
      if (googleButton) googleButton.innerHTML = '<div class="google-login-unavailable">Google Client ID ende nuk është vendosur në Vercel.</div>';
      setGoogleStatus('Hyrja me Google është gati në kod, por pret konfigurimin e Google Client ID.', true);
      if (config.passwordFallbackConfigured && fallback) {
        fallback.hidden = false;
        fallback.open = true;
        password?.focus();
      } else {
        blockForConfiguration();
      }
      return;
    }
    void initializeGoogle(config);
  }

  async function checkExistingSession() {
    showRetry(false);
    try {
      const response = await timedFetch('/api/auth', { cache:'no-store', credentials:'same-origin', headers:{ Accept:'application/json' } }, 10000, 24000);
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.authenticated) {
        redirecting = true;
        location.replace(destination());
        return;
      }
      if (!response.ok || payload.sessionConfigured === false || payload.hardened === false) {
        if (!payload.googleConfigured && !payload.passwordFallbackConfigured) blockForConfiguration();
      }
      configureProviders(payload);
    } catch (error) {
      setMessage('', 'status');
      setGoogleStatus(error?.name === 'AbortError' ? 'Kontrolli i hyrjes zgjati tepër. Provo përsëri.' : 'Serveri i hyrjes nuk u arrit. Kontrollo internetin dhe provo përsëri.', true);
      showRetry(true);
    }
  }

  retryButton?.addEventListener('click', () => {
    if (busy || configurationBlocked) return;
    showRetry(false);
    setMessage('', 'status');
    setGoogleStatus('Po riprovohet lidhja e sigurt…');
    if (lastConfiguration?.googleConfigured && !googleInitialized) void initializeGoogle(lastConfiguration);
    else void checkExistingSession();
  });

  function initGoogleResizeAudit() {
    if (!googleButton || !('ResizeObserver' in window)) return;
    const observer = new ResizeObserver(() => {
      if (!googleInitialized) return;
      cancelAnimationFrame(googleResizeFrame);
      googleResizeFrame = requestAnimationFrame(() => renderGoogleButton());
    });
    observer.observe(googleButton);
  }

  function init() {
    setBusy(false);
    initGoogleResizeAudit();
    refreshWorkerInBackground();
    checkExistingSession();
  }

  window.addEventListener('online', () => {
    if (!configurationBlocked && retryButton && !retryButton.hidden) setGoogleStatus('Lidhja u rikthye. Riprovo hyrjen.');
  });

  window.addEventListener('pageshow', () => {
    if (!busy && !configurationBlocked && fallback?.open) password?.focus();
  });

  init();
})();
