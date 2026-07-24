(() => {
  'use strict';

  const VERSION = 'production-audit-v1';
  const QUERY_KEY = 'medindex_global_query_v1';
  const DIAGNOSIS_KEY = 'medindex_rx_diagnosis_v1';
  const DRAFT_KEY = 'medindex_rx_autodraft_v1';
  const PRESCRIPTIONS_KEY = 'regjistriBarnave_protokollet_v1';
  const DRAFT_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
  const ROUTES = [
    { path:'/index.html', label:'Barnat', detail:'Kërko bar, substancë, ATC ose përdorim', selector:'#search', keywords:'bar barna substanca atc regjistri' },
    { path:'/klasifikimi.html', label:'Klasifikimi ATC', detail:'Grupet dhe nën-grupet terapeutike', selector:'#atcSearch', keywords:'klasifikimi atc grupe' },
    { path:'/icd.html', label:'ICD', detail:'Kërko diagnozë ose kod klinik', selector:'#icdSmartSearch,#icdSearch', keywords:'icd diagnoza kod' },
    { path:'/analizat.html', label:'Analizat', detail:'Kërko analizë laboratorike', selector:'#labSearch', keywords:'analiza laborator hemogram biokimi' },
    { path:'/dozologjia.html', label:'Dozologjia', detail:'Skemat e verifikuara të dozimit', selector:'#dosageSearch', keywords:'doza dozologji pediatri' },
    { path:'/protokollet.html', label:'Protokollet', detail:'Dokumentet zyrtare klinike', selector:'#protocolSearch', keywords:'protokoll udhezues dokument' },
    { path:'/recetat.html', label:'Recetat', detail:'Krijo, kontrollo dhe ruaj recetën', selector:'#rxDrugSearch', keywords:'recete prescription bari' },
  ];

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const normalize = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sq');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const currentPath = () => location.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
  const isCurrent = path => path === '/index.html' ? ['/', '/index.html'].includes(currentPath()) : currentPath() === path;

  function injectStyles() {
    if (document.getElementById('clinicalWorkflowStyles')) return;
    const style = document.createElement('style');
    style.id = 'clinicalWorkflowStyles';
    style.textContent = `
      .mi-global-search{position:relative}.mi-command-palette{position:absolute;top:calc(100% + 8px);left:0;right:0;z-index:1200;max-height:min(430px,70vh);overflow:auto;padding:7px;border:1px solid var(--mi-gray-200,#e4e7ec);border-radius:14px;background:var(--mi-white,#fff);box-shadow:0 22px 60px rgba(16,24,40,.18)}
      .mi-command-palette[hidden]{display:none}.mi-command-item{width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 11px;border:0;border-radius:10px;background:transparent;color:var(--mi-gray-900,#101828);text-align:left;cursor:pointer}.mi-command-item:hover,.mi-command-item[aria-selected="true"]{background:var(--mi-brand-50,#eef4ff);color:var(--mi-brand-700,#3538cd)}
      .mi-command-item strong,.mi-command-item small{display:block}.mi-command-item strong{font-size:13px}.mi-command-item small{margin-top:3px;color:var(--mi-gray-500,#667085);font-size:11px}.mi-command-item kbd{font:700 10px/1 var(--mi-font,system-ui);color:var(--mi-gray-500,#667085)}
      .mi-command-empty{padding:14px;color:var(--mi-gray-500,#667085);font-size:12px;text-align:center}
      .mi-data-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.mi-data-tool{min-height:36px;padding:0 12px;border:1px solid var(--mi-gray-300,#d0d5dd);border-radius:9px;background:var(--mi-white,#fff);color:var(--mi-gray-700,#344054);font:700 12px/1 var(--mi-font,system-ui);cursor:pointer}.mi-data-tool:hover{background:var(--mi-gray-50,#f9fafb)}
      .mi-use-diagnosis{display:inline-flex;align-items:center;justify-content:center;min-height:38px;margin-left:auto;padding:0 13px;border:0;border-radius:9px;background:var(--mi-brand-600,#465fff);color:#fff;font:750 12px/1 var(--mi-font,system-ui);cursor:pointer}.mi-use-diagnosis:hover{filter:brightness(.96)}
      .rx-toast .mi-toast-action{margin-left:10px;padding:5px 8px;border:1px solid currentColor;border-radius:7px;background:transparent;color:inherit;font:inherit;font-weight:800;cursor:pointer}
      .mi-draft-note{display:inline-flex;align-items:center;gap:6px;margin-left:8px;color:var(--mi-gray-500,#667085);font-size:11px}.mi-draft-note::before{content:'';width:6px;height:6px;border-radius:50%;background:#12b76a}
      html[data-theme="dark"] .mi-command-palette{background:#101828;border-color:#344054}.dark .mi-command-item,html[data-theme="dark"] .mi-command-item{color:#f2f4f7}.dark .mi-command-item:hover,html[data-theme="dark"] .mi-command-item:hover,.dark .mi-command-item[aria-selected="true"],html[data-theme="dark"] .mi-command-item[aria-selected="true"]{background:#182230}.dark .mi-data-tool,html[data-theme="dark"] .mi-data-tool{background:#182230;border-color:#344054;color:#eaecf0}
      @media(max-width:760px){.mi-command-palette{position:fixed;top:74px;left:12px;right:12px;max-height:calc(100dvh - 92px)}.mi-data-tools{width:100%}.mi-data-tool{flex:1}}
    `;
    document.head.appendChild(style);
  }

  function loadScriptOnce(src, marker) {
    return new Promise((resolve, reject) => {
      if (marker && window[marker]) return resolve(window[marker]);
      const existing = document.querySelector(`script[src^="${src.split('?')[0]}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve(marker ? window[marker] : true), { once:true });
        existing.addEventListener('error', reject, { once:true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.onload = () => resolve(marker ? window[marker] : true);
      script.onerror = () => reject(new Error(`Nuk u ngarkua ${src}.`));
      document.head.appendChild(script);
    });
  }

  async function localRegistry() {
    if (window.MedIndexLocalRegistry) return window.MedIndexLocalRegistry;
    await loadScriptOnce(`/local-registry.js?v=${VERSION}`, 'MedIndexLocalRegistry');
    return window.MedIndexLocalRegistry;
  }

  function routeWithQuery(path, query, mode = 'search') {
    try { sessionStorage.setItem(QUERY_KEY, JSON.stringify({ path, query:clean(query), mode, createdAt:Date.now() })); } catch {}
    if (isCurrent(path)) return applyTransferredQuery();
    location.href = path;
  }

  function pageSearchInput(route = ROUTES.find(item => isCurrent(item.path))) {
    if (!route) return null;
    return route.selector.split(',').map(selector => document.querySelector(selector.trim())).find(Boolean) || null;
  }

  function applyTransferredQuery() {
    let transfer = null;
    try { transfer = JSON.parse(sessionStorage.getItem(QUERY_KEY) || 'null'); } catch {}
    if (!transfer || !isCurrent(transfer.path) || Date.now() - Number(transfer.createdAt || 0) > 60000) return false;
    try { sessionStorage.removeItem(QUERY_KEY); } catch {}
    const route = ROUTES.find(item => isCurrent(item.path));
    const query = clean(transfer.query);
    if (transfer.mode === 'drug' && isCurrent('/recetat.html')) {
      document.querySelector('[data-rx-command="drug"]')?.click();
      setTimeout(() => {
        const input = document.getElementById('rxDrugSearch');
        if (!input) return;
        input.value = query;
        input.dispatchEvent(new Event('input', { bubbles:true }));
        input.focus();
      }, 60);
      return true;
    }
    const input = pageSearchInput(route);
    if (!input) return false;
    input.value = query;
    input.dispatchEvent(new Event('input', { bubbles:true }));
    input.dispatchEvent(new Event('change', { bubbles:true }));
    input.scrollIntoView({ block:'center', behavior:matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' });
    setTimeout(() => input.focus({ preventScroll:true }), 80);
    return true;
  }

  function installCommandPalette() {
    const input = document.getElementById('miGlobalSearch');
    const host = input?.closest('.mi-global-search');
    if (!input || !host || host.dataset.clinicalPalette === '1') return;
    host.dataset.clinicalPalette = '1';
    const palette = document.createElement('div');
    palette.className = 'mi-command-palette';
    palette.id = 'miCommandPalette';
    palette.role = 'listbox';
    palette.hidden = true;
    host.appendChild(palette);
    input.setAttribute('aria-controls', palette.id);
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-autocomplete', 'list');
    let actions = [];
    let activeIndex = 0;

    const close = () => {
      palette.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    };

    const buildActions = query => {
      const normalizedQuery = normalize(query);
      const base = [];
      if (query) {
        const current = ROUTES.find(route => isCurrent(route.path));
        if (current) base.push({
          label:`Kërko “${query}” te ${current.label}`,
          detail:'Filtro seksionin ku je tani',
          hint:'Enter',
          run:() => routeWithQuery(current.path, query, current.path === '/recetat.html' ? 'drug' : 'search'),
        });
        base.push({ label:`Kërko bar “${query}”`, detail:'Regjistri i barnave', hint:'Barnat', run:() => routeWithQuery('/index.html', query) });
        base.push({ label:`Shto barin “${query}” në recetë`, detail:'Kërkim lokal në Receta', hint:'Recetë', run:() => routeWithQuery('/recetat.html', query, 'drug') });
        base.push({ label:`Kërko diagnozën “${query}”`, detail:'ICD-10', hint:'ICD', run:() => routeWithQuery('/icd.html', query) });
        base.push({ label:`Kërko analizën “${query}”`, detail:'Analizat laboratorike', hint:'Lab', run:() => routeWithQuery('/analizat.html', query) });
        base.push({ label:`Kërko dozologjinë “${query}”`, detail:'Skemat e verifikuara', hint:'Doza', run:() => routeWithQuery('/dozologjia.html', query) });
        base.push({ label:`Kërko protokollin “${query}”`, detail:'Dokumentet zyrtare', hint:'PDF', run:() => routeWithQuery('/protokollet.html', query) });
      }
      const routes = ROUTES
        .filter(route => !normalizedQuery || normalize(`${route.label} ${route.detail} ${route.keywords}`).includes(normalizedQuery))
        .map(route => ({
          label:route.label,
          detail:route.detail,
          hint:isCurrent(route.path) ? 'Aktive' : 'Hape',
          run:() => routeWithQuery(route.path, query, route.path === '/recetat.html' && query ? 'drug' : 'search'),
        }));
      return [...base, ...routes].slice(0, query ? 9 : 7);
    };

    const render = () => {
      actions = buildActions(clean(input.value));
      activeIndex = Math.min(activeIndex, Math.max(0, actions.length - 1));
      palette.innerHTML = actions.length ? actions.map((action, index) => `<button id="miCommand${index}" class="mi-command-item" type="button" role="option" data-command-index="${index}" aria-selected="${index === activeIndex}"><span><strong>${esc(action.label)}</strong><small>${esc(action.detail)}</small></span><kbd>${esc(action.hint || '')}</kbd></button>`).join('') : '<div class="mi-command-empty">Nuk u gjet asnjë komandë.</div>';
      palette.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      input.setAttribute('aria-activedescendant', actions.length ? `miCommand${activeIndex}` : '');
    };

    const select = index => {
      const action = actions[index];
      if (!action) return;
      close();
      action.run();
    };

    input.addEventListener('focus', render);
    input.addEventListener('input', render, { passive:true });
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (palette.hidden) render();
        activeIndex = actions.length ? (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + actions.length) % actions.length : 0;
        render();
        palette.querySelector(`[data-command-index="${activeIndex}"]`)?.scrollIntoView({ block:'nearest' });
      } else if (event.key === 'Enter' && !palette.hidden) {
        event.preventDefault();
        event.stopImmediatePropagation();
        select(activeIndex);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
        input.blur();
      }
    }, true);
    palette.addEventListener('mousedown', event => event.preventDefault());
    palette.addEventListener('click', event => {
      const button = event.target.closest('[data-command-index]');
      if (button) select(Number(button.dataset.commandIndex));
    });
    document.addEventListener('click', event => { if (!host.contains(event.target)) close(); });
  }

  function readPrescriptions() {
    try {
      const value = JSON.parse(localStorage.getItem(PRESCRIPTIONS_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  function writePrescriptions(items) {
    localStorage.setItem(PRESCRIPTIONS_KEY, JSON.stringify(items));
    document.getElementById('rxSavedSearch')?.dispatchEvent(new Event('input', { bubbles:true }));
  }

  function showToastAction(message, label, action) {
    const toast = document.getElementById('rxToast');
    if (!toast) return;
    toast.innerHTML = `<span>${esc(message)}</span><button class="mi-toast-action" type="button">${esc(label)}</button>`;
    toast.classList.add('show');
    const button = toast.querySelector('button');
    button?.addEventListener('click', () => {
      action();
      toast.classList.remove('show');
    }, { once:true });
    clearTimeout(showToastAction.timer);
    showToastAction.timer = setTimeout(() => toast.classList.remove('show'), 6500);
  }

  function installPrescriptionBackupTools() {
    const sectionHead = document.querySelector('.rx-saved-section .med-section-head');
    if (!sectionHead || sectionHead.querySelector('.mi-data-tools')) return;
    const tools = document.createElement('div');
    tools.className = 'mi-data-tools';
    tools.innerHTML = '<button class="mi-data-tool" type="button" data-rx-export>Eksporto kopjen</button><button class="mi-data-tool" type="button" data-rx-import>Importo kopjen</button><input type="file" accept="application/json,.json" data-rx-import-file hidden>';
    sectionHead.appendChild(tools);
    tools.querySelector('[data-rx-export]')?.addEventListener('click', () => {
      const payload = { schema:'medindex-prescriptions', version:1, exportedAt:new Date().toISOString(), prescriptions:readPrescriptions() };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `medindex-recetat-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    const fileInput = tools.querySelector('[data-rx-import-file]');
    tools.querySelector('[data-rx-import]')?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) return alert('Kopja është tepër e madhe.');
      try {
        const parsed = JSON.parse(await file.text());
        const incoming = Array.isArray(parsed) ? parsed : parsed?.prescriptions;
        if (!Array.isArray(incoming) || incoming.length > 500 || incoming.some(item => !item || typeof item !== 'object')) throw new Error('Formati nuk është i vlefshëm.');
        if (!confirm(`Të importohen ${incoming.length} receta dhe të bashkohen me kopjen lokale?`)) return;
        const merged = new Map(readPrescriptions().map(item => [String(item.id || crypto.randomUUID()), item]));
        incoming.forEach(item => merged.set(String(item.id || crypto.randomUUID()), item));
        writePrescriptions([...merged.values()].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))));
        showToastAction('Recetat u importuan.', 'Në rregull', () => {});
      } catch (error) {
        alert(error.message || 'Kopja nuk u importua.');
      }
    });
  }

  function readDraft() {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (!draft || draft.version !== 1 || Date.now() - Number(draft.savedAt || 0) > DRAFT_MAX_AGE) return null;
      return draft;
    } catch { return null; }
  }

  function installPrescriptionDraft() {
    const composer = document.getElementById('rxComposer');
    const diagnosis = document.getElementById('rxDiagnosis');
    if (!composer || !diagnosis || composer.dataset.clinicalDraft === '1') return;
    composer.dataset.clinicalDraft = '1';
    let dirty = false;
    let saveTimer = 0;
    const note = document.createElement('span');
    note.className = 'mi-draft-note';
    note.hidden = true;
    note.textContent = 'Drafti ruhet automatikisht';
    document.querySelector('.rx-editor-hint')?.appendChild(note);

    const clearDraft = () => {
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      dirty = false;
      note.hidden = true;
    };
    const saveDraft = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const content = composer.value;
        const diagnostic = diagnosis.value;
        if (!clean(content) && !clean(diagnostic)) return clearDraft();
        try {
          localStorage.setItem(DRAFT_KEY, JSON.stringify({ version:1, savedAt:Date.now(), composer:content, diagnosis:diagnostic }));
          note.hidden = false;
        } catch {}
      }, 350);
    };
    const markDirty = event => {
      if (event.isTrusted !== false) dirty = true;
      saveDraft();
    };
    composer.addEventListener('input', markDirty, { passive:true });
    diagnosis.addEventListener('input', markDirty, { passive:true });

    const draft = readDraft();
    if (draft && !clean(composer.value) && !clean(diagnosis.value)) {
      composer.value = String(draft.composer || '');
      diagnosis.value = String(draft.diagnosis || '');
      composer.dispatchEvent(new Event('input', { bubbles:true }));
      diagnosis.dispatchEvent(new Event('input', { bubbles:true }));
      dirty = true;
      note.hidden = false;
      const status = document.getElementById('rxStatus');
      if (status && !clean(status.textContent)) status.textContent = 'Drafti i fundit u rikthye automatikisht.';
    }

    document.addEventListener('click', event => {
      const clearButton = event.target.closest('#rxClear,#rxNew');
      if (!clearButton) return;
      if (dirty && (clean(composer.value) || clean(diagnosis.value)) && !confirm('Të hidhen ndryshimet e paruajtura të kësaj recete?')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      clearDraft();
    }, true);
    document.getElementById('rxSave')?.addEventListener('click', () => {
      setTimeout(() => {
        if (document.getElementById('rxStatus')?.classList.contains('is-success')) clearDraft();
      }, 120);
    });
    window.addEventListener('beforeunload', event => {
      if (!dirty || (!clean(composer.value) && !clean(diagnosis.value))) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  function renderLocalDrugResults(holder, results, source = 'Kopja lokale') {
    const Core = window.MedIndexPrescriptionFormat;
    holder.innerHTML = results.length
      ? `<p class="rx-local-source">${esc(source)} · ${results.length} rezultate</p>${results.map(drug => `<button class="rx-drug-result" type="button" data-drug-result="${esc(encodeURIComponent(JSON.stringify(drug)))}"><span><strong>${esc(drug.substance || drug.tradeName)}</strong><small>${esc([drug.tradeName, drug.strength, Core?.formLabel?.(drug.form) || drug.form].filter(Boolean).join(' · '))}</small></span><span>+</span></button>`).join('')}`
      : '<p>Nuk u gjet asnjë bar.</p>';
  }

  function installLocalDrugSearch() {
    const input = document.getElementById('rxDrugSearch');
    const holder = document.getElementById('rxDrugResults');
    if (!input || !holder || input.dataset.localSearch === '1') return;
    input.dataset.localSearch = '1';
    let timer = 0;
    let requestId = 0;
    document.addEventListener('input', event => {
      if (event.target !== input) return;
      event.stopImmediatePropagation();
      clearTimeout(timer);
      const query = clean(input.value);
      if (query.length < 2) {
        holder.innerHTML = '<p>Shkruaj së paku 2 shkronja.</p>';
        return;
      }
      const currentRequest = ++requestId;
      holder.innerHTML = '<p>Duke kërkuar në databazën lokale…</p>';
      timer = setTimeout(async () => {
        try {
          const registry = await localRegistry();
          const results = await registry.search(query, { limit:12 });
          if (currentRequest !== requestId) return;
          renderLocalDrugResults(holder, results);
        } catch (localError) {
          if (!navigator.onLine) {
            holder.innerHTML = '<p>Regjistri nuk është sinkronizuar ende në këtë pajisje.</p>';
            return;
          }
          try {
            const response = await fetch(`/api/drug-search?q=${encodeURIComponent(query)}`, { credentials:'same-origin', headers:{ Accept:'application/json' } });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Kërkimi dështoi.');
            if (currentRequest === requestId) renderLocalDrugResults(holder, payload.results || [], 'Burimi online');
          } catch (error) {
            if (currentRequest === requestId) holder.innerHTML = `<p>${esc(error.message || localError.message)}</p>`;
          }
        }
      }, 70);
    }, true);
  }

  function installPrescriptionDiagnosis() {
    const input = document.getElementById('rxDiagnosis');
    if (!input || clean(input.value)) return;
    let diagnosis = '';
    try {
      diagnosis = sessionStorage.getItem(DIAGNOSIS_KEY) || '';
      sessionStorage.removeItem(DIAGNOSIS_KEY);
    } catch {}
    if (!diagnosis) return;
    input.value = diagnosis;
    input.dispatchEvent(new Event('input', { bubbles:true }));
    const status = document.getElementById('rxStatus');
    if (status) status.textContent = 'Diagnoza u bart nga ICD-ja. Kontrolloje para ruajtjes.';
  }

  function installICDTransfer() {
    if (!isCurrent('/icd.html')) return;
    const detailBody = document.getElementById('detailBody');
    if (!detailBody) return;
    const inject = () => {
      const source = detailBody.querySelector('.med-source');
      if (!source || source.querySelector('[data-use-icd-diagnosis]')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mi-use-diagnosis';
      button.dataset.useIcdDiagnosis = '1';
      button.textContent = 'Përdore në recetë';
      source.appendChild(button);
    };
    new MutationObserver(inject).observe(detailBody, { childList:true, subtree:true });
    detailBody.addEventListener('click', event => {
      if (!event.target.closest('[data-use-icd-diagnosis]')) return;
      const kicker = clean(document.getElementById('detailKicker')?.textContent);
      const code = kicker.split('·').pop()?.trim() || '';
      const title = clean(document.getElementById('detailTitle')?.textContent);
      const diagnosis = [code, title].filter(Boolean).join(' — ');
      try { sessionStorage.setItem(DIAGNOSIS_KEY, diagnosis); } catch {}
      location.href = '/recetat.html';
    });
  }

  function installDeleteUndo() {
    if (!isCurrent('/recetat.html')) return;
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-delete-saved]');
      if (!button) return;
      const id = String(button.dataset.deleteSaved || '');
      const deleted = readPrescriptions().find(item => String(item.id) === id);
      if (!deleted) return;
      setTimeout(() => showToastAction('Receta u fshi.', 'Zhbëje', () => {
        const current = readPrescriptions();
        if (!current.some(item => String(item.id) === id)) writePrescriptions([deleted, ...current]);
      }), 60);
    }, true);
  }

  function installFocusTrap() {
    document.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const dialogs = [...document.querySelectorAll('#detailOverlay:not([hidden]),#rxDosageChooser:not([hidden]),[role="dialog"][aria-modal="true"]:not([hidden])')];
      const dialog = dialogs.at(-1);
      if (!dialog) return;
      const focusables = [...dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
        .filter(node => node.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }, true);
  }

  function installPrescriptionEnhancements() {
    if (!isCurrent('/recetat.html')) return;
    installPrescriptionDiagnosis();
    installPrescriptionDraft();
    installPrescriptionBackupTools();
    installLocalDrugSearch();
    installDeleteUndo();
  }

  function initializeWhenReady() {
    injectStyles();
    installCommandPalette();
    applyTransferredQuery();
    installICDTransfer();
    installPrescriptionEnhancements();
    installFocusTrap();
    window.dispatchEvent(new CustomEvent('medindex:clinical-workflow-ready', { detail:{ version:VERSION } }));
  }

  const start = () => {
    if (document.body?.dataset.clinicalWorkflowReady === '1') return;
    document.body.dataset.clinicalWorkflowReady = '1';
    initializeWhenReady();
  };

  window.addEventListener('medindex:tailadmin-ready', start, { once:true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0), { once:true });
  else setTimeout(start, 0);
})();
