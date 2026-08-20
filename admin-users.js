(() => {
  'use strict';

  // Admin screen for MedIndex accounts. Every account that signs in with Google
  // lands in `pending` and stays locked out until it is approved here, so this is
  // the panel that decides who can use MedIndex at all.
  //
  // The panel only renders for an admin: the API refuses everyone else, and the
  // section stays hidden rather than showing controls that would fail.

  const ENDPOINT = '/api/auth?scope=users';
  const $ = id => document.getElementById(id);
  const elements = {
    panel:$('systemUsersPanel'),
    state:$('systemUsersState'),
    rows:$('systemUsersRows'),
    summary:$('systemUsersSummary'),
    message:$('systemUsersMessage'),
    refresh:$('systemUsersRefresh'),
  };

  if (!elements.panel) return;

  const STATUS_LABELS = {
    pending:'Në pritje',
    active:'Aktiv',
    suspended:'I pezulluar',
    disabled:'I çaktivizuar',
  };
  // TailAdmin badge modifiers, one per account status.
  const STATUS_BADGE = {
    pending:'is-pending',
    active:'is-active',
    suspended:'is-suspended',
    disabled:'is-disabled',
  };
  const ROLE_LABELS = { admin:'Administrator', doctor:'Mjek' };

  let csrfToken = '';
  let busy = false;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  })[character]);

  function formatDate(value) {
    const date = new Date(value || 0);
    return Number.isFinite(date.getTime()) && date.getTime() > 0
      ? new Intl.DateTimeFormat('sq-AL', { dateStyle:'medium', timeStyle:'short' }).format(date)
      : '—';
  }

  function setState(label, severity = 'neutral') {
    if (!elements.state) return;
    elements.state.className = `system-state is-${severity}`;
    elements.state.textContent = label;
  }

  function setMessage(value, error = false) {
    if (!elements.message) return;
    elements.message.textContent = value || '';
    elements.message.className = `system-message${error ? ' is-error' : ''}`;
  }

  async function session() {
    const response = await fetch('/api/auth', {
      credentials:'same-origin', cache:'no-store', headers:{ Accept:'application/json' },
    });
    const payload = await response.json().catch(() => ({}));
    csrfToken = payload.csrfToken || '';
    return payload;
  }

  async function request(options = {}) {
    const response = await fetch(ENDPOINT, {
      credentials:'same-origin', cache:'no-store', ...options,
      headers:{ Accept:'application/json', ...(options.headers || {}) },
    });
    if (response.status === 401) {
      location.href = `/login-v2.html?return=${encodeURIComponent(location.pathname)}`;
      throw new Error('Sesioni ka skaduar.');
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      const error = new Error(payload.error || `Kërkesa dështoi (${response.status}).`);
      error.status = response.status;
      error.code = payload.code || '';
      throw error;
    }
    return payload;
  }

  // Which buttons a row gets follows from its status, so an admin never sees an
  // action that the server would reject.
  function actionsFor(user) {
    const actions = [];
    if (user.status === 'pending') {
      actions.push({ label:'Aprovo', status:'active', primary:true });
    }
    if (user.status === 'active') {
      actions.push({ label:'Pezullo', status:'suspended', danger:true });
      if (user.role !== 'admin') actions.push({ label:'Bëje admin', role:'admin' });
      else actions.push({ label:'Bëje mjek', role:'doctor' });
    }
    if (user.status === 'suspended' || user.status === 'disabled') {
      actions.push({ label:'Riaktivizo', status:'active', primary:true });
    }
    return actions;
  }

  function renderActions(user) {
    return actionsFor(user).map(action => {
      const classes = ['mi-users-action'];
      if (action.primary) classes.push('is-primary');
      if (action.danger) classes.push('is-danger');
      const attrs = [
        `data-user-id="${escapeHtml(user.id)}"`,
        action.status ? `data-status="${escapeHtml(action.status)}"` : '',
        action.role ? `data-role="${escapeHtml(action.role)}"` : '',
      ].filter(Boolean).join(' ');
      return `<button type="button" class="${classes.join(' ')}" ${attrs}>${escapeHtml(action.label)}</button>`;
    }).join('');
  }

  function render(payload) {
    const users = Array.isArray(payload.users) ? payload.users : [];
    const counts = payload.counts || {};

    if (!users.length) {
      elements.rows.innerHTML = '<tr><td colspan="5">Ende nuk ka llogari të regjistruara.</td></tr>';
    } else {
      elements.rows.innerHTML = users.map(user => `
        <tr data-user-row="${escapeHtml(user.id)}">
          <td>
            <strong>${escapeHtml(user.email || '—')}</strong>
            ${user.fullName ? `<small>${escapeHtml(user.fullName)}</small>` : ''}
            ${user.hasLegacyData ? '<small class="mi-users-tag">bibliotekë e migruar</small>' : ''}
          </td>
          <td>${escapeHtml(ROLE_LABELS[user.role] || user.role || '—')}</td>
          <td><span class="mi-badge ${STATUS_BADGE[user.status] || 'is-disabled'}">${escapeHtml(STATUS_LABELS[user.status] || user.status)}</span></td>
          <td>${escapeHtml(formatDate(user.lastSignInAt || user.createdAt))}</td>
          <td class="mi-users-actions">${renderActions(user)}</td>
        </tr>`).join('');
    }

    const pending = Number(counts.pending || 0);
    elements.summary.textContent = pending
      ? `${pending} llogari presin aprovimin tënd.`
      : 'Asnjë llogari nuk pret aprovim.';
    setState(pending ? `${pending} në pritje` : `${users.length} llogari`, pending ? 'warning' : 'success');
  }

  async function load() {
    setState('Duke kontrolluar…', 'info');
    setMessage('');
    try {
      await session();
      const payload = await request();
      elements.panel.hidden = false;
      render(payload);
    } catch (error) {
      // A doctor account simply has no business here: hide the panel instead of
      // showing an error they can do nothing about.
      if (error.status === 403) {
        elements.panel.hidden = true;
        return;
      }
      elements.panel.hidden = false;
      setState('Gabim', 'danger');
      setMessage(error.message, true);
    }
  }

  async function applyChange(button) {
    if (busy) return;
    const userId = button.dataset.userId;
    if (!userId) return;

    busy = true;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Duke ruajtur…';
    setMessage('');
    try {
      if (!csrfToken) await session();
      const body = { userId };
      if (button.dataset.status) body.status = button.dataset.status;
      if (button.dataset.role) body.role = button.dataset.role;
      await request({
        method:'PATCH',
        body:JSON.stringify(body),
        headers:{ 'Content-Type':'application/json', 'X-CSRF-Token':csrfToken },
      });
      await load();
      setMessage('Ndryshimi u ruajt.');
    } catch (error) {
      button.disabled = false;
      button.textContent = original;
      setMessage(error.message, true);
    } finally {
      busy = false;
    }
  }

  elements.rows?.addEventListener('click', event => {
    const button = event.target.closest('.mi-users-action');
    if (button) void applyChange(button);
  });

  elements.refresh?.addEventListener('click', () => void load());

  void load();
})();
