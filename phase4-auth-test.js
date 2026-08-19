(() => {
  'use strict';

  const status = document.getElementById('status');
  const button = document.getElementById('googleButton');
  let csrfToken = '';

  function setStatus(message, kind = '') {
    status.textContent = String(message || '');
    status.className = `status${kind ? ` ${kind}` : ''}`;
  }

  async function sha256Hex(value) {
    const data = new TextEncoder().encode(String(value || ''));
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function waitForGoogle(timeoutMs = 12000) {
    const started = Date.now();
    while (!window.google?.accounts?.id) {
      if (Date.now() - started > timeoutMs) throw new Error('Google Sign-In nuk u ngarkua.');
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    return window.google.accounts.id;
  }

  async function bootstrap(credential) {
    setStatus('Google u verifikua. Po krijohet/verifikohet Supabase Auth…');
    const response = await fetch('/api/auth?scope=phase4-auth-bootstrap', {
      method:'POST',
      credentials:'same-origin',
      cache:'no-store',
      headers:{
        'Content-Type':'application/json',
        Accept:'application/json',
        'X-CSRF-Token':csrfToken,
      },
      body:JSON.stringify({ credential, csrfToken }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${payload.code || response.status}: ${payload.error || 'Bootstrap dështoi.'}`);
    setStatus(
      `SUKSES\n\nEmail: ${payload.user?.email || ''}\nRole: ${payload.user?.role || ''}\nStatus: ${payload.user?.status || ''}\nAuth user: ${payload.user?.id || ''}\n\n${payload.message || ''}`,
      'ok',
    );
  }

  async function init() {
    try {
      const configResponse = await fetch('/api/auth', { credentials:'same-origin', cache:'no-store', headers:{ Accept:'application/json' } });
      const config = await configResponse.json().catch(() => ({}));
      csrfToken = String(config.csrfToken || '');
      const clientId = String(config.googleClientId || '');
      if (!configResponse.ok || !csrfToken || !config.googleConfigured || !clientId) {
        throw new Error('Google/CSRF configuration nuk është gati në Preview server.');
      }

      const google = await waitForGoogle();
      const hashedNonce = await sha256Hex(csrfToken);
      google.initialize({
        client_id:clientId,
        nonce:hashedNonce,
        auto_select:false,
        cancel_on_tap_outside:true,
        use_fedcm_for_prompt:true,
        callback:response => {
          const credential = String(response?.credential || '').trim();
          if (!credential) return setStatus('Google nuk ktheu credential.', 'bad');
          bootstrap(credential).catch(error => setStatus(error.message || String(error), 'bad'));
        },
      });
      google.renderButton(button, {
        type:'standard',
        theme:'filled_black',
        size:'large',
        text:'continue_with',
        shape:'rectangular',
        logo_alignment:'left',
        width:320,
      });
      setStatus('Gati. Kliko “Continue with Google” për testin real të Fazës 4.');
    } catch (error) {
      setStatus(error.message || String(error), 'bad');
    }
  }

  init();
})();
