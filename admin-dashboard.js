(() => {
  'use strict';

  // The admin dashboard.
  //
  // Every account that registers lands here and stays locked out until it is
  // approved, so this is the screen that decides who may use MedIndex at all.
  // It renders nothing until the server confirms the caller is an admin — the
  // API refuses everyone else, and a doctor who lands on this URL is sent back
  // to the registry rather than shown controls that would fail.

  const USERS = '/api/auth?scope=users';
  const $ = id => document.getElementById(id);

  const elements = {
    rows:$('adminRows'),
    state:$('adminState'),
    message:$('adminMessage'),
    search:$('adminSearch'),
    tabs:$('adminTabs'),
    refresh:$('adminRefresh'),
    who:$('adminWho'),
    dialog:$('refuseDialog'),
    refuseForm:$('refuseForm'),
    refuseWho:$('refuseWho'),
    refuseReason:$('refuseReason'),
    stats:{
      pending:$('statPending'),
      active:$('statActive'),
      blocked:$('statBlocked'),
      total:$('statTotal'),
    },
  };

  const STATUS_LABELS = {
    pending:'Në pritje',
    active:'Aktiv',
    suspended:'I pezulluar',
    disabled:'I çaktivizuar',
  };
  const TITLE_LABELS = {
    student:'Student i Mjekësisë',
    mjek:'Mjek/e',
    specialist:'Specialist/e',
    specializant:'Specializant/e',
  };
  const DOCUMENT_LABELS = {
    id:'ID e studentit',
    diplome:'Diploma',
    licence:'Licenca',
  };
  const VERIFICATION_LABELS = {
    missing:'Pa dokument',
    submitted:'Dokument i dërguar',
    verified:'I verifikuar',
    rejected:'I refuzuar',
  };

  let users = [];
  let filter = 'pending';
  let query = '';
  let csrfToken = '';
  let busy = false;
  let refuseTarget = null;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  })[character]);

  function formatDate(value) {
    const date = new Date(value || 0);
    return Number.isFinite(date.getTime()) && date.getTime() > 0
      ? new Intl.DateTimeFormat('sq-AL', { dateStyle:'medium', timeStyle:'short' }).format(date)
      : '—';
  }

  function humanBytes(value) {
    const bytes = Number(value) || 0;
    if (!bytes) return '';
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  function setState(label, tone = '') {
    elements.state.textContent = label;
    elements.state.className = `mi-admin-state${tone ? ` is-${tone}` : ''}`;
  }

  function setMessage(value, tone = '') {
    elements.message.textContent = value || '';
    elements.message.className = `mi-admin-message${tone ? ` is-${tone}` : ''}`;
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials:'same-origin',
      cache:'no-store',
      ...options,
      headers:{ Accept:'application/json', ...(options.headers || {}) },
    });
    if (response.status === 401) {
      location.replace(`/login.html?return=${encodeURIComponent(location.pathname)}`);
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

  // --- rendering ------------------------------------------------------------

  function matchesFilter(user) {
    if (filter === 'all') return true;
    if (filter === 'blocked') return user.status === 'suspended' || user.status === 'disabled';
    return user.status === filter;
  }

  function matchesQuery(user) {
    if (!query) return true;
    return `${user.email} ${user.fullName} ${user.specialty}`.toLowerCase().includes(query);
  }

  // Which buttons a row gets follows from its state, so an admin is never shown
  // an action the server would refuse.
  function actionsFor(user) {
    const actions = [];
    if (user.status === 'pending') {
      // Approval is refused without a document, so the button says why instead
      // of failing after the click.
      const hasDocument = Boolean(user.verificationDocument);
      actions.push({
        label:hasDocument ? 'Aprovo' : 'Pa dokument',
        status:'active',
        primary:hasDocument,
        disabled:!hasDocument,
        title:hasDocument ? '' : 'Ky regjistrim nuk ka ende dokument profesional.',
      });
      actions.push({ label:'Refuzo', refuse:true, danger:true });
    }
    if (user.status === 'active') {
      actions.push({ label:'Pezullo', status:'suspended', danger:true });
      // Administration is limited to named addresses, so the promotion is only
      // offered where it could actually succeed.
      if (user.role === 'admin') actions.push({ label:'Bëje mjek', role:'doctor' });
      else if (user.canBeAdmin) actions.push({ label:'Bëje admin', role:'admin' });
    }
    if (user.status === 'suspended' || user.status === 'disabled') {
      actions.push({ label:'Riaktivizo', status:'active', primary:true });
    }
    return actions;
  }

  function renderActions(user) {
    return actionsFor(user).map(action => {
      const classes = ['mi-action'];
      if (action.primary) classes.push('is-primary');
      if (action.danger) classes.push('is-danger');
      const attributes = [
        `class="${classes.join(' ')}"`,
        `data-user-id="${escapeHtml(user.id)}"`,
        action.status ? `data-status="${escapeHtml(action.status)}"` : '',
        action.role ? `data-role="${escapeHtml(action.role)}"` : '',
        action.refuse ? 'data-refuse="1"' : '',
        action.disabled ? 'disabled' : '',
        action.title ? `title="${escapeHtml(action.title)}"` : '',
      ].filter(Boolean).join(' ');
      return `<button type="button" ${attributes}>${escapeHtml(action.label)}</button>`;
    }).join('');
  }

  function renderDocument(user) {
    const document_ = user.verificationDocument;
    const verification = VERIFICATION_LABELS[user.verificationStatus] || user.verificationStatus || '—';
    if (!document_) return `<small>${escapeHtml(verification)}</small>`;

    const kind = DOCUMENT_LABELS[document_.documentKind] || 'Dokument';
    const size = humanBytes(document_.byteSize);
    return `
      <button type="button" class="mi-action is-doc" data-document-id="${escapeHtml(document_.id)}">Hap ${escapeHtml(kind.toLowerCase())}</button>
      <small>${escapeHtml([verification, size].filter(Boolean).join(' · '))}</small>
      ${document_.rejectionReason ? `<small>Arsyeja: ${escapeHtml(document_.rejectionReason)}</small>` : ''}`;
  }

  function renderTitle(user) {
    const title = TITLE_LABELS[user.professionalTitle] || '';
    if (!title) return '<small>Ende pa deklaruar</small>';
    return `<strong>${escapeHtml(title)}</strong>${user.specialty ? `<small>${escapeHtml(user.specialty)}</small>` : ''}`;
  }

  function render() {
    const counts = users.reduce((totals, user) => {
      totals[user.status] = (totals[user.status] || 0) + 1;
      return totals;
    }, {});
    const pending = counts.pending || 0;
    const blocked = (counts.suspended || 0) + (counts.disabled || 0);
    elements.stats.pending.textContent = String(pending);
    elements.stats.active.textContent = String(counts.active || 0);
    elements.stats.blocked.textContent = String(blocked);
    elements.stats.total.textContent = String(users.length);

    setState(
      pending ? `${pending} presin aprovim` : `${users.length} llogari`,
      pending ? 'warning' : 'success',
    );

    const visible = users.filter(user => matchesFilter(user) && matchesQuery(user));
    if (!visible.length) {
      elements.rows.innerHTML = `<tr><td class="is-empty" colspan="6">${
        query ? 'Asnjë llogari nuk përputhet me kërkimin.' : 'Asnjë llogari në këtë grup.'
      }</td></tr>`;
      return;
    }

    elements.rows.innerHTML = visible.map(user => `
      <tr data-user-row="${escapeHtml(user.id)}">
        <td>
          <strong>${escapeHtml(user.email || '—')}</strong>
          ${user.fullName ? `<small>${escapeHtml(user.fullName)}</small>` : ''}
          ${user.hasLegacyData ? '<span class="mi-tag">bibliotekë e migruar</span>' : ''}
        </td>
        <td>${renderTitle(user)}</td>
        <td>
          <span class="mi-badge is-${escapeHtml(user.status)}">${escapeHtml(STATUS_LABELS[user.status] || user.status)}</span>
          ${user.role === 'admin' ? '<span class="mi-badge is-admin">Administrator</span>' : ''}
        </td>
        <td>${renderDocument(user)}</td>
        <td>
          <small>Regjistruar: ${escapeHtml(formatDate(user.createdAt))}</small>
          <small>Hyrja e fundit: ${escapeHtml(formatDate(user.lastSignInAt))}</small>
        </td>
        <td><div class="mi-row-actions">${renderActions(user)}</div></td>
      </tr>`).join('');
  }

  // --- actions ---------------------------------------------------------------

  async function session() {
    const payload = await request('/api/auth');
    csrfToken = String(payload.csrfToken || '');
    return payload;
  }

  async function load() {
    setState('Duke kontrolluar…');
    try {
      const payload = await request(USERS);
      users = Array.isArray(payload.users) ? payload.users : [];
      render();
    } catch (error) {
      if (error.status === 403) {
        // Not an admin. There is nothing on this page for them.
        location.replace('/index.html');
        return;
      }
      setState('Gabim', 'danger');
      setMessage(error.message, 'error');
    }
  }

  async function applyChange(button, extra = {}) {
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
      const body = { userId, ...extra };
      if (button.dataset.status) body.status = button.dataset.status;
      if (button.dataset.role) body.role = button.dataset.role;
      await request(USERS, {
        method:'PATCH',
        headers:{ 'Content-Type':'application/json', 'X-CSRF-Token':csrfToken },
        body:JSON.stringify(body),
      });
      await load();
      setMessage('Ndryshimi u ruajt.', 'success');
    } catch (error) {
      button.disabled = false;
      button.textContent = original;
      setMessage(error.message, 'error');
    } finally {
      busy = false;
    }
  }

  // The private document is never served from this page. The server mints a URL
  // that lives for sixty seconds and writes an audit entry for every one it
  // makes, so opening a document is a recorded act.
  async function openDocument(button) {
    const documentId = button.dataset.documentId;
    if (!documentId || busy) return;
    busy = true;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Duke hapur…';
    setMessage('');
    try {
      const payload = await request(`/api/auth?scope=verification&document=${encodeURIComponent(documentId)}`);
      window.open(payload.url, '_blank', 'noopener,noreferrer');
      setMessage(`Lidhja private skadon për ${payload.expiresIn} sekonda dhe hapja u regjistrua në auditim.`);
    } catch (error) {
      setMessage(error.message, 'error');
    } finally {
      button.disabled = false;
      button.textContent = original;
      busy = false;
    }
  }

  function askToRefuse(button) {
    const user = users.find(item => item.id === button.dataset.userId);
    if (!user) return;
    refuseTarget = button;
    elements.refuseWho.textContent = `${user.email}${user.fullName ? ` · ${user.fullName}` : ''}`;
    elements.refuseReason.value = '';
    elements.dialog.showModal();
  }

  // --- wiring -----------------------------------------------------------------

  elements.rows.addEventListener('click', event => {
    const document_ = event.target.closest('[data-document-id]');
    if (document_) return void openDocument(document_);

    const refuse = event.target.closest('[data-refuse]');
    if (refuse) return askToRefuse(refuse);

    const action = event.target.closest('.mi-action[data-user-id]');
    if (action && !action.disabled) void applyChange(action);
  });

  elements.refuseForm.addEventListener('submit', () => {
    const button = refuseTarget;
    const rejectionReason = elements.refuseReason.value.trim();
    refuseTarget = null;
    if (!button) return;
    // Refusing sets the account to `disabled`, which is what the database reads
    // as "reviewed and turned away" — it also marks the document rejected.
    button.dataset.status = 'disabled';
    void applyChange(button, rejectionReason ? { rejectionReason } : {});
  });

  elements.refuseForm.querySelector('[data-refuse-cancel]').addEventListener('click', () => {
    refuseTarget = null;
    elements.dialog.close();
  });

  elements.tabs.addEventListener('click', event => {
    const tab = event.target.closest('.mi-tab');
    if (!tab) return;
    filter = tab.dataset.filter;
    [...elements.tabs.children].forEach(item => item.setAttribute('aria-selected', String(item === tab)));
    render();
  });

  let searchTimer = 0;
  elements.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      query = elements.search.value.trim().toLowerCase();
      render();
    }, 140);
  });

  elements.refresh.addEventListener('click', () => void load());

  (async () => {
    try {
      const payload = await session();
      if (!payload.authenticated) {
        location.replace(`/login.html?return=${encodeURIComponent(location.pathname)}`);
        return;
      }
      if (payload.authUser?.role !== 'admin') {
        location.replace('/index.html');
        return;
      }
      elements.who.textContent = payload.user?.email || '';
      await load();
    } catch (error) {
      setState('Gabim', 'danger');
      setMessage(error.message, 'error');
    }
  })();
})();
