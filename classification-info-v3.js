(() => {
  'use strict';

  const GROUPS = window.MEDINDEX_ATC_GROUPS || {};
  const SUBGROUPS = window.MEDINDEX_ATC_SUBGROUPS || {};
  let activeCard = null;
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
      result.push({ label: value, count: 0 });
      if (result.length >= limit) break;
    }
    return result;
  }

  function listMarkup(title, values, emptyText = 'Nuk ka të dhëna të regjistruara.') {
    return `<section class="atc-info-section"><h4>${escapeHtml(title)}</h4>${values.length
      ? `<div class="atc-info-chips">${values.map(value => `<span>${escapeHtml(value.label)}${value.count ? `<small>${value.count}</small>` : ''}</span>`).join('')}</div>`
      : `<p class="atc-info-empty">${escapeHtml(emptyText)}</p>`}</section>`;
  }

  function installStyles() {
    if (document.getElementById('atcInfoStylesV3')) return;
    const style = document.createElement('style');
    style.id = 'atcInfoStylesV3';
    style.textContent = `
      body.atc-info-open{overflow:hidden}.atc-card::before{content:'i';position:absolute;right:14px;top:14px;width:27px;height:27px;border-radius:50%;display:grid;place-items:center;background:rgba(21,94,99,.1);border:1px solid rgba(21,94,99,.22);color:var(--teal);font:800 italic 14px Georgia;transition:.2s}.atc-card:hover::before,.atc-card:focus-visible::before{background:var(--teal);color:#fff;transform:scale(1.06)}
      .atc-info-overlay{position:fixed;inset:0;z-index:900;display:grid;place-items:center;padding:22px;background:rgba(4,15,17,.72);backdrop-filter:blur(8px);opacity:0;transition:opacity .18s ease}.atc-info-overlay[hidden]{display:none}.atc-info-overlay.open{opacity:1}.atc-info-dialog{position:relative;width:min(900px,100%);max-height:min(92vh,900px);display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.12);border-radius:22px;background:linear-gradient(145deg,rgba(13,35,38,.99),rgba(18,52,55,.99));color:#edf6f3;box-shadow:0 36px 110px rgba(0,0,0,.5);transform:translateY(14px) scale(.985);transition:transform .2s ease}.atc-info-overlay.open .atc-info-dialog{transform:none}
      .atc-info-head{display:grid;grid-template-columns:46px minmax(0,1fr) 40px;align-items:center;gap:12px;padding:20px 22px 17px;border-bottom:1px solid rgba(255,255,255,.1)}.atc-info-icon{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:rgba(199,125,31,.16);color:#efb765;font-size:1.1rem}.atc-info-head p{margin:0 0 3px;color:#9fb7b4;font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em}.atc-info-head h2{margin:0;font:700 clamp(1.05rem,2.5vw,1.4rem) Georgia;color:#fff}.atc-info-close{width:38px;height:38px;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:rgba(255,255,255,.06);color:#fff;font-size:1.25rem;cursor:pointer}
      .atc-info-body{overflow:auto;padding:20px 22px 24px}.atc-info-loading{padding:45px 20px;text-align:center;color:#b7c8c5}.atc-info-summary{display:flex;align-items:center;gap:12px;margin-bottom:16px}.atc-info-summary p{margin:0;color:#b7c8c5;font-size:.82rem;line-height:1.45}.atc-info-code{padding:7px 11px;border-radius:999px;background:linear-gradient(135deg,#c77d1f,#9a5d13);color:#fff;font:800 .8rem var(--mono)}.atc-info-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-bottom:19px}.atc-info-stats div{padding:13px 10px;border:1px solid rgba(255,255,255,.09);border-radius:13px;background:rgba(255,255,255,.045);text-align:center}.atc-info-stats strong{display:block;font:800 1.25rem var(--mono);color:#fff}.atc-info-stats span{display:block;margin-top:3px;color:#9fb1ae;font-size:.68rem;text-transform:uppercase;letter-spacing:.06em}
      .atc-info-section{padding:14px 0;border-top:1px solid rgba(255,255,255,.085)}.atc-info-section h4{margin:0 0 9px;color:#f3f8f6;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em}.atc-info-chips{display:flex;flex-wrap:wrap;gap:7px}.atc-info-chips>span{display:inline-flex;align-items:center;gap:7px;max-width:100%;padding:7px 9px;border:1px solid rgba(255,255,255,.1);border-radius:9px;background:rgba(255,255,255,.055);color:#dbe8e5;font-size:.77rem}.atc-info-chips small{min-width:20px;height:20px;padding:0 5px;border-radius:10px;display:grid;place-items:center;background:rgba(199,125,31,.2);color:#f2c484;font:800 .65rem var(--mono)}.atc-info-empty{margin:0;color:#91a4a1;font-size:.78rem}.atc-info-quality{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:14px}.atc-info-quality span{padding:8px;border-radius:8px;background:rgba(255,255,255,.045);color:#c7d6d3;font-size:.68rem;text-align:center}.atc-info-note{margin-top:12px;padding:12px 13px;border-left:4px solid #c77d1f;border-radius:8px;background:rgba(199,125,31,.1);color:#d8c2a1;font-size:.74rem;line-height:1.5}
      .atc-info-actions{display:flex;justify-content:flex-end;gap:9px;padding:14px 22px;border-top:1px solid rgba(255,255,255,.1);background:rgba(5,19,21,.6)}.atc-info-actions button{min-height:42px;padding:0 15px;border-radius:10px;font-weight:800;cursor:pointer}.atc-info-secondary{border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.055);color:#dce8e5}.atc-info-primary{display:flex;align-items:center;gap:9px;border:0;background:linear-gradient(135deg,#c77d1f,#155e63);color:#fff}
      @media(max-width:650px){.atc-info-overlay{padding:0;align-items:end}.atc-info-dialog{width:100%;max-height:94vh;border-radius:20px 20px 0 0}.atc-info-head,.atc-info-body,.atc-info-actions{padding-left:16px;padding-right:16px}.atc-info-stats,.atc-info-quality{grid-template-columns:repeat(2,minmax(0,1fr))}.atc-info-actions button{flex:1}.atc-info-summary{align-items:flex-start;flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    if (document.getElementById('atcInfoOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'atcInfoOverlay';
    overlay.className = 'atc-info-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `<div class="atc-info-dialog" role="dialog" aria-modal="true" aria-labelledby="atcInfoTitle"><header class="atc-info-head"><div class="atc-info-icon" aria-hidden="true">ⓘ</div><div><p>Informacion nga databaza</p><h2 id="atcInfoTitle">Kategoria ATC</h2></div><button class="atc-info-close" type="button" data-info-close aria-label="Mbyll">×</button></header><div class="atc-info-body" id="atcInfoBody"></div><footer class="atc-info-actions"><button class="atc-info-secondary" type="button" data-info-close>Mbyll</button><button class="atc-info-primary" type="button" id="atcInfoContinue"><span>Shiko barnat</span><b aria-hidden="true">→</b></button></footer></div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('[data-info-close]')) closePanel();
    });
    document.getElementById('atcInfoContinue').addEventListener('click', continueToCategory);
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !overlay.hidden) closePanel(); });
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

  function groupItems(code, type) {
    return rows.filter(row => atcCode(row).startsWith(code));
  }

  function render(card) {
    const code = text(card.dataset.code).toUpperCase();
    const type = card.dataset.cardType === 'group' ? 'group' : 'subgroup';
    const title = type === 'group' ? (GROUPS[code] || 'Grupi ATC') : (SUBGROUPS[code] || 'Nën-grupi ATC');
    const items = groupItems(code, type);
    const subgroups = new Set(items.map(row => atcCode(row).match(/^[A-Z]\d{2}/)?.[0]).filter(Boolean));
    const missing = field => items.filter(row => !text(row[field])).length;
    const audit = window.MEDINDEX_REGISTRY_AUDIT || {};
    document.getElementById('atcInfoTitle').textContent = `${code} — ${title}`;
    document.getElementById('atcInfoBody').innerHTML = `<div class="atc-info-summary"><span class="atc-info-code">${escapeHtml(code)}</span><p>${type === 'group' ? 'Grup kryesor anatomik/terapeutik' : 'Nën-grup terapeutik'} · Të dhënat llogariten nga regjistri aktual i MedIndex.</p></div><div class="atc-info-stats"><div><strong>${items.length}</strong><span>preparate</span></div><div><strong>${uniqueCount(items, 'Substanca aktive')}</strong><span>substanca</span></div><div><strong>${uniqueCount(items, 'Forma farmaceutike')}</strong><span>forma</span></div><div><strong>${type === 'group' ? subgroups.size : uniqueCount(items, 'ATC Code')}</strong><span>${type === 'group' ? 'nën-grupe' : 'kode ATC'}</span></div></div>${listMarkup('Substancat aktive më të shpeshta', topValues(items, 'Substanca aktive', 7))}${listMarkup('Klasat kryesore', topValues(items, 'Klasa / Çka është', 6))}${listMarkup('Përdorimet / fjalët kyçe', topValues(items, 'Përdorimi (fjalë kyçe)', 8))}${listMarkup('Format farmaceutike', topValues(items, 'Forma farmaceutike', 7))}${listMarkup('Statusi i preparateve', topValues(items, 'Statusi', 4))}${listMarkup('Shembuj nga regjistri', examples(items))}<div class="atc-info-quality"><span>Pa substancë: <b>${missing('Substanca aktive')}</b></span><span>Pa klasë: <b>${missing('Klasa / Çka është')}</b></span><span>Pa përdorim: <b>${missing('Përdorimi (fjalë kyçe)')}</b></span><span>Pa formë: <b>${missing('Forma farmaceutike')}</b></span></div><div class="atc-info-note"><strong>Audit i databazës:</strong> ${audit.total || rows.length} rreshta të lexuar; ${audit.validAtc ?? '—'} kode ATC me format të lexueshëm. Paneli nuk shpik të dhëna kur një fushë mungon.</div>`;
    const action = document.getElementById('atcInfoContinue');
    action.querySelector('span').textContent = type === 'group' ? 'Shiko nën-grupet' : 'Shiko barnat';
  }

  async function openPanel(card) {
    ensurePanel();
    activeCard = card;
    const overlay = document.getElementById('atcInfoOverlay');
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
    const focusTarget = activeCard;
    setTimeout(() => { overlay.hidden = true; focusTarget?.focus(); }, 180);
  }

  function continueToCategory() {
    if (!activeCard) return;
    const card = activeCard;
    closePanel();
    card.dataset.infoBypassOnce = 'true';
    setTimeout(() => card.click(), 40);
  }

  function interceptCards() {
    document.addEventListener('click', event => {
      const card = event.target.closest('.atc-card');
      if (!card) return;
      if (card.dataset.infoBypassOnce === 'true') { delete card.dataset.infoBypassOnce; return; }
      event.preventDefault();
      event.stopImmediatePropagation();
      openPanel(card);
    }, true);
    document.addEventListener('keydown', event => {
      const card = event.target.closest?.('.atc-card');
      if (!card || !['Enter',' '].includes(event.key) || card.dataset.infoBypassOnce === 'true') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openPanel(card);
    }, true);
  }

  function init() {
    installStyles();
    ensurePanel();
    interceptCards();
    window.addEventListener('medindex:registry-ready', event => { rows = event.detail?.rows || []; });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();