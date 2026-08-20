(() => {
  'use strict';

  // "Barnat e mia" — the drugs a doctor adds themselves.
  //
  // These deliberately live in their own labelled section instead of being mixed
  // into the official registry rows: a personal entry is unverified by definition,
  // and a clinician must never mistake one for the authorized register. An admin
  // gets a second option in the same form, because an admin's addition belongs to
  // the shared registry that everyone sees.

  const INSTANCE_KEY = '__medindexPersonalDrugsUi';
  if (window[INSTANCE_KEY]) return;
  window[INSTANCE_KEY] = { version:'personal-drugs-ui-v1' };

  const HASH = '#barnat-e-mia';
  const FIELDS = [
    { name:'activeSubstance', label:'Substanca aktive' },
    { name:'strength', label:'Përqendrimi' },
    { name:'form', label:'Forma farmaceutike' },
    { name:'manufacturer', label:'Prodhuesi' },
    { name:'atcCode', label:'Kodi ATC' },
    { name:'classification', label:'Grupi / klasa' },
    { name:'indications', label:'Indikacionet', long:true },
    { name:'adultDose', label:'Doza te të rriturit', long:true },
    { name:'pediatricDose', label:'Doza pediatrike', long:true },
    { name:'contraindications', label:'Kundërindikacionet', long:true },
    { name:'notes', label:'Shënime personale', long:true },
  ];

  let overlay = null;
  let editingId = '';
  let isAdmin = false;
  let csrfToken = '';

  const library = () => window.MedIndexUserLibrary || null;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  })[character]);

  async function detectAdmin() {
    try {
      const response = await fetch('/api/auth', {
        credentials:'same-origin', cache:'no-store', headers:{ Accept:'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      csrfToken = payload.csrfToken || '';
      isAdmin = payload.authUser?.role === 'admin';
    } catch {
      isAdmin = false;
    }
  }

  function fieldMarkup(entry = {}) {
    const fields = entry.fields || {};
    return FIELDS.map(field => {
      const value = escapeHtml(fields[field.name] || '');
      const control = field.long
        ? `<textarea id="pd-${field.name}" name="${field.name}" rows="2">${value}</textarea>`
        : `<input id="pd-${field.name}" name="${field.name}" type="text" value="${value}">`;
      return `<label class="pd-field${field.long ? ' is-long' : ''}"><span>${escapeHtml(field.label)}</span>${control}</label>`;
    }).join('');
  }

  function listMarkup(entries) {
    if (!entries.length) {
      return '<p class="pd-empty">Ende nuk ke shtuar asnjë bar. Shtoje të parin me formularin më poshtë.</p>';
    }
    return `<ul class="pd-list">${entries.map(entry => {
      const summary = [entry.fields?.activeSubstance, entry.fields?.strength, entry.fields?.form]
        .filter(Boolean).map(escapeHtml).join(' · ');
      return `<li class="pd-item">
        <div class="pd-item-body">
          <strong>${escapeHtml(entry.name)}</strong>
          ${summary ? `<small>${summary}</small>` : ''}
          <span class="pd-badge">Personale · e paverifikuar</span>
        </div>
        <div class="pd-item-actions">
          <button type="button" data-pd-edit="${escapeHtml(entry.clientId)}">Ndrysho</button>
          <button type="button" class="is-danger" data-pd-delete="${escapeHtml(entry.clientId)}">Fshi</button>
        </div>
      </li>`;
    }).join('')}</ul>`;
  }

  function render() {
    if (!overlay) return;
    const api = library();
    const entries = api ? api.personalDrugs() : [];
    const editing = editingId ? entries.find(entry => entry.clientId === editingId) : null;

    overlay.querySelector('[data-pd-list]').innerHTML = listMarkup(entries);
    overlay.querySelector('[data-pd-count]').textContent = entries.length
      ? `${entries.length} ${entries.length === 1 ? 'bar i shtuar' : 'barna të shtuara'}`
      : 'Asnjë bar i shtuar';
    overlay.querySelector('[data-pd-name]').value = editing ? editing.name : '';
    overlay.querySelector('[data-pd-fields]').innerHTML = fieldMarkup(editing || {});
    overlay.querySelector('[data-pd-submit]').textContent = editing ? 'Ruaj ndryshimet' : 'Shto barin';
    const cancel = overlay.querySelector('[data-pd-cancel-edit]');
    if (cancel) cancel.hidden = !editing;

    const sharedRow = overlay.querySelector('[data-pd-shared-row]');
    if (sharedRow) sharedRow.hidden = !isAdmin || Boolean(editing);
  }

  function setMessage(value, error = false) {
    const node = overlay?.querySelector('[data-pd-message]');
    if (!node) return;
    node.textContent = value || '';
    node.className = `pd-message${error ? ' is-error' : ''}`;
  }

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'pd-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Barnat e mia');
    overlay.innerHTML = `
      <div class="pd-panel">
        <header class="pd-head">
          <div>
            <p class="pd-kicker">Vetëm për ty</p>
            <h2>Barnat e mia</h2>
            <p class="pd-sub" data-pd-count>Asnjë bar i shtuar</p>
          </div>
          <button type="button" class="pd-close" data-pd-close aria-label="Mbyll">×</button>
        </header>
        <p class="pd-note">Këto barna i sheh vetëm ti dhe nuk janë pjesë e regjistrit zyrtar. Trajtoji si shënime klinike të tuat.</p>
        <div data-pd-list></div>
        <form class="pd-form" data-pd-form>
          <label class="pd-field"><span>Emri i barit *</span><input data-pd-name name="name" type="text" required maxlength="300"></label>
          <div class="pd-fields" data-pd-fields></div>
          <label class="pd-shared" data-pd-shared-row hidden>
            <input type="checkbox" data-pd-shared>
            <span>Shtoje në regjistrin e përbashkët — do ta shohin të gjithë përdoruesit</span>
          </label>
          <div class="pd-actions">
            <button type="submit" class="pd-primary" data-pd-submit>Shto barin</button>
            <button type="button" data-pd-cancel-edit hidden>Anulo ndryshimin</button>
          </div>
        </form>
        <p class="pd-message" data-pd-message role="status" aria-live="polite"></p>
      </div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('[data-pd-close]')) return close();

      const edit = event.target.closest('[data-pd-edit]');
      if (edit) {
        editingId = edit.dataset.pdEdit;
        setMessage('');
        render();
        overlay.querySelector('[data-pd-name]')?.focus();
        return;
      }

      const remove = event.target.closest('[data-pd-delete]');
      if (remove) {
        library()?.deletePersonalDrug(remove.dataset.pdDelete);
        if (editingId === remove.dataset.pdDelete) editingId = '';
        setMessage('Bari u fshi.');
        render();
        return;
      }

      if (event.target.closest('[data-pd-cancel-edit]')) {
        editingId = '';
        setMessage('');
        render();
      }
    });

    overlay.querySelector('[data-pd-form]').addEventListener('submit', event => {
      event.preventDefault();
      void submit(event.currentTarget);
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && overlay && !overlay.hidden) close();
    });
  }

  function readForm(form) {
    const name = String(form.querySelector('[data-pd-name]').value || '').trim();
    const fields = {};
    FIELDS.forEach(field => {
      const value = String(form.querySelector(`[name="${field.name}"]`)?.value || '').trim();
      if (value) fields[field.name] = value;
    });
    return { name, fields };
  }

  // An admin publishing to the shared registry goes through the clinical editor,
  // which re-verifies admin standing server-side before it writes.
  async function createSharedDrug(entry) {
    const response = await fetch('/api/clinical-editor', {
      method:'POST',
      credentials:'same-origin',
      cache:'no-store',
      headers:{ 'Content-Type':'application/json', Accept:'application/json', 'X-CSRF-Token':csrfToken },
      body:JSON.stringify({
        tradeName:entry.name,
        activeSubstance:entry.fields.activeSubstance,
        strength:entry.fields.strength,
        pharmaceuticalForm:entry.fields.form,
        atcCode:entry.fields.atcCode,
        drugClass:entry.fields.classification,
        manufacturer:entry.fields.manufacturer,
        useText:entry.fields.indications,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `Bari i përbashkët nuk u ruajt (${response.status}).`);
    }
    return payload.drug;
  }

  async function submit(form) {
    const entry = readForm(form);
    if (!entry.name) return setMessage('Bari duhet të ketë së paku emrin.', true);

    const shared = isAdmin && !editingId && form.querySelector('[data-pd-shared]')?.checked;
    const button = form.querySelector('[data-pd-submit]');
    button.disabled = true;
    setMessage('');
    try {
      if (shared) {
        const created = await createSharedDrug(entry);
        setMessage(`«${created.tradeName}» u shtua në regjistrin e përbashkët. E shohin të gjithë.`);
      } else {
        library()?.savePersonalDrug({ clientId:editingId, name:entry.name, fields:entry.fields });
        setMessage(editingId ? 'Ndryshimi u ruajt.' : 'Bari u shtua në bibliotekën tënde.');
        editingId = '';
      }
      form.reset();
      render();
    } catch (error) {
      setMessage(error.message || 'Ruajtja dështoi.', true);
    } finally {
      button.disabled = false;
    }
  }

  function open() {
    if (!overlay) build();
    overlay.hidden = false;
    document.body.classList.add('pd-open');
    editingId = '';
    setMessage('');
    render();
    overlay.querySelector('[data-pd-name]')?.focus();
  }

  function close() {
    if (!overlay) return;
    overlay.hidden = true;
    document.body.classList.remove('pd-open');
    if (location.hash === HASH) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  // The launcher is deliberately a full-width block placed *after* the personal
  // navigation, not another control inside it. The mobile navigation is already
  // tight at 320px, and an extra inline item there can push the document wider
  // than the viewport — which the responsive audit rejects, rightly.
  function attachLauncher() {
    const anchor = document.querySelector('[data-personal-view="favorites"], [data-nav="favorites"], [data-mi-shell-action="favorites"]');
    if (!anchor || document.querySelector('[data-pd-launch]')) return;
    const host = anchor.parentElement;
    if (!host) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pd-launch';
    button.setAttribute('data-pd-launch', '');
    button.textContent = 'Barnat e mia';
    button.addEventListener('click', event => {
      event.preventDefault();
      open();
    });
    host.insertAdjacentElement('afterend', button);
  }

  window.addEventListener('hashchange', () => {
    if (location.hash === HASH) open();
  });

  function start() {
    attachLauncher();
    void detectAdmin().then(() => { if (overlay && !overlay.hidden) render(); });
    if (location.hash === HASH) open();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();

  window.MedIndexPersonalDrugs = Object.freeze({
    open,
    close,
    fields:FIELDS.map(field => field.name),
    isAdmin:() => isAdmin,
  });
})();
