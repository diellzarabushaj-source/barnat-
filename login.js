(() => {
  'use strict';

  const RETURN_KEY = 'medindex_return_after_login';
  const OFFLINE_LEASE_KEY = 'medindex_offline_lease_v3';
  const LEGACY_OFFLINE_LEASE_KEYS = ['medindex_offline_lease_v2', 'medindex_offline_lease_v1'];
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
  let busy = false;
  let redirecting = false;
  let configurationBlocked = false;
  let pendingApproval = false;
  let csrfToken = '';
  let googleInitialized = false;

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

  function setMessage(value, success = false) {
    message.textContent = value || '';
    message.classList.toggle('success', success);
  }

  function setGoogleStatus(value, error = false) {
    googleStatus.textContent = value || '';
    googleStatus.classList.toggle('is-error', error);
  }

  function setBusy(value, provider = '') {
    busy = value;
    if (submit) submit.disabled = value || configurationBlocked;
    if (password) password.disabled = value || configurationBlocked;
    if (toggle) toggle.disabled = value || configurationBlocked;
    if (submit) {
      submit.classList.toggle('is-loading', value);
      submit.querySelector('span:first-child').textContent = value ? 'Duke verifikuar…' : 'Hyr me password';
    }
    form?.setAttribute('aria-busy', String(value));
    googleButton.style.pointerEvents = value ? 'none' : '';
    googleButton.style.opacity = value ? '.65' : '';
    if (value && provider === 'google') setGoogleStatus('Google dhe Supabase po verifikojnë identitetin…');
  }

  function blockForConfiguration() {
    configurationBlocked = true;
    setBusy(false);
    setGoogleStatus('Hyrja private nuk është konfiguruar ende në server.', true);
    setMessage('Vendos SESSION_SECRET, GOOGLE_CLIENT_ID dhe konfigurimin Supabase Auth në Vercel. Password-i rezervë është opsional.');
  }

  // A brand-new Google account is registered but not yet approved. That is not a
  // failed login, so it must not read like one: state plainly what happened, and
  // stop offering a retry that would fail the same way.
  function showPendingApproval(detail) {
    pendingApproval = true;
    setBusy(false);
    googleButton.style.pointerEvents = 'none';
    googleButton.style.opacity = '.5';
    setGoogleStatus('Llogaria pret aprovimin e administratorit.');
    setMessage(detail || 'Llogaria jote u regjistrua dhe pret aprovimin e administratorit. Do të kesh qasje sapo të aprovohet.', true);
  }

  function clearLegacyOfflineLeases() {
    try { LEGACY_OFFLINE_LEASE_KEYS.forEach(key => localStorage.removeItem(key)); } catch {}
  }

  function phase5Session(payload = {}) {
    return Number(payload.sessionVersion) === 3
      && (payload.supabaseAuthenticated === true || payload.rollbackSession === true);
  }

  function saveBootstrapLease(payload = {}) {
    if (payload.hardened !== true || !phase5Session(payload)) return;
    const duration = Math.min(MAX_OFFLINE_LEASE_MS, Math.max(60 * 60 * 1000, Number(payload.expiresIn || 8 * 60 * 60) * 1000));
    const verifiedAt = Date.now();
    try {
      clearLegacyOfflineLeases();
      localStorage.setItem(OFFLINE_LEASE_KEY, JSON.stringify({
        version:3,
        hardened:true,
        identityContract:String(payload.identityContract || ''),
        supabaseAuthenticated:payload.supabaseAuthenticated === true,
        rollbackSession:payload.rollbackSession === true,
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

  async function sha256Hex(value) {
    if (!window.crypto?.subtle || typeof TextEncoder !== 'function') throw new Error('Shfletuesi nuk e mbështet nonce-in e sigurt të hyrjes.');
    const bytes = new TextEncoder().encode(String(value || ''));
    const digest = await window.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function completeLogin(payload) {
    if (!phase5Session(payload)) throw new Error('Serveri nuk krijoi sesionin e ri të sigurt.');
    saveBootstrapLease(payload);
    redirecting = true;
    setMessage('U verifikua. Po hapet MedIndex…', true);
    setGoogleStatus(payload.supabaseAuthenticated === true
      ? `Supabase verifikoi ${payload.user?.email || 'llogarinë Google'}.`
      : 'U aktivizua hyrja rezervë.');
    if (password) password.value = '';
    try { sessionStorage.removeItem(RETURN_KEY); } catch {}
    await Promise.race([purgeOnlyStaleRuntimeEntries(), new Promise(resolve => setTimeout(resolve, 1200))]);
    location.replace(destination());
  }

  async function submitCredential(body, provider) {
    if (busy || configurationBlocked || pendingApproval) return;
    setBusy(true, provider);
    setMessage(connectionProfile().slow ? 'Lidhja është e dobët; verifikimi mund të zgjasë pak…' : '');
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
        if (payload.code === 'ACCOUNT_PENDING_APPROVAL') {
          showPendingApproval(payload.error);
          return;
        }
        if (payload.code === 'CSRF_INVALID') location.reload();
        const retryAfter = Number(response.headers.get('retry-after') || 0);
        const suffix = response.status === 429 && retryAfter ? ` Provo pas rreth ${Math.ceil(retryAfter / 60)} minutash.` : '';
        throw new Error((payload.error || 'Hyrja dështoi.') + suffix);
      }
      await completeLogin(payload);
    } catch (error) {
      if (configurationBlocked) return;
      const value = error?.name === 'AbortError'
        ? 'Lidhja është shumë e ngadalshme. Provo përsëri kur sinjali të jetë më i mirë.'
        : error.message || 'Hyrja dështoi.';
      setMessage(value);
      if (provider === 'google') setGoogleStatus(value, true);
      else password?.select();
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

  toggle?.addEventListener('click', () => {
    const visible = password.type === 'text';
    password.type = visible ? 'password' : 'text';
    toggle.textContent = visible ? 'Shfaq' : 'Fshih';
    toggle.setAttribute('aria-pressed', String(!visible));
    toggle.setAttribute('aria-label', visible ? 'Shfaq password-in' : 'Fshih password-in');
    password.focus();
  });

  form?.addEventListener('submit', event => {
    event.preventDefault();
    const value = password.value;
    if (value.length < 6) {
      setMessage('Shkruaje password-in e plotë.');
      password.focus();
      return;
    }
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

  async function initializeGoogle(config) {
    if (googleInitialized || !config.googleConfigured || !config.googleClientId) return;
    try {
      const [identity, nonce] = await Promise.all([waitForGoogle(), sha256Hex(csrfToken)]);
      identity.initialize({
        client_id:config.googleClientId,
        callback:response => {
          const credential = String(response?.credential || '');
          if (!credential) return setGoogleStatus('Google nuk ktheu credential-in e hyrjes.', true);
          void submitCredential({ credential }, 'google');
        },
        nonce,
        auto_select:false,
        cancel_on_tap_outside:true,
        use_fedcm_for_prompt:true,
      });
      const dark = document.documentElement.dataset.theme === 'dark';
      identity.renderButton(googleButton, {
        type:'standard',
        theme:dark ? 'filled_black' : 'outline',
        size:'large',
        text:'continue_with',
        shape:'rectangular',
        logo_alignment:'left',
        width:320,
      });
      googleInitialized = true;
      setGoogleStatus('Zgjidh llogarinë e aprovuar Google.');
    } catch (error) {
      setGoogleStatus(error.message || 'Google Sign-In nuk u ngarkua.', true);
      if (config.passwordFallbackConfigured) {
        fallback.hidden = false;
        fallback.open = true;
      }
    }
  }

  function configureProviders(config) {
    csrfToken = String(config.csrfToken || '');
    fallback.hidden = !config.passwordFallbackConfigured;
    if (!config.googleConfigured) {
      googleButton.innerHTML = '<div class="google-login-unavailable">Google Client ID ende nuk është vendosur në Vercel.</div>';
      setGoogleStatus('Hyrja me Google është gati në kod, por pret konfigurimin e Google Client ID.', true);
      if (config.passwordFallbackConfigured) {
        fallback.hidden = false;
        fallback.open = true;
        password.focus();
      } else {
        blockForConfiguration();
      }
      return;
    }
    if (config.passwordFallbackConfigured && new URLSearchParams(location.search).get('fallback') === '1') fallback.open = true;
    void initializeGoogle(config);
  }

  async function clearLegacyServerSession() {
    try {
      await timedFetch('/api/auth', {
        method:'DELETE',
        cache:'no-store',
        credentials:'same-origin',
        headers:{ Accept:'application/json' },
      }, 10000, 24000);
    } catch {}
  }

  async function checkExistingSession() {
    try {
      const response = await timedFetch('/api/auth', { cache:'no-store', credentials:'same-origin', headers:{ Accept:'application/json' } }, 10000, 24000);
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.authenticated && phase5Session(payload)) {
        redirecting = true;
        location.replace(destination());
        return;
      }
      if (response.ok && payload.authenticated && Number(payload.sessionVersion || 0) < 3) {
        setGoogleStatus('Po përditësohet sesioni i vjetër në Supabase Auth…');
        await clearLegacyServerSession();
        return checkExistingSession();
      }
      if (!response.ok || payload.sessionConfigured === false || payload.hardened === false) {
        if (!payload.googleConfigured && !payload.passwordFallbackConfigured) blockForConfiguration();
      }
      configureProviders(payload);
    } catch (error) {
      setGoogleStatus(error?.name === 'AbortError' ? 'Kontrolli i hyrjes zgjati tepër.' : 'Serveri i hyrjes nuk u arrit.', true);
      setMessage('Kontrollo lidhjen me internet dhe provo përsëri.');
    }
  }

  function init() {
    setBusy(false);
    clearLegacyOfflineLeases();
    refreshWorkerInBackground();
    checkExistingSession();
  }

  window.addEventListener('pageshow', () => {
    if (!busy && !configurationBlocked && fallback.open) password?.focus();
  });
  init();
})();