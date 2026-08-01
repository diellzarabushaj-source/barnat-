(() => {
  'use strict';

  const GROUPS = window.MEDINDEX_ATC_GROUPS || {};
  const SUBGROUPS = window.MEDINDEX_ATC_SUBGROUPS || {};
  let activeCard = null;
  let activeTrigger = null;
  let rows = [];
  let loadingPromise = null;

  const text = value => String(value ?? '').trim();
  const normalize = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sq');
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const atcCode = row => text(row['ATC Code']).toUpperCase().replace(/\s+/g, '');

  function splitValues(value, field) {
    const source = text(value);
    if (!source) return [];
    if (field === 'Përdorimi (fjalë kyçe)') return source.split(/[;,|]/).map(text).filter(Boolean);
    if (field === 'Substanca aktive') return source.split(/\s*;\s*/).map(text).filter(Boolean);
    return [source];
  }

  function uniqueCount(items, field) {
    const values = new Set();
    items.forEach(row => splitValues(row[field], field).forEach(value => values.add(normalize(value))));
    values.delete('');
    return values.size;
  }

  function topValues(items, field, limit) {
    const counts = new Map();
    const labels = new Map();
    items.forEach(row => splitValues(row[field], field).forEach(value => {
      const key = normalize(value);
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
      if (!labels.has(key)) labels.set(key, value);
    }));
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || labels.get(a[0]).localeCompare(labels.get(b[0]), 'sq'))
      .slice(0, limit)
      .map(([key, count]) => ({ label: labels.get(key), count }));
  }

  function examples(items, limit = 6) {
    const seen = new Set();
    const result = [];
    for (const row of items) {
      const value = text(row['Emri tregtar']);
      const key = normalize(value);
      if (!value || seen.has(key)) continue;
      seen.add(key);
      result.push({ label: value, count:0 });
      if (result.length >= limit) break;
    }
    return result;
  }

  function listMarkup(title, values, emptyText = 'Nuk ka të dhëna të regjistruara.') {
    return `<section class="atc-info-section"><h4>${escapeHtml(title)}</h4>${values.length
      ? `<div class="atc-info-chips">${values.map(value => `<span>${escapeHtml(value.label)}${value.count ? `<small>${value.count}</small>` : ''}</span>`).join('')}</div>`
      : `<p class="atc-info-empty">${escapeHtml(emptyText)}</p>`}</section>`;
  }

  function ensurePanel() {
    let overlay = document.getElementById('atcInfoOverlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'atcInfoOverlay';
    overlay.className = 'atc-info-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `<div class="atc-info-dialog" role="dialog" aria-modal="true" aria-labelledby="atcInfoTitle"><header class="atc-info-head"><div class="atc-info-icon" aria-hidden="true">ⓘ</div><div><p>Informacion nga databaza</p><h2 id="atcInfoTitle">Kategoria ATC</h2></div><button class="atc-info-close" type="button" data-info-close aria-label="Mbyll">×</button></header><div class="atc-info-body" id="atcInfoBody"></div><footer class="atc-info-actions"><button class="atc-info-secondary" type="button" data-info-close>Mbyll</button><button class="atc-info-primary" type="button" id="atcInfoContinue"><span>Vazhdo</span><b aria-hidden="true">→</b></button></footer></div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('[data-info-close]')) closePanel();
    });
    overlay.addEventListener('keydown', trapDialogFocus);
    document.getElementById('atcInfoContinue').addEventListener('click', continueToCategory);
    return overlay;
  }

  async function getRows() {
    if (rows.length) return rows;
    if (Array.isArray(window.MEDINDEX_REGISTRY_ROWS) && window.MEDINDEX_REGISTRY_ROWS.length) {
      rows = window.MEDINDEX_REGISTRY_ROWS;
      return rows;
    }
    if (!loadingPromise) loadingPromise = Promise.resolve(window.MEDINDEX_REGISTRY_READY).then(result => {
      rows = result?.rows || window.MEDINDEX_REGISTRY_ROWS || [];
      return rows;
    });
    return loadingPromise;
  }

  function groupItems(code) {
    return rows.filter(row => atcCode(row).startsWith(code));
  }

  function render(card) {
    const code = text(card.dataset.code).toUpperCase();
    const type = card.dataset.cardType === 'group' ? 'group' : 'subgroup';
    const title = type === 'group' ? (GROUPS[code] || 'Grupi ATC') : (SUBGROUPS[code] || 'Nën-grupi ATC');
    const items = groupItems(code);
    const subgroups = new Set(items.map(row => atcCode(row).match(/^[A-Z]\d{2}/)?.[0]).filter(Boolean));
    const missing = field => items.filter(row => !text(row[field])).length;
    const audit = window.MEDINDEX_REGISTRY_AUDIT || {};

    document.getElementById('atcInfoTitle').textContent = `${code} — ${title}`;
    document.getElementById('atcInfoBody').innerHTML = `<div class="atc-info-summary"><span class="atc-info-code">${escapeHtml(code)}</span><p>${type === 'group' ? 'Grup kryesor anatomik/terapeutik' : 'Nën-grup terapeutik'} · Të dhënat llogariten nga regjistri aktual i MedIndex.</p></div><div class="atc-info-stats"><div><strong>${items.length}</strong><span>preparate</span></div><div><strong>${uniqueCount(items, 'Substanca aktive')}</strong><span>substanca</span></div><div><strong>${uniqueCount(items, 'Forma farmaceutike')}</strong><span>forma</span></div><div><strong>${type === 'group' ? subgroups.size : uniqueCount(items, 'ATC Code')}</strong><span>${type === 'group' ? 'nën-grupe' : 'kode ATC'}</span></div></div>${listMarkup('Substancat aktive më të shpeshta', topValues(items, 'Substanca aktive', 7))}${listMarkup('Klasat kryesore', topValues(items, 'Klasa / Çka është', 6))}${listMarkup('Përdorimet / fjalët kyçe', topValues(items, 'Përdorimi (fjalë kyçe)', 8))}${listMarkup('Format farmaceutike', topValues(items, 'Forma farmaceutike', 7))}${listMarkup('Statusi i preparateve', topValues(items, 'Statusi', 4))}${listMarkup('Shembuj nga regjistri', examples(items))}<div class="atc-info-quality"><span>Pa substancë: <b>${missing('Substanca aktive')}</b></span><span>Pa klasë: <b>${missing('Klasa / Çka është')}</b></span><span>Pa përdorim: <b>${missing('Përdorimi (fjalë kyçe)')}</b></span><span>Pa formë: <b>${missing('Forma farmaceutike')}</b></span></div><div class="atc-info-note"><strong>Audit i databazës:</strong> ${audit.total || rows.length} rreshta të lexuar; ${audit.validAtc ?? '—'} kode ATC me format të lexueshëm. Paneli nuk shpik të dhëna kur një fushë mungon.</div>`;

    const action = document.getElementById('atcInfoContinue');
    action.querySelector('span').textContent = type === 'group' ? 'Shiko nën-grupet' : 'Hap te Barnat';
  }

  async function openPanel(card, trigger) {
    const overlay = ensurePanel();
    activeCard = card;
    activeTrigger = trigger;
    overlay.hidden = false;
    document.body.classList.add('atc-info-open');
    requestAnimationFrame(() => overlay.classList.add('open'));
    document.getElementById('atcInfoTitle').textContent = `${text(card.dataset.code).toUpperCase()} — Duke u ngarkuar`;
    document.getElementById('atcInfoBody').innerHTML = '<div class="atc-info-loading">Duke e lexuar databazën e kontrolluar…</div>';

    try {
      await getRows();
      render(card);
    } catch (error) {
      console.error(error);
      document.getElementById('atcInfoBody').innerHTML = `<div class="atc-info-note"><strong>Databaza nuk u ngarkua:</strong> ${escapeHtml(error.message || 'Gabim i panjohur.')}</div>`;
    }
    overlay.querySelector('.atc-info-close')?.focus();
  }

  function closePanel() {
    const overlay = document.getElementById('atcInfoOverlay');
    if (!overlay || overlay.hidden) return;
    overlay.classList.remove('open');
    document.body.classList.remove('atc-info-open');
    const focusTarget = activeTrigger;
    setTimeout(() => {
      overlay.hidden = true;
      focusTarget?.focus?.({ preventScroll:true });
    }, 180);
  }

  function continueToCategory() {
    if (!activeCard) return;
    const code = text(activeCard.dataset.code).toUpperCase();
    const type = activeCard.dataset.cardType === 'group' ? 'group' : 'subgroup';
    const query = text(new URLSearchParams(location.search).get('q'));
    closePanel();
    setTimeout(() => {
      if (type === 'group') {
        if (window.MedIndexClassification?.openGroup) window.MedIndexClassification.openGroup(code);
        else location.href = `/klasifikimi.html#${encodeURIComponent(code)}`;
        return;
      }
      if (window.MedIndexClassification?.openSubgroup) window.MedIndexClassification.openSubgroup(code, query);
      else location.href = window.MedIndexATC?.registryUrl?.({ atc:code, query }) || `/index.html?atc=${encodeURIComponent(code)}`;
    }, 180);
  }

  function trapDialogFocus(event) {
    const overlay = document.getElementById('atcInfoOverlay');
    if (!overlay || overlay.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closePanel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...overlay.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      .filter(element => !element.hidden && element.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function installInfoActions() {
    document.addEventListener('click', event => {
      const trigger = event.target.closest('[data-atc-info]');
      if (!trigger) return;
      event.preventDefault();
      event.stopPropagation();
      const shell = trigger.closest('.atc-card-shell');
      const card = shell?.querySelector('.atc-card');
      if (card) void openPanel(card, trigger);
    });
  }

  function init() {
    ensurePanel();
    installInfoActions();
    window.addEventListener('medindex:registry-ready', event => { rows = event.detail?.rows || []; });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();