(() => {
  const FIELDS = [
    'Nr rendor','PDID','ProtocolNo','Emri tregtar','Substanca aktive','ATC Code',
    'Klasa / Çka është','Përdorimi (fjalë kyçe)','Fortësia','Forma farmaceutike',
    'Madhësia e paketimit','Bartësi i Autorizim Marketingut','Prodhuesi',
    'MA certifikata','Statusi','Çmimi me shumicë','Çmimi me marzhë','TVSH',
    'Çmimi me pakicë','Afati i vlefshmërisë'
  ];
  const GROUPS = window.MEDINDEX_ATC_GROUPS || {};
  const SUBGROUPS = window.MEDINDEX_ATC_SUBGROUPS || {};
  let registryRows = [];
  let activeCard = null;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));

  const normalize = value => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('sq')
    .trim();

  const canonicalToken = value => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

  const fieldLookup = {};
  FIELDS.forEach(field => { fieldLookup[canonicalToken(field)] = field; });
  Object.assign(fieldLookup, {
    nr: 'Nr rendor', number: 'Nr rendor', pdid: 'PDID', protocol: 'ProtocolNo', protocolno: 'ProtocolNo',
    emri: 'Emri tregtar', name: 'Emri tregtar', tradename: 'Emri tregtar',
    substanca: 'Substanca aktive', activesubstance: 'Substanca aktive', activeingredient: 'Substanca aktive',
    atc: 'ATC Code', atccode: 'ATC Code', klasa: 'Klasa / Çka është', class: 'Klasa / Çka është',
    perdorimi: 'Përdorimi (fjalë kyçe)', uses: 'Përdorimi (fjalë kyçe)', indications: 'Përdorimi (fjalë kyçe)',
    fortesia: 'Fortësia', strength: 'Fortësia', forma: 'Forma farmaceutike', pharmaceuticalform: 'Forma farmaceutike',
    status: 'Statusi'
  });

  function unwrap(value) {
    let current = value;
    for (let depth = 0; depth < 5; depth++) {
      if (Array.isArray(current)) return current;
      if (typeof current === 'string') {
        try { current = JSON.parse(current); continue; } catch { return []; }
      }
      if (current && typeof current === 'object') {
        const preferred = ['data','rows','records','items','drugs','barnat','Sheet1','sheet1'];
        const key = preferred.find(name => Array.isArray(current[name]) || typeof current[name] === 'string');
        if (key) { current = current[key]; continue; }
        const array = Object.values(current).find(Array.isArray);
        if (array) { current = array; continue; }
      }
      break;
    }
    return [];
  }

  function normalizeRow(row, index) {
    const result = Object.fromEntries(FIELDS.map(field => [field, '']));
    if (Array.isArray(row)) {
      FIELDS.forEach((field, fieldIndex) => { result[field] = row[fieldIndex] ?? ''; });
    } else if (row && typeof row === 'object') {
      const source = row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data : row;
      Object.entries(source).forEach(([key, value]) => {
        const field = fieldLookup[canonicalToken(key)];
        if (field) result[field] = value ?? '';
      });
    }
    if (result['Nr rendor'] === '') result['Nr rendor'] = index + 1;
    return result;
  }

  async function decodeRegistry() {
    if (!Array.isArray(window.DRUG_DATA_PARTS) || !window.DRUG_DATA_PARTS.length) return [];
    const encoded = window.DRUG_DATA_PARTS.join('');
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const parsed = JSON.parse(await new Response(stream).text());
    return unwrap(parsed).map(normalizeRow).filter(row => row['Emri tregtar'] || row['Substanca aktive']);
  }

  const atcCode = row => String(row['ATC Code'] || '').toUpperCase().replace(/\s+/g, '').trim();
  const matchesCode = (row, type, code) => type === 'group'
    ? atcCode(row).startsWith(code)
    : atcCode(row).startsWith(code);

  function splitValues(value, field) {
    const text = String(value || '').trim();
    if (!text) return [];
    if (field === 'Përdorimi (fjalë kyçe)') return text.split(/[;,|]/).map(item => item.trim()).filter(Boolean);
    if (field === 'Substanca aktive') return text.split(/\s*;\s*/).map(item => item.trim()).filter(Boolean);
    return [text];
  }

  function topValues(items, field, limit = 5) {
    const counts = new Map();
    const labels = new Map();
    items.forEach(row => {
      splitValues(row[field], field).forEach(value => {
        const key = normalize(value);
        if (!key) return;
        counts.set(key, (counts.get(key) || 0) + 1);
        if (!labels.has(key)) labels.set(key, value);
      });
    });
    return [...counts.entries()]
      .sort((first, second) => second[1] - first[1] || labels.get(first[0]).localeCompare(labels.get(second[0]), 'sq'))
      .slice(0, limit)
      .map(([key, count]) => ({ label: labels.get(key), count }));
  }

  function uniqueCount(items, field) {
    const values = new Set();
    items.forEach(row => splitValues(row[field], field).forEach(value => {
      const key = normalize(value);
      if (key) values.add(key);
    }));
    return values.size;
  }

  function uniqueExamples(items, limit = 6) {
    const examples = [];
    const seen = new Set();
    for (const row of items) {
      const name = String(row['Emri tregtar'] || '').trim();
      const key = normalize(name);
      if (!name || seen.has(key)) continue;
      seen.add(key);
      examples.push(name);
      if (examples.length >= limit) break;
    }
    return examples;
  }

  function listMarkup(title, values, emptyText = 'Nuk ka të dhëna të regjistruara.') {
    return `<section class="atc-info-section">
      <h4>${escapeHtml(title)}</h4>
      ${values.length
        ? `<div class="atc-info-chips">${values.map(value => `<span>${escapeHtml(value.label)}${value.count ? `<small>${value.count}</small>` : ''}</span>`).join('')}</div>`
        : `<p class="atc-info-empty">${escapeHtml(emptyText)}</p>`}
    </section>`;
  }

  function ensurePanel() {
    if (document.getElementById('atcInfoOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'atcInfoOverlay';
    overlay.className = 'atc-info-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `<div class="atc-info-dialog" role="dialog" aria-modal="true" aria-labelledby="atcInfoTitle">
      <div class="atc-info-glow" aria-hidden="true"></div>
      <header class="atc-info-head">
        <div class="atc-info-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </div>
        <div><p>Informacion nga databaza</p><h2 id="atcInfoTitle">Kategoria ATC</h2></div>
        <button class="atc-info-close" type="button" data-info-close aria-label="Mbyll panelin">×</button>
      </header>
      <div class="atc-info-body" id="atcInfoBody"></div>
      <footer class="atc-info-actions">
        <button class="atc-info-secondary" type="button" data-info-close>Mbyll</button>
        <button class="atc-info-primary" type="button" id="atcInfoContinue"><span>Shiko barnat</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </footer>
    </div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('[data-info-close]')) closePanel();
    });
    document.getElementById('atcInfoContinue').addEventListener('click', continueToCategory);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !overlay.hidden) closePanel();
    });
  }

  function openPanel(card) {
    ensurePanel();
    activeCard = card;
    const code = String(card.dataset.code || '').toUpperCase();
    const type = card.dataset.cardType === 'group' ? 'group' : 'subgroup';
    const title = type === 'group' ? (GROUPS[code] || 'Grupi ATC') : (SUBGROUPS[code] || 'Nën-grupi ATC');
    const items = registryRows.filter(row => matchesCode(row, type, code));
    const subgroups = new Set(items.map(row => atcCode(row).match(/^[A-Z]\d{2}/)?.[0]).filter(Boolean));
    const statuses = topValues(items, 'Statusi', 3);
    const substances = topValues(items, 'Substanca aktive', 6);
    const classes = topValues(items, 'Klasa / Çka është', 4);
    const uses = topValues(items, 'Përdorimi (fjalë kyçe)', 6);
    const forms = topValues(items, 'Forma farmaceutike', 5);
    const examples = uniqueExamples(items).map(label => ({ label, count: 0 }));

    document.getElementById('atcInfoTitle').textContent = `${code} — ${title}`;
    document.getElementById('atcInfoBody').innerHTML = `
      <div class="atc-info-summary">
        <span class="atc-info-code">${escapeHtml(code)}</span>
        <p>${type === 'group' ? 'Grup kryesor anatomik/terapeutik' : 'Nën-grup terapeutik'} · Të dhënat më poshtë llogariten nga regjistri aktual.</p>
      </div>
      <div class="atc-info-stats">
        <div><strong>${items.length}</strong><span>preparate</span></div>
        <div><strong>${uniqueCount(items, 'Substanca aktive')}</strong><span>substanca</span></div>
        <div><strong>${uniqueCount(items, 'Forma farmaceutike')}</strong><span>forma</span></div>
        <div><strong>${type === 'group' ? subgroups.size : uniqueCount(items, 'ATC Code')}</strong><span>${type === 'group' ? 'nën-grupe' : 'kode ATC'}</span></div>
      </div>
      ${listMarkup('Substancat aktive më të shpeshta', substances)}
      ${listMarkup('Klasat kryesore', classes)}
      ${listMarkup('Përdorimet / fjalët kyçe', uses)}
      ${listMarkup('Format farmaceutike', forms)}
      ${listMarkup('Statusi i preparateve', statuses)}
      ${listMarkup('Shembuj nga regjistri', examples)}
      <div class="atc-info-note"><strong>Burimi:</strong> vetëm databaza aktuale e MedIndex. Paneli nuk shton indikacione ose përshkrime nga burime të jashtme.</div>`;

    const action = document.getElementById('atcInfoContinue');
    action.querySelector('span').textContent = type === 'group' ? 'Shiko nën-grupet' : 'Shiko barnat';
    const overlay = document.getElementById('atcInfoOverlay');
    overlay.hidden = false;
    document.body.classList.add('atc-info-open');
    requestAnimationFrame(() => {
      overlay.classList.add('open');
      overlay.querySelector('.atc-info-close').focus();
    });
  }

  function closePanel() {
    const overlay = document.getElementById('atcInfoOverlay');
    if (!overlay || overlay.hidden) return;
    overlay.classList.remove('open');
    document.body.classList.remove('atc-info-open');
    const cardToFocus = activeCard;
    window.setTimeout(() => {
      overlay.hidden = true;
      cardToFocus?.focus();
    }, 180);
  }

  function continueToCategory() {
    if (!activeCard) return;
    const card = activeCard;
    closePanel();
    card.dataset.infoBypassOnce = 'true';
    window.setTimeout(() => card.click(), 40);
  }

  function interceptCards() {
    document.addEventListener('click', event => {
      const card = event.target.closest('.atc-card');
      if (!card) return;
      if (card.dataset.infoBypassOnce === 'true') {
        delete card.dataset.infoBypassOnce;
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      openPanel(card);
    }, true);

    document.addEventListener('keydown', event => {
      const card = event.target.closest?.('.atc-card');
      if (!card || (event.key !== 'Enter' && event.key !== ' ')) return;
      if (card.dataset.infoBypassOnce === 'true') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openPanel(card);
    }, true);
  }

  function addStyles() {
    if (document.getElementById('atcInfoStyles')) return;
    const style = document.createElement('style');
    style.id = 'atcInfoStyles';
    style.textContent = `
      body.atc-info-open{overflow:hidden}
      .atc-card::before{content:'i';position:absolute;right:14px;top:14px;width:27px;height:27px;border-radius:50%;display:grid;place-items:center;background:rgba(21,94,99,.1);border:1px solid rgba(21,94,99,.22);color:var(--teal);font:800 italic 14px Georgia;transition:.2s}
      .atc-card:hover::before,.atc-card:focus-visible::before{background:var(--teal);color:#fff;transform:scale(1.06)}
      .atc-info-overlay{position:fixed;inset:0;z-index:900;display:grid;place-items:center;padding:22px;background:rgba(4,15,17,.72);backdrop-filter:blur(8px);opacity:0;transition:opacity .18s ease}
      .atc-info-overlay[hidden]{display:none}.atc-info-overlay.open{opacity:1}
      .atc-info-dialog{position:relative;width:min(820px,100%);max-height:min(90vh,880px);display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.12);border-radius:22px;background:linear-gradient(145deg,rgba(13,35,38,.98),rgba(18,52,55,.98));color:#edf6f3;box-shadow:0 36px 110px rgba(0,0,0,.5),0 0 45px rgba(21,94,99,.22);transform:translateY(14px) scale(.985);transition:transform .2s ease}
      .atc-info-overlay.open .atc-info-dialog{transform:none}.atc-info-glow{position:absolute;inset:-30% 15% auto;height:230px;background:linear-gradient(90deg,rgba(199,125,31,.18),rgba(21,94,99,.28));filter:blur(55px);pointer-events:none}
      .atc-info-head{position:relative;display:grid;grid-template-columns:46px minmax(0,1fr) 40px;align-items:center;gap:12px;padding:20px 22px 17px;border-bottom:1px solid rgba(255,255,255,.1)}
      .atc-info-icon{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:rgba(199,125,31,.16);color:#efb765}.atc-info-icon svg{width:22px;height:22px}.atc-info-head p{margin:0 0 3px;color:#9fb7b4;font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em}.atc-info-head h2{margin:0;font:700 clamp(1.05rem,2.5vw,1.35rem) Georgia;line-height:1.25;color:#fff}
      .atc-info-close{width:38px;height:38px;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:rgba(255,255,255,.06);color:#fff;font-size:1.25rem;cursor:pointer}.atc-info-close:hover{background:rgba(255,255,255,.13)}
      .atc-info-body{position:relative;overflow:auto;padding:20px 22px 24px}.atc-info-summary{display:flex;align-items:center;gap:12px;margin-bottom:16px}.atc-info-summary p{margin:0;color:#b7c8c5;font-size:.82rem;line-height:1.45}.atc-info-code{flex:0 0 auto;padding:7px 11px;border-radius:999px;background:linear-gradient(135deg,#c77d1f,#9a5d13);color:#fff;font:800 .8rem var(--mono)}
      .atc-info-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-bottom:19px}.atc-info-stats div{padding:13px 10px;border:1px solid rgba(255,255,255,.09);border-radius:13px;background:rgba(255,255,255,.045);text-align:center}.atc-info-stats strong{display:block;font:800 1.25rem var(--mono);color:#fff}.atc-info-stats span{display:block;margin-top:3px;color:#9fb1ae;font-size:.68rem;text-transform:uppercase;letter-spacing:.06em}
      .atc-info-section{padding:14px 0;border-top:1px solid rgba(255,255,255,.085)}.atc-info-section h4{margin:0 0 9px;color:#f3f8f6;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em}.atc-info-chips{display:flex;flex-wrap:wrap;gap:7px}.atc-info-chips>span{display:inline-flex;align-items:center;gap:7px;max-width:100%;padding:7px 9px;border:1px solid rgba(255,255,255,.1);border-radius:9px;background:rgba(255,255,255,.055);color:#dbe8e5;font-size:.77rem;line-height:1.3}.atc-info-chips small{min-width:20px;height:20px;padding:0 5px;border-radius:10px;display:grid;place-items:center;background:rgba(199,125,31,.2);color:#f2c484;font:800 .65rem var(--mono)}.atc-info-empty{margin:0;color:#91a4a1;font-size:.78rem}
      .atc-info-note{margin-top:10px;padding:12px 13px;border-left:4px solid #c77d1f;border-radius:8px;background:rgba(199,125,31,.1);color:#d8c2a1;font-size:.74rem;line-height:1.5}
      .atc-info-actions{position:relative;display:flex;justify-content:flex-end;gap:9px;padding:14px 22px;border-top:1px solid rgba(255,255,255,.1);background:rgba(5,19,21,.6)}.atc-info-actions button{min-height:42px;padding:0 15px;border-radius:10px;font-weight:800;cursor:pointer}.atc-info-secondary{border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.055);color:#dce8e5}.atc-info-primary{display:flex;align-items:center;gap:9px;border:0;background:linear-gradient(135deg,#c77d1f,#155e63);color:#fff;box-shadow:0 10px 28px rgba(0,0,0,.22)}.atc-info-primary:hover{filter:brightness(1.09)}.atc-info-primary svg{width:18px;height:18px}
      @media(max-width:650px){.atc-info-overlay{padding:0;align-items:end}.atc-info-dialog{width:100%;max-height:94vh;border-radius:20px 20px 0 0}.atc-info-head,.atc-info-body,.atc-info-actions{padding-left:16px;padding-right:16px}.atc-info-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.atc-info-actions button{flex:1}.atc-info-summary{align-items:flex-start;flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  async function init() {
    addStyles();
    ensurePanel();
    interceptCards();
    try {
      registryRows = await decodeRegistry();
    } catch (error) {
      console.error('Paneli i kategorisë nuk e lexoi databazën:', error);
      registryRows = [];
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();