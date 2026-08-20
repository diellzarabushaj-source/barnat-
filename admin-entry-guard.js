(() => {
  'use strict';

  const ADMIN_LOGIN = '/admin-login.html?return=%2Fadmin';
  const OWNER = 'diellzarabushaj@gmail.com';

  function loadWorkspace() {
    const script = document.createElement('script');
    script.src = '/admin-dashboard.js?v=admin-v6';
    script.defer = true;
    document.body.appendChild(script);
  }

  function showLockedAccount() {
    const gate = document.getElementById('adminGate');
    const shell = document.getElementById('adminShell');
    const title = document.getElementById('gateTitle');
    const text = document.getElementById('gateText');
    const action = document.getElementById('gateAction');
    if (shell) shell.hidden = true;
    if (gate) gate.hidden = false;
    if (title) title.textContent = 'Kjo llogari nuk është administrator';
    if (text) text.textContent = 'Dil nga llogaria aktuale dhe hyr me llogarinë e autorizuar të MedIndex Admin.';
    if (action) {
      action.hidden = false;
      action.href = '#';
      action.textContent = 'Dil dhe hyr si administrator';
      action.addEventListener('click', async event => {
        event.preventDefault();
        action.setAttribute('aria-busy', 'true');
        try {
          await fetch('/api/auth', { method:'DELETE', credentials:'same-origin', cache:'no-store', headers:{ Accept:'application/json' } });
        } finally {
          location.replace(ADMIN_LOGIN);
        }
      }, { once:true });
    }
  }

  function installAdminLogoutRoute() {
    document.addEventListener('click', event => {
      const button = event.target?.closest?.('#adminLogout');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      fetch('/api/auth', { method:'DELETE', credentials:'same-origin', cache:'no-store', headers:{ Accept:'application/json' } })
        .then(response => {
          if (!response.ok) throw new Error(`Logout failed (${response.status})`);
          location.replace(ADMIN_LOGIN);
        })
        .catch(error => {
          console.error('Admin logout failed:', error);
          button.disabled = false;
        });
    }, true);
  }

  async function boot() {
    try {
      const response = await fetch('/api/auth', {
        credentials:'same-origin',
        cache:'no-store',
        headers:{ Accept:'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.authenticated === false) {
        location.replace(ADMIN_LOGIN);
        return;
      }
      if (response.ok && payload.authenticated) {
        const email = String(payload.user?.email || '').trim().toLowerCase();
        if (payload.authUser?.role !== 'admin' || email !== OWNER) {
          showLockedAccount();
          return;
        }
      }
    } catch {}
    installAdminLogoutRoute();
    loadWorkspace();
  }

  void boot();
})();
