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
  const THEME_KEY = 'regjistriBarnave_theme_v1';
  const state = { group: '', subgroup: '', query: '' };
  let rows = [];

  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sq').trim();
  const atcCode = row => String(row['ATC Code'] || '').toUpperCase().replace(/\s+/g, '').trim();
  const groupCode = row => atcCode(row).match(/^[A-Z]/)?.[0] || '';
  const subgroupCode = row => atcCode(row).match(/^[A-Z]\d{2}/)?.[0] || '';

  function canonicalToken(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  const fieldLookup = {};
  FIELDS.forEach(field => { fieldLookup[canonicalToken(field)] = field; });
  Object.assign(fieldLookup, {
    nr:'Nr rendor', number:'Nr rendor', pdid:'PDID', protocol:'ProtocolNo', protocolno:'ProtocolNo',
    emri:'Emri tregtar', name:'Emri tregtar', tradename:'Emri tregtar',
    substanca:'Substanca aktive', activesubstance:'Substanca aktive', activeingredient:'Substanca aktive',
    atc:'ATC Code', atccode:'ATC Code', klasa:'Klasa / Çka është', class:'Klasa / Çka është',
    perdorimi:'Përdorimi (fjalë kyçe)', uses:'Përdorimi (fjalë kyçe)', indications:'Përdorimi (fjalë kyçe)',
    fortesia:'Fortësia', strength:'Fortësia', forma:'Forma farmaceutike', pharmaceuticalform:'Forma farmaceutike'
  });

  function unwrap(value) {
    let current = value;
    for (let i = 0; i < 5; i++) {
      if (Array.isArray(current)) return current;
      if (typeof current === 'string') {
        try { current = JSON.parse(current); continue; } catch { return []; }
      }
      if (current && typeof current === 'object') {
        const key = ['data','rows','records','items','drugs','barnat','Sheet1','sheet1'].find(name => Array.isArray(current[name]) || typeof current[name] === 'string');
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
    if (Array.isArray(row)) FIELDS.forEach((field, i) => { result[field] = row[i] ?? ''; });
    else if (row && typeof row === 'object') {
      const source = row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data : row;
      Object.entries(source).forEach(([key, value]) => {
        const field = fieldLookup[canonicalToken(key)];
        if (field) result[field] = value ?? '';
      });
    }
    if (result['Nr rendor'] === '') result['Nr rendor'] = index + 1;
    return result;
  }

  async function decodeRegistryParts() {
    if (!Array.isArray(window.DRUG_DATA_PARTS) || !window.DRUG_DATA_PARTS.length) return [];
    const encoded = window.DRUG_DATA_PARTS.join('');
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }

  async function loadRows() {
    let parsed = await decodeRegistryParts();
    if (!unwrap(parsed).length) {
      const response = await fetch('/api/registry?fallback=1&classification=1', { cache: 'no-store' });
      if (!response.ok) throw new Error('Databaza nuk u ngarkua (' + response.status + ')');
      window.DRUG_DATA_PARTS = [];
      (0, eval)(await response.text());
      parsed = await decodeRegistryParts();
    }
    return unwrap(parsed).map(normalizeRow).filter(row => row['Emri tregtar'] || row['Substanca aktive']);
  }

  function uniqueExamples(items, limit = 4) {
    const found = [];
    const seen = new Set();
    for (const row of items) {
      const name = String(row['Emri tregtar'] || '').trim();
      const key = normalize(name);
      if (!name || seen.has(key)) continue;
      seen.add(key);
      found.push(name);
      if (found.length >= limit) break;
    }
    return found;
  }

  function arrowIcon() {
    return '<svg fill="none" viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M13.47 17.97a.75.75 0 0 0 1.06 1.06l5.79-5.79a1.75 1.75 0 0 0 0-2.48l-5.79-5.79a.75.75 0 0 0-1.06 1.06l5.22 5.22H4a.75.75 0 0 0 0 1.5h14.69l-5.22 5.22Z"/></svg>';
  }

  function cardHtml(code, title, items, type) {
    const examples = uniqueExamples(items);
    const description = examples.length ? examples.join(', ') : 'Nuk ka shembuj të regjistruar.';
    return `<article class="atc-card" tabindex="0" role="button" data-card-type="${type}" data-code="${escapeHtml(code)}">
      <span class="atc-card-code">${escapeHtml(code)}</span>
      <h3>${escapeHtml(title)}</h3>
      <p class="atc-card-examples">${escapeHtml(description)}</p>
      <div class="atc-card-footer"><span class="atc-card-count">${items.length} barna</span><span>${type === 'group' ? 'Shiko nën-grupet' : 'Shiko barnat'}</span></div>
      <span class="atc-card-arrow">${arrowIcon()}</span>
    </article>`;
  }

  function setSection(title, subtitle, breadcrumb = '') {
    $('#sectionTitle').textContent = title;
    $('#sectionSubtitle').textContent = subtitle;
    $('#breadcrumb').innerHTML = breadcrumb;
  }

  function updateControls(count) {
    $('#atcCount').textContent = `${count} / ${rows.length} barna`;
    $('#backButton').hidden = !state.group && !state.subgroup && !state.query;
  }

  function attachCardEvents() {
    document.querySelectorAll('.atc-card').forEach(card => {
      const activate = () => {
        if (card.dataset.cardType === 'group') openGroup(card.dataset.code);
        else openSubgroup(card.dataset.code);
      };
      card.addEventListener('click', activate);
      card.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
      });
    });
  }

  function renderGroups() {
    state.group = '';
    state.subgroup = '';
    history.replaceState(null, '', location.pathname);
    const available = Object.keys(GROUPS).map(code => ({ code, items: rows.filter(row => groupCode(row) === code) })).filter(group => group.items.length);
    setSection('Grupet kryesore ATC', 'Zgjidhe sistemin ose grupin terapeutik për t’i parë nën-grupet.', '<strong>Klasifikimi ATC</strong>');
    $('#cardGrid').innerHTML = available.map(group => cardHtml(group.code, GROUPS[group.code], group.items, 'group')).join('');
    $('#cardGrid').hidden = false;
    $('#drugResults').hidden = true;
    updateControls(available.reduce((sum, group) => sum + group.items.length, 0));
    attachCardEvents();
  }

  function openGroup(code) {
    state.group = code;
    state.subgroup = '';
    state.query = '';
    $('#atcSearch').value = '';
    location.hash = code;
    const groupRows = rows.filter(row => groupCode(row) === code);
    const codes = [...new Set(groupRows.map(subgroupCode).filter(Boolean))].sort();
    setSection(`${code} — ${GROUPS[code] || 'Grupi ATC'}`, 'Nën-grupet dhe numri real i barnave në databazën aktuale.', `<button class="atc-reset" type="button" data-go-home>Klasifikimi ATC</button> / <strong>${escapeHtml(code)}</strong>`);
    $('#cardGrid').innerHTML = codes.map(subcode => cardHtml(subcode, SUBGROUPS[subcode] || `Nën-grupi ${subcode}`, groupRows.filter(row => subgroupCode(row) === subcode), 'subgroup')).join('') || '<div class="atc-empty">Ky grup nuk ka nën-grupe të lexueshme në databazë.</div>';
    $('#cardGrid').hidden = false;
    $('#drugResults').hidden = true;
    updateControls(groupRows.length);
    attachCardEvents();
    $('[data-go-home]')?.addEventListener('click', renderGroups);
    scrollTo({ top: 0, behavior: 'smooth' });
  }

  function drugTable(items, heading) {
    setSection(heading, `${items.length} barna të marra drejtpërdrejt nga databaza.`, `<button class="atc-reset" type="button" data-go-home>Klasifikimi ATC</button>${state.group ? ` / <button class="atc-reset" type="button" data-go-group>${escapeHtml(state.group)}</button>` : ''}${state.subgroup ? ` / <strong>${escapeHtml(state.subgroup)}</strong>` : ''}`);
    $('#cardGrid').hidden = true;
    $('#drugResults').hidden = false;
    if (!items.length) {
      $('#drugTableBody').innerHTML = '<tr><td colspan="6"><div class="atc-empty">Nuk u gjet asnjë bar.</div></td></tr>';
    } else {
      $('#drugTableBody').innerHTML = items.map(row => `<tr>
        <td class="drug-title" title="${escapeHtml(row['Emri tregtar'])}"><button type="button" title="Kliko për ta zgjeruar">${escapeHtml(row['Emri tregtar'] || 'Pa emër')}</button></td>
        <td class="wrap">${escapeHtml(row['Substanca aktive'])}</td>
        <td class="code">${escapeHtml(row['ATC Code'])}</td>
        <td class="wrap">${escapeHtml(row['Klasa / Çka është'])}</td>
        <td>${escapeHtml(row['Fortësia'])}</td>
        <td class="wrap">${escapeHtml(row['Forma farmaceutike'])}</td>
      </tr>`).join('');
    }
    updateControls(items.length);
    $('#drugTableBody').querySelectorAll('.drug-title button').forEach(button => button.addEventListener('click', () => button.parentElement.classList.toggle('expanded')));
    $('[data-go-home]')?.addEventListener('click', renderGroups);
    $('[data-go-group]')?.addEventListener('click', () => openGroup(state.group));
  }

  function openSubgroup(code) {
    state.group = code.charAt(0);
    state.subgroup = code;
    state.query = '';
    $('#atcSearch').value = '';
    location.hash = code;
    const items = rows.filter(row => subgroupCode(row) === code);
    drugTable(items, `${code} — ${SUBGROUPS[code] || 'Nën-grupi ATC'}`);
    scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderSearch(query) {
    state.query = query.trim();
    if (!state.query) {
      if (state.subgroup) openSubgroup(state.subgroup);
      else if (state.group) openGroup(state.group);
      else renderGroups();
      return;
    }
    const q = normalize(state.query);
    const items = rows.filter(row => normalize([
      row['Emri tregtar'], row['Substanca aktive'], row['ATC Code'],
      row['Klasa / Çka është'], row['Përdorimi (fjalë kyçe)'], row['Forma farmaceutike']
    ].join(' ')).includes(q));
    state.group = '';
    state.subgroup = '';
    history.replaceState(null, '', location.pathname + '?q=' + encodeURIComponent(state.query));
    drugTable(items, `Rezultatet për “${state.query}”`);
  }

  function goBack() {
    if (state.query) {
      state.query = '';
      $('#atcSearch').value = '';
      renderGroups();
    } else if (state.subgroup) openGroup(state.group);
    else renderGroups();
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    $('#themeButton').textContent = theme === 'dark' ? '☀' : '☾';
    $('#themeButton').setAttribute('aria-label', theme === 'dark' ? 'Aktivizo light mode' : 'Aktivizo dark mode');
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const theme = saved === 'dark' || saved === 'light' ? saved : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(theme);
    $('#themeButton').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  }

  function initNavigation() {
    $('#backButton').addEventListener('click', goBack);
    $('#resetButton').addEventListener('click', () => {
      $('#atcSearch').value = '';
      state.query = '';
      renderGroups();
    });
    let timer;
    $('#atcSearch').addEventListener('input', event => {
      clearTimeout(timer);
      timer = setTimeout(() => renderSearch(event.target.value), 180);
    });
  }

  async function init() {
    initTheme();
    initNavigation();
    try {
      rows = await loadRows();
      $('#atcLoader').remove();
      $('#atcWorkspace').hidden = false;
      const query = new URLSearchParams(location.search).get('q');
      const hash = location.hash.replace('#', '').toUpperCase();
      if (query) {
        $('#atcSearch').value = query;
        renderSearch(query);
      } else if (/^[A-Z]\d{2}$/.test(hash)) openSubgroup(hash);
      else if (/^[A-Z]$/.test(hash) && GROUPS[hash]) openGroup(hash);
      else renderGroups();
      const unclassified = rows.filter(row => !groupCode(row) || !GROUPS[groupCode(row)]).length;
      $('#sourceNote').textContent = unclassified
        ? `Numrat llogariten nga databaza aktuale. ${unclassified} rreshta nuk kanë kod ATC të klasifikueshëm në grupet e kësaj faqeje.`
        : 'Numrat, shembujt dhe listat llogariten drejtpërdrejt nga databaza aktuale; nuk janë të shkruara me dorë.';
    } catch (error) {
      console.error(error);
      $('#atcLoader').innerHTML = `<div class="atc-empty">Databaza nuk u ngarkua. Provo rifreskimin e faqes pas pak.</div>`;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
