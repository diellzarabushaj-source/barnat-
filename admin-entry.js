(() => {
  'use strict';

  // The system page carries one admin-only element: a way into the admin
  // dashboard. It stays hidden for everyone else rather than linking to a page
  // that would immediately turn them away.
  //
  // This is a convenience, not a control. `/api/auth?scope=users` refuses a
  // non-admin regardless of what this page chooses to show.

  const panel = document.getElementById('systemUsersPanel');
  if (!panel) return;

  void (async () => {
    try {
      const response = await fetch('/api/auth', {
        credentials:'same-origin', cache:'no-store', headers:{ Accept:'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (payload.authUser?.role !== 'admin') return;
      panel.hidden = false;
    } catch {
      // Offline or refused: leave the panel hidden.
    }
  })();
})();
