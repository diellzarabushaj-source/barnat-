(() => {
  let scheduled = false;
  let hashHandled = false;
  const PROTOCOL_STORAGE_KEY = 'regjistriBarnave_protokollet_v1';

  function ensureStyles() {
    if (document.getElementById('nameDisplayStyles')) return;
    const style = document.createElement('style');
    style.id = 'nameDisplayStyles';
    style.textContent = `
      td.name { min-width: 300px; max-width: 340px; }
      .drug-name-layout {
        width: 100%;
        min-width: 0;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 7px;
      }
      .drug-name-text {
        min-width: 0;
        width: 100%;
        padding: 2px 0;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        font-weight: inherit;
        line-height: 1.35;
        text-align: left;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        cursor: zoom-in;
      }
      .drug-name-text:focus-visible {
        outline: 2px solid var(--amber, #c77d1f);
        outline-offset: 3px;
        border-radius: 3px;
      }
      td.name.name-expanded { max-width: 470px; }
      td.name.name-expanded .drug-name-layout {
        min-width: 390px;
        max-width: 470px;
        align-items: start;
      }
      td.name.name-expanded .drug-name-text {
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
        cursor: zoom-out;
      }
      .app-menu-link[data-nav="classification"] .app-menu-icon svg { width: 27px; height: 27px; }
      .generic-prescription-note {
        margin: 0 0 12px;
        padding: 9px 12px;
        border: 1px solid #cbd8d3;
        border-left: 4px solid var(--teal, #155e63);
        border-radius: 8px;
        background: #f5faf8;
        color: #536467;
        font-size: .72rem;
        line-height: 1.45;
      }
      .generic-prescription-note strong { color: var(--teal-dark, #0d3d40); }
      html[data-theme="dark"] .generic-prescription-note {
        background: #142124;
        color: #b7c5c2;
        border-color: #35484a;
      }
      html[data-theme="dark"] .generic-prescription-note strong { color: #edf5f2; }
      @media (max-width: 720px) {
        td.name { min-width: 255px; max-width: 285px; }
        td.name.name-expanded,
        td.name.name-expanded .drug-name-layout { min-width: 300px; max-width: 360px; }
      }
    `;
    document.head.appendChild(style);
  }

  function fullDrugName(cell) {
    const row = cell.closest('tr');
    if (row?.dataset.drugName) return row.dataset.drugName;
    const clone = cell.cloneNode(true);
    clone.querySelectorAll('.favorite-marker, .drug-actions-trigger, .drug-name-text').forEach(node => node.remove());
    return (cell.getAttribute('title') || clone.textContent || '').trim();
  }

  function decorateNameCell(cell) {
    if (cell.querySelector('.drug-name-layout')) return;
    const fullName = fullDrugName(cell);
    if (!fullName) return;

    const marker = cell.querySelector('.favorite-marker');
    const trigger = cell.querySelector('.drug-actions-trigger');
    const layout = document.createElement('div');
    layout.className = 'drug-name-layout';

    const nameButton = document.createElement('button');
    nameButton.type = 'button';
    nameButton.className = 'drug-name-text';
    nameButton.textContent = fullName;
    nameButton.title = fullName;
    nameButton.setAttribute('aria-label', 'Shfaq emrin e plotë: ' + fullName);
    nameButton.setAttribute('aria-expanded', 'false');
    nameButton.addEventListener('click', event => {
      event.stopPropagation();
      const expanded = cell.classList.toggle('name-expanded');
      nameButton.setAttribute('aria-expanded', String(expanded));
    });

    cell.replaceChildren();
    if (marker) layout.appendChild(marker);
    else {
      const spacer = document.createElement('span');
      spacer.className = 'favorite-marker';
      spacer.textContent = '★';
      layout.appendChild(spacer);
    }
    layout.appendChild(nameButton);
    if (trigger) layout.appendChild(trigger);
    cell.appendChild(layout);
    cell.title = fullName;
  }

  function decorateNames() {
    document.querySelectorAll('#tbody td.name').forEach(decorateNameCell);
  }

  function addClassificationNav() {
    const menu = document.getElementById('appMenu');
    if (!menu || menu.querySelector('[data-nav="classification"]')) return;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'app-menu-link';
    item.dataset.nav = 'classification';
    item.innerHTML = `
      <span class="app-menu-icon">
        <svg fill="none" viewBox="0 0 256 256" aria-hidden="true">
          <rect x="36" y="36" width="76" height="76" rx="14" stroke="currentColor" stroke-width="16"/>
          <rect x="144" y="36" width="76" height="76" rx="14" stroke="currentColor" stroke-width="16"/>
          <rect x="36" y="144" width="76" height="76" rx="14" stroke="currentColor" stroke-width="16"/>
          <rect x="144" y="144" width="76" height="76" rx="14" stroke="currentColor" stroke-width="16"/>
        </svg>
      </span>
      <span class="app-menu-title">Klasifikimi</span>`;
    item.addEventListener('click', () => { window.location.href = 'klasifikimi.html'; });
    const protocols = menu.querySelector('[data-nav="protocols"]');
    if (protocols) protocols.before(item); else menu.appendChild(item);
  }

  function handleIncomingHash() {
    if (hashHandled || !document.getElementById('appMenu')) return;
    const hash = location.hash.toLocaleLowerCase('sq');
    const target = hash === '#recetat' ? 'protocols' : hash === '#favoritet' ? 'favorites' : hash === '#kerko' ? 'search' : '';
    if (!target) { hashHandled = true; return; }
    const button = document.querySelector(`.app-menu-link[data-nav="${target}"]`);
    if (!button) return;
    hashHandled = true;
    setTimeout(() => {
      button.click();
      history.replaceState(null, '', location.pathname + location.search);
    }, 80);
  }

  function readProtocols() {
    try {
      const value = JSON.parse(localStorage.getItem(PROTOCOL_STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function genericName(item) {
    return String(item?.substance || item?.tradeName || 'Bar pa emër').trim();
  }

  function genericProtocol(protocol) {
    return {
      ...(protocol || {}),
      items: Array.isArray(protocol?.items)
        ? protocol.items.map(item => ({
            ...item,
            originalTradeName: item.tradeName || '',
            tradeName: genericName(item),
            substance: ''
          }))
        : []
    };
  }

  function addGenericPolicyNote() {
    const list = document.getElementById('protocolDrugList');
    if (!list || document.getElementById('genericPrescriptionNote')) return;
    const note = document.createElement('div');
    note.id = 'genericPrescriptionNote';
    note.className = 'generic-prescription-note';
    note.innerHTML = '<strong>Rregulli i recetës:</strong> Rp. përdor gjithmonë emrin gjenerik / substancën aktive. Emri tregtar ruhet vetëm si referencë e produktit në regjistër.';
    list.before(note);
  }

  function decorateProtocolDrug(article) {
    const generic = String(article.dataset.substance || article.dataset.tradeName || '').trim();
    const originalTrade = String(article.dataset.brandName || article.dataset.tradeName || '').trim();
    if (!generic) return;

    if (!article.dataset.brandName) article.dataset.brandName = originalTrade;
    article.dataset.tradeName = generic;

    const title = article.querySelector('.protocol-drug-title');
    if (title && title.textContent !== generic) title.textContent = generic;

    const meta = article.querySelector('.protocol-drug-meta');
    if (meta) {
      const details = [];
      if (originalTrade && originalTrade.toLocaleLowerCase('sq') !== generic.toLocaleLowerCase('sq')) details.push('Produkt në regjistër: ' + originalTrade);
      if (article.dataset.strength) details.push(article.dataset.strength);
      if (article.dataset.form) details.push(article.dataset.form);
      if (article.dataset.atc) details.push('ATC ' + article.dataset.atc);
      const value = details.join(' · ');
      if (meta.textContent !== value) meta.textContent = value;
    }

    const preview = article.querySelector('.protocol-drug-rp');
    if (preview) {
      const prefix = article.querySelector('[data-item-field="prefix"]')?.value?.trim() || '';
      const strength = String(article.dataset.strength || '').trim();
      preview.innerHTML = '<b>Rp.</b>' + [prefix, generic, strength].filter(Boolean).join(' ');
    }
  }

  function decorateProtocolDrugs() {
    addGenericPolicyNote();
    document.querySelectorAll('#protocolDrugList .protocol-drug').forEach(decorateProtocolDrug);
  }

  function visibleProtocol() {
    const body = document.getElementById('miBody');
    if (!body) return null;
    const name = body.querySelector('.mi-rx-title h2')?.textContent?.trim() || '';
    const count = body.querySelectorAll('.mi-rx-item').length;
    return readProtocols()
      .filter(protocol => (!name || String(protocol.name || '').trim() === name) && (!count || (protocol.items || []).length === count))
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0] || null;
  }

  function rewriteSavedPrescriptionView() {
    const protocol = visibleProtocol();
    if (!protocol) return;
    document.querySelectorAll('#miBody .mi-rx-item').forEach((section, index) => {
      const item = protocol.items?.[index];
      if (!item) return;
      const generic = genericName(item);
      const heading = section.querySelector('h3');
      if (heading && heading.textContent !== [item.prefix, generic, item.strength].filter(Boolean).join(' ')) {
        heading.textContent = [item.prefix, generic, item.strength].filter(Boolean).join(' ');
      }
      const details = section.querySelector('p');
      if (details) {
        const parts = [];
        if (item.tradeName && item.tradeName.toLocaleLowerCase('sq') !== generic.toLocaleLowerCase('sq')) parts.push('Produkt në regjistër: ' + item.tradeName);
        if (item.form) parts.push(item.form);
        if (item.atc) parts.push('ATC ' + item.atc);
        details.textContent = parts.join(' · ');
        details.hidden = !parts.length;
      }
    });
  }

  function wrapProtocolToText() {
    const original = window.protocolToText;
    if (typeof original !== 'function' || original.__genericPolicy) return;
    const wrapped = protocol => original(genericProtocol(protocol));
    wrapped.__genericPolicy = true;
    window.protocolToText = wrapped;
  }

  function wrapPrescriptionView() {
    const view = window.MedIndexPrescriptionView;
    if (!view || view.__genericPolicy) return;
    const originalMarkup = view.markup?.bind(view);
    const originalPrint = view.print?.bind(view);
    if (originalMarkup) view.markup = protocol => originalMarkup(genericProtocol(protocol));
    if (originalPrint) view.print = protocol => originalPrint(genericProtocol(protocol));
    view.__genericPolicy = true;
  }

  function bindSavedViewActions() {
    const overlay = document.getElementById('miOverlay');
    if (!overlay || overlay.dataset.genericActions) return;
    overlay.dataset.genericActions = '1';
    overlay.addEventListener('click', async event => {
      const action = event.target.closest('[data-a]')?.dataset.a;
      if (action !== 'copy' && action !== 'print') return;
      const protocol = visibleProtocol();
      if (!protocol) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (action === 'copy') {
        const text = window.protocolToText ? window.protocolToText(protocol) : '';
        try { await navigator.clipboard.writeText(text); } catch {}
        window.showProtocolToast?.('Receta me emra gjenerikë u kopjua.');
      } else {
        window.MedIndexPrescriptionView?.print?.(protocol);
      }
    }, true);
  }

  function applyGenericPrescriptionPolicy() {
    decorateProtocolDrugs();
    wrapProtocolToText();
    wrapPrescriptionView();
    rewriteSavedPrescriptionView();
    bindSavedViewActions();
  }

  function decorate() {
    scheduled = false;
    ensureStyles();
    addClassificationNav();
    decorateNames();
    handleIncomingHash();
    applyGenericPrescriptionPolicy();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(decorate);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('input', event => {
    if (event.target.closest('#protocolDrugList')) schedule();
  }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorate, { once: true });
  else decorate();
})();