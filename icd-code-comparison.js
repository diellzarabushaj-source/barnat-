(function bootstrapIcdCodeComparison(root, factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!root) return;

  root.MedIndexIcdCodeComparison = api;
  const start = () => api.init(root);
  if (root.document?.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})(typeof window !== 'undefined' ? window : null, function createIcdCodeComparison() {
  'use strict';

  const VERSION = 'icd-code-comparison-v1';
  const API_PATH = '/api/icd';
  const STORAGE_KEY = 'medindex_icd_code_comparison_v1';
  const PRIMARY_KEY = 'medindex_rx_diagnosis_context_v2';
  const SECONDARY_KEY = 'medindex_rx_secondary_diagnosis_context_v1';
  const MAX_ITEMS = 3;
  const CODE_PATTERN = /^[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?$/;
  const VALID_LEVELS = new Set(['category', 'subcategory']);
  const LEVEL_LABELS = Object.freeze({ category:'Kategori', subcategory:'Nënkategori' });
  const TERMINOLOGY = Object.freeze({
    verified:{ label:'Term i verifikuar', tone:'verified' },
    standardized:{ label:'Term i standardizuar', tone:'standardized' },
    machine:{ label:'Draft automatik', tone:'draft' },
    'machine-draft':{ label:'Draft automatik', tone:'draft' },
    missing:{ label:'Vetëm anglisht', tone:'missing' },
  });

  let rootRef = null;
  let items = [];
  let activeResolved = null;
  let detailCode = '';
  let initialized = false;
  let collapsed = false;
  let loadSequence = 0;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const safeText = (value, max = 500) => clean(value).slice(0, max);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[character]));

  function normalizeCode(value) {
    const code = safeText(value, 24).toUpperCase();
    return CODE_PATTERN.test(code) ? code : '';
  }

  function normalizeNode(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const code = normalizeCode(value.code);
    const level = safeText(value.level, 24).toLowerCase();
    if (!code || !VALID_LEVELS.has(level)) return null;
    const titleSq = safeText(value.albanianDraft || value.titleSq || value.displayTitle, 500);
    const titleEn = safeText(value.englishTitle || value.titleEn, 500);
    if (!titleSq && !titleEn) return null;
    return {
      code,
      level,
      titleSq,
      titleEn,
      displayTitle:titleSq || titleEn || code,
      chapter:safeText(value.chapter, 160),
      block:safeText(value.block, 160),
      parentCode:safeText(value.parentCode, 24).toUpperCase(),
      childCount:Math.max(0, Math.min(9999, Number(value.childCount || 0))),
      translationStatus:safeText(value.translationStatus, 40).toLowerCase(),
    };
  }

  function normalizeAncestor(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const code = safeText(value.code, 24).toUpperCase();
    if (!code) return null;
    return {
      code,
      level:safeText(value.level, 24).toLowerCase(),
      displayTitle:safeText(value.displayTitle || value.albanianDraft || value.englishTitle || code, 500),
    };
  }

  function normalizeResolved(value) {
    const node = normalizeNode(value?.node || value);
    if (!node) return null;
    const seen = new Set();
    const ancestors = (Array.isArray(value?.ancestors) ? value.ancestors : [])
      .map(normalizeAncestor)
      .filter(Boolean)
      .filter(item => item.code !== node.code && !seen.has(item.code) && seen.add(item.code));
    return { node, ancestors };
  }

  function normalizeItems(values) {
    const source = Array.isArray(values) ? values : [];
    const seen = new Set();
    const result = [];
    for (const value of source) {
      const item = normalizeResolved(value);
      if (!item || seen.has(item.node.code)) continue;
      seen.add(item.node.code);
      result.push(item);
      if (result.length >= MAX_ITEMS) break;
    }
    return result;
  }

  function addItem(values, value) {
    const current = normalizeItems(values);
    const item = normalizeResolved(value);
    if (!item || current.some(entry => entry.node.code === item.node.code) || current.length >= MAX_ITEMS) return current;
    return [...current, item];
  }

  function removeItem(values, code) {
    const target = normalizeCode(code);
    return normalizeItems(values).filter(item => item.node.code !== target);
  }

  function serializeCodes(values) {
    return JSON.stringify({
      version:1,
      codes:normalizeItems(values).map(item => item.node.code),
    });
  }

  function parseCodes(raw) {
    let payload = raw;
    if (typeof raw === 'string') {
      try { payload = JSON.parse(raw); }
      catch { return []; }
    }
    if (!payload || Number(payload.version) !== 1 || !Array.isArray(payload.codes)) return [];
    const seen = new Set();
    return payload.codes.map(normalizeCode).filter(code => code && !seen.has(code) && seen.add(code)).slice(0, MAX_ITEMS);
  }

  function levelLabel(value) {
    return LEVEL_LABELS[clean(value).toLowerCase()] || clean(value) || '—';
  }

  function terminologyInfo(value) {
    return TERMINOLOGY[clean(value).toLowerCase()] || { label:'Status i papërcaktuar', tone:'unknown' };
  }

  function specificityInfo(value) {
    const node = normalizeNode(value);
    if (!node) return { label:'E papërcaktuar', tone:'unknown', note:'Të dhënat e specifikësisë mungojnë.' };
    if (node.childCount > 0) {
      return {
        label:`Ka ${node.childCount} nënkode`,
        tone:'review',
        note:'Ekziston nivel më specifik në hierarki; përdorimi i kategorisë kërkon arsyetim klinik.',
      };
    }
    return {
      label:'Niveli më specifik',
      tone:'specific',
      note:'Nuk ka nënkode direkte në dataset-in aktual.',
    };
  }

  function pathOf(value) {
    const item = normalizeResolved(value);
    return item ? [...item.ancestors, item.node].map(entry => entry.code) : [];
  }

  function deepestCommonAncestor(values) {
    const normalized = normalizeItems(values);
    if (normalized.length < 2) return null;
    const paths = normalized.map(item => item.ancestors);
    const shortest = Math.min(...paths.map(path => path.length));
    let common = null;
    for (let index = 0; index < shortest; index += 1) {
      const code = paths[0][index]?.code;
      if (!code || !paths.every(path => path[index]?.code === code)) break;
      common = paths[0][index];
    }
    return common;
  }

  function relationInfo(values) {
    const normalized = normalizeItems(values);
    if (normalized.length < 2) {
      return { label:'Shto të paktën dy kode', tone:'empty', note:'Krahasimi fillon kur vendosen dy ose tre kode.' };
    }
    const parentChild = normalized.some(left => normalized.some(right => {
      if (left === right) return false;
      return right.ancestors.some(ancestor => ancestor.code === left.node.code);
    }));
    const sameParent = normalized.every(item => item.node.parentCode && item.node.parentCode === normalized[0].node.parentCode);
    const common = deepestCommonAncestor(normalized);
    if (parentChild) {
      return {
        label:'Kategori dhe nënkod i saj',
        tone:'related',
        note:'Njëri kod është strukturalisht më poshtë në të njëjtën degë ICD-10.',
      };
    }
    if (sameParent) {
      return {
        label:'Kode motra në të njëjtën degë',
        tone:'related',
        note:`Kodet kanë të njëjtin prind: ${normalized[0].node.parentCode}.`,
      };
    }
    if (common) {
      return {
        label:'Kode në një degë të përbashkët',
        tone:'shared',
        note:`Paraardhësi më i afërt i përbashkët është ${common.code}.`,
      };
    }
    return {
      label:'Degë të ndryshme ICD-10',
      tone:'different',
      note:'Kodet nuk ndajnë një paraardhës të drejtpërdrejtë në hierarkinë e ngarkuar.',
    };
  }

  function comparisonSummary(values) {
    const normalized = normalizeItems(values);
    const common = deepestCommonAncestor(normalized);
    const levels = [...new Set(normalized.map(item => levelLabel(item.node.level)))];
    const specificCodes = normalized.filter(item => item.node.childCount === 0).map(item => item.node.code);
    return {
      count:normalized.length,
      relation:relationInfo(normalized),
      commonAncestor:common?.code || '',
      sameLevel:levels.length <= 1,
      levels,
      specificCodes,
    };
  }

  function copyText(values) {
    const normalized = normalizeItems(values);
    if (!normalized.length) return '';
    const summary = comparisonSummary(normalized);
    const lines = [
      'KRAHASIM ICD-10-WHO 2019',
      `Marrëdhënia strukturore: ${summary.relation.label}`,
      summary.commonAncestor ? `Paraardhësi i përbashkët: ${summary.commonAncestor}` : 'Paraardhësi i përbashkët: —',
      '',
    ];
    normalized.forEach((item, index) => {
      const node = item.node;
      const terminology = terminologyInfo(node.translationStatus);
      const specificity = specificityInfo(node);
      lines.push(
        `${index + 1}. ${node.code} — ${node.displayTitle}`,
        `   Niveli: ${levelLabel(node.level)}`,
        `   English: ${node.titleEn || '—'}`,
        `   Statusi i termit: ${terminology.label}`,
        `   Kodi prind: ${node.parentCode || '—'}`,
        `   Nënkode direkte: ${node.childCount}`,
        `   Specifikësia: ${specificity.label}`,
        `   Hierarkia: ${pathOf(item).join(' › ')}`,
        '',
      );
    });
    lines.push('Shënim: krahasimi është strukturor dhe terminologjik; përzgjedhja përfundimtare mbetet vendim klinik.');
    return lines.join('\n').trim();
  }

  function diagnosisContext(value, selectedAt = Date.now()) {
    const item = normalizeResolved(value);
    if (!item) return null;
    const node = item.node;
    return {
      version:2,
      system:'ICD-10-WHO 2019',
      source:'medindex-icd-browser',
      code:node.code,
      level:node.level,
      titleSq:node.titleSq,
      titleEn:node.titleEn,
      display:`${node.code} — ${node.displayTitle}`.slice(0, 1000),
      translationStatus:node.translationStatus,
      childCount:node.childCount,
      selectedAt:Number(selectedAt) || Date.now(),
    };
  }

  function ensureHost() {
    const document = rootRef?.document;
    if (!document) return null;
    let host = document.getElementById('icdComparisonPanel');
    if (host) return host;
    const workspace = document.getElementById('icdCodingWorkspace');
    const tree = document.querySelector('.icd-tree-panel');
    if (!workspace && !tree) return null;

    host = document.createElement('section');
    host.id = 'icdComparisonPanel';
    host.className = 'icd-comparison-panel';
    host.setAttribute('aria-labelledby', 'icdComparisonTitle');
    host.innerHTML = `<header class="icd-comparison-head">
      <div>
        <p class="med-kicker">ICD-10-WHO 2019 · diferencimi strukturor</p>
        <h2 id="icdComparisonTitle">Krahasimi profesional i kodeve</h2>
      </div>
      <div class="icd-comparison-head-actions">
        <span id="icdComparisonCount" aria-label="0 nga ${MAX_ITEMS} kode">0/${MAX_ITEMS}</span>
        <button type="button" data-mi-icd-comparison-copy hidden>Kopjo krahasimin</button>
        <button type="button" data-mi-icd-comparison-clear hidden>Pastro</button>
        <button type="button" data-mi-icd-comparison-toggle aria-expanded="true" aria-controls="icdComparisonBody">Mbyll</button>
      </div>
    </header>
    <div class="icd-comparison-body" id="icdComparisonBody">
      <div class="icd-comparison-empty" id="icdComparisonEmpty">
        <span aria-hidden="true">1–3</span>
        <div><strong>Shto deri në ${MAX_ITEMS} kode nga workspace-i për t'i krahasuar</strong></div>
      </div>
      <section class="icd-comparison-summary" id="icdComparisonSummary" aria-label="Përmbledhja e dallimeve" hidden></section>
      <div class="icd-comparison-grid" id="icdComparisonGrid" role="list"></div>
      <p class="icd-comparison-disclaimer" id="icdComparisonDisclaimer" hidden>Krahasimi tregon dallime strukturore dhe terminologjike. Nuk zëvendëson arsyetimin dhe dokumentimin klinik.</p>
      <p class="icd-comparison-status" id="icdComparisonStatus" role="status" aria-live="polite"></p>
    </div>`;
    if (workspace?.parentElement) workspace.insertAdjacentElement('afterend', host);
    else tree?.parentElement?.insertBefore(host, tree);
    return host;
  }

  function ensureWorkspaceButton() {
    const actions = rootRef?.document.querySelector('.icd-coding-workspace-actions');
    if (!actions) return null;
    let button = actions.querySelector('[data-mi-icd-compare-active]');
    if (button) return button;
    button = rootRef.document.createElement('button');
    button.type = 'button';
    button.dataset.miIcdCompareActive = '';
    button.textContent = 'Shto në krahasim';
    button.hidden = true;
    const copy = actions.querySelector('[data-mi-icd-workspace-copy]');
    copy?.insertAdjacentElement('afterend', button);
    if (!copy) actions.prepend(button);
    return button;
  }

  function ensureDetailButton() {
    const actions = rootRef?.document.querySelector('#detailOverlay .icd-detail-actions');
    if (!actions) return null;
    let button = actions.querySelector('[data-mi-icd-compare-detail]');
    if (button) return button;
    button = rootRef.document.createElement('button');
    button.type = 'button';
    button.id = 'icdAddComparison';
    button.dataset.miIcdCompareDetail = '';
    button.textContent = 'Shto në krahasim';
    button.hidden = true;
    const use = actions.querySelector('#icdUseDiagnosis');
    if (use) actions.insertBefore(button, use);
    else actions.appendChild(button);
    return button;
  }

  function announce(message) {
    const node = rootRef?.document.getElementById('icdComparisonStatus');
    if (node) node.textContent = message;
  }

  function writeStorage() {
    try {
      if (items.length) rootRef.sessionStorage.setItem(STORAGE_KEY, serializeCodes(items));
      else rootRef.sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  function readStorage() {
    try { return parseCodes(rootRef.sessionStorage.getItem(STORAGE_KEY)); }
    catch { return []; }
  }

  function setItems(next, reason = 'updated') {
    items = normalizeItems(next);
    writeStorage();
    render();
    updateAddButtons();
    rootRef.dispatchEvent(new rootRef.CustomEvent('medindex:icd-comparison', {
      detail:{ version:VERSION, reason, count:items.length, codes:items.map(item => item.node.code) },
    }));
    return items;
  }

  function summaryMarkup(summary) {
    const relation = summary.relation;
    const common = summary.commonAncestor || '—';
    const levels = summary.levels.length ? summary.levels.join(' + ') : '—';
    const specific = summary.specificCodes.length ? summary.specificCodes.join(', ') : '—';
    return `<div data-tone="${esc(relation.tone)}"><small>Marrëdhënia</small><strong>${esc(relation.label)}</strong><p>${esc(relation.note)}</p></div>
      <div><small>Paraardhësi i përbashkët</small><strong>${esc(common)}</strong><p>${summary.commonAncestor ? 'Dega më e afërt e përbashkët në hierarki.' : 'Nuk u gjet paraardhës i përbashkët direkt.'}</p></div>
      <div><small>Nivelet</small><strong>${esc(levels)}</strong><p>${summary.sameLevel ? 'Kodet janë në të njëjtin nivel strukturor.' : 'Kodet janë në nivele të ndryshme.'}</p></div>
      <div><small>Pa nënkode direkte</small><strong>${esc(specific)}</strong><p>Specifikësi strukturore, jo rekomandim automatik klinik.</p></div>`;
  }

  function cardMarkup(item, summary) {
    const node = item.node;
    const terminology = terminologyInfo(node.translationStatus);
    const specificity = specificityInfo(node);
    const levelDiff = !summary.sameLevel;
    const parentDiff = items.some(entry => entry.node.parentCode !== node.parentCode);
    return `<article class="icd-comparison-card" role="listitem" data-comparison-code="${esc(node.code)}">
      <header>
        <span class="icd-comparison-code">${esc(node.code)}</span>
        <button type="button" data-mi-icd-comparison-remove="${esc(node.code)}" aria-label="Hiqe ${esc(node.code)} nga krahasimi">×</button>
      </header>
      <div class="icd-comparison-title"><strong>${esc(node.displayTitle)}</strong>${node.titleEn && node.titleEn.toLowerCase() !== node.displayTitle.toLowerCase() ? `<small>${esc(node.titleEn)}</small>` : ''}</div>
      <div class="icd-comparison-badges"><span data-tone="${levelDiff ? 'difference' : 'same'}">${esc(levelLabel(node.level))}</span><span data-tone="${esc(terminology.tone)}">${esc(terminology.label)}</span></div>
      <dl>
        <div${parentDiff ? ' data-difference="true"' : ''}><dt>Kodi prind</dt><dd>${esc(node.parentCode || '—')}</dd></div>
        <div><dt>Nënkode direkte</dt><dd>${node.childCount}</dd></div>
        <div data-tone="${esc(specificity.tone)}"><dt>Specifikësia</dt><dd>${esc(specificity.label)}</dd></div>
        <div><dt>Hierarkia</dt><dd>${esc(pathOf(item).join(' › '))}</dd></div>
      </dl>
      <p class="icd-comparison-specificity-note">${esc(specificity.note)}</p>
      <div class="icd-comparison-card-actions">
        <button type="button" data-mi-icd-comparison-open="${esc(node.code)}">Shiko në pemë</button>
        <button type="button" data-mi-icd-comparison-detail="${esc(node.code)}">Detaje</button>
        <button class="is-primary" type="button" data-mi-icd-comparison-primary="${esc(node.code)}">Kryesore</button>
        <button type="button" data-mi-icd-comparison-secondary="${esc(node.code)}">Shoqëruese</button>
      </div>
    </article>`;
  }

  function render() {
    const host = ensureHost();
    if (!host) return;
    const count = rootRef.document.getElementById('icdComparisonCount');
    const empty = rootRef.document.getElementById('icdComparisonEmpty');
    const summaryNode = rootRef.document.getElementById('icdComparisonSummary');
    const grid = rootRef.document.getElementById('icdComparisonGrid');
    const disclaimer = rootRef.document.getElementById('icdComparisonDisclaimer');
    const copy = host.querySelector('[data-mi-icd-comparison-copy]');
    const clear = host.querySelector('[data-mi-icd-comparison-clear]');
    const body = rootRef.document.getElementById('icdComparisonBody');
    const toggle = host.querySelector('[data-mi-icd-comparison-toggle]');
    const summary = comparisonSummary(items);

    count.textContent = `${items.length}/${MAX_ITEMS}`;
    count.setAttribute('aria-label', `${items.length} nga ${MAX_ITEMS} kode`);
    empty.hidden = items.length > 0;
    summaryNode.hidden = items.length < 2;
    summaryNode.innerHTML = items.length >= 2 ? summaryMarkup(summary) : '';
    grid.innerHTML = items.map(item => cardMarkup(item, summary)).join('');
    disclaimer.hidden = items.length < 2;
    copy.hidden = items.length < 2;
    clear.hidden = items.length < 1;
    body.hidden = collapsed;
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.textContent = collapsed ? 'Hap' : 'Mbyll';
    host.dataset.count = String(items.length);
  }

  function updateAddButtons() {
    const activeButton = ensureWorkspaceButton();
    const active = normalizeResolved(activeResolved);
    if (activeButton) {
      const code = active?.node?.code || '';
      const included = code && items.some(item => item.node.code === code);
      activeButton.hidden = !code;
      activeButton.disabled = Boolean(included || (!included && items.length >= MAX_ITEMS));
      activeButton.textContent = included ? 'Në krahasim' : items.length >= MAX_ITEMS ? 'Krahasimi është plot' : 'Shto në krahasim';
      activeButton.setAttribute('aria-label', code ? `${activeButton.textContent}: ${code}` : activeButton.textContent);
    }

    const detailButton = ensureDetailButton();
    if (detailButton) {
      const code = normalizeCode(detailCode);
      const included = code && items.some(item => item.node.code === code);
      detailButton.hidden = !code;
      detailButton.disabled = Boolean(included || (!included && items.length >= MAX_ITEMS));
      detailButton.textContent = included ? 'Në krahasim' : items.length >= MAX_ITEMS ? 'Krahasimi është plot' : 'Shto në krahasim';
    }
  }

  async function resolveCode(code) {
    const target = normalizeCode(code);
    if (!target || !rootRef) return null;
    const response = await rootRef.fetch(`${API_PATH}?view=resolve&code=${encodeURIComponent(target)}`, {
      credentials:'same-origin', cache:'no-store', headers:{ Accept:'application/json' },
    });
    if (!response.ok) throw new Error(`ICD API ${response.status}`);
    const payload = await response.json();
    if (!payload?.ok || !payload?.data?.node) throw new Error('Kodi ICD-10 nuk u gjet.');
    return normalizeResolved(payload.data);
  }

  async function addResolved(value, source = 'workspace') {
    const item = normalizeResolved(value);
    if (!item) {
      announce('Vetëm kategoritë dhe nënkategoritë mund të krahasohen.');
      return false;
    }
    if (items.some(entry => entry.node.code === item.node.code)) {
      announce(`${item.node.code} është tashmë në krahasim.`);
      return false;
    }
    if (items.length >= MAX_ITEMS) {
      announce(`Krahasimi lejon maksimum ${MAX_ITEMS} kode. Hiq një kod para se të shtosh tjetër.`);
      return false;
    }
    setItems(addItem(items, item), `added-${source}`);
    announce(`${item.node.code} u shtua në krahasim.`);
    return true;
  }

  async function addCode(code, source = 'api') {
    try {
      const item = await resolveCode(code);
      return await addResolved(item, source);
    } catch (error) {
      announce(clean(error.message) || 'Kodi nuk u shtua në krahasim.');
      return false;
    }
  }

  function removeCode(code) {
    const target = normalizeCode(code);
    if (!target || !items.some(item => item.node.code === target)) return false;
    setItems(removeItem(items, target), 'removed');
    announce(`${target} u hoq nga krahasimi.`);
    return true;
  }

  async function writeClipboard(value) {
    try {
      await rootRef.navigator.clipboard.writeText(value);
      return true;
    } catch {}
    const area = rootRef.document.createElement('textarea');
    area.value = value;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    rootRef.document.body.appendChild(area);
    area.select();
    const success = rootRef.document.execCommand('copy');
    area.remove();
    return success;
  }

  async function copyComparison() {
    const value = copyText(items);
    if (!value) return false;
    await writeClipboard(value);
    announce('Krahasimi ICD u kopjua pa metadata teknike.');
    return true;
  }

  function handoff(code, kind) {
    const item = items.find(entry => entry.node.code === normalizeCode(code));
    const context = diagnosisContext(item);
    if (!context) return false;
    const secondary = kind === 'secondary';
    try {
      rootRef.sessionStorage.setItem(secondary ? SECONDARY_KEY : PRIMARY_KEY, JSON.stringify(context));
    } catch {
      announce('Shfletuesi nuk lejoi ruajtjen e përkohshme të kodit.');
      return false;
    }
    rootRef.location.assign(secondary ? '/recetat.html?from=icd-secondary' : '/recetat.html?from=icd');
    return true;
  }

  async function restore() {
    const sequence = ++loadSequence;
    const codes = readStorage();
    if (!codes.length) return render();
    announce('Po rikthehet krahasimi i sesionit…');
    const settled = await Promise.allSettled(codes.map(resolveCode));
    if (sequence !== loadSequence) return;
    const restored = settled.filter(result => result.status === 'fulfilled').map(result => result.value).filter(Boolean);
    setItems(restored, 'restored');
    announce(restored.length ? `U rikthyen ${restored.length} kode në krahasim.` : 'Kodet e ruajtura nuk u rikthyen.');
  }

  function bind() {
    const document = rootRef.document;
    rootRef.addEventListener('medindex:icd-coding-workspace-active', event => {
      activeResolved = normalizeResolved(event.detail?.resolved);
      updateAddButtons();
    });

    document.addEventListener('click', event => {
      const openCode = event.target.closest('[data-open-code]');
      const addActive = event.target.closest('[data-mi-icd-compare-active]');
      const addDetail = event.target.closest('[data-mi-icd-compare-detail]');
      const remove = event.target.closest('[data-mi-icd-comparison-remove]');
      const open = event.target.closest('[data-mi-icd-comparison-open]');
      const detail = event.target.closest('[data-mi-icd-comparison-detail]');
      const primary = event.target.closest('[data-mi-icd-comparison-primary]');
      const secondary = event.target.closest('[data-mi-icd-comparison-secondary]');
      const clear = event.target.closest('[data-mi-icd-comparison-clear]');
      const copy = event.target.closest('[data-mi-icd-comparison-copy]');
      const toggle = event.target.closest('[data-mi-icd-comparison-toggle]');

      if (openCode) {
        detailCode = normalizeCode(openCode.dataset.openCode);
        updateAddButtons();
      }
      if (addActive) addResolved(activeResolved, 'workspace');
      if (addDetail && detailCode) addCode(detailCode, 'detail');
      if (remove) removeCode(remove.dataset.miIcdComparisonRemove);
      if (open) rootRef.location.assign(`/icd.html?code=${encodeURIComponent(open.dataset.miIcdComparisonOpen)}`);
      if (detail) rootRef.dispatchEvent(new rootRef.CustomEvent('medindex:icd-open-detail', { detail:{ code:detail.dataset.miIcdComparisonDetail } }));
      if (primary) handoff(primary.dataset.miIcdComparisonPrimary, 'primary');
      if (secondary) handoff(secondary.dataset.miIcdComparisonSecondary, 'secondary');
      if (clear) {
        setItems([], 'cleared');
        announce('Krahasimi u pastrua.');
      }
      if (copy) copyComparison();
      if (toggle) {
        collapsed = !collapsed;
        render();
      }
    });

    rootRef.addEventListener('medindex:icd-open-detail', event => {
      detailCode = normalizeCode(event.detail?.code);
      updateAddButtons();
    });
  }

  function init(rootWindow) {
    if (initialized || !rootWindow?.document?.getElementById('icdTree')) return false;
    rootRef = rootWindow;
    initialized = true;
    ensureHost();
    ensureWorkspaceButton();
    ensureDetailButton();
    bind();
    const current = rootRef.MedIndexIcdCodingWorkspace?.current?.();
    if (current) activeResolved = normalizeResolved(current);
    render();
    updateAddButtons();
    restore();
    rootRef.document.documentElement.dataset.miIcdCodeComparison = VERSION;
    rootRef.dispatchEvent(new rootRef.CustomEvent('medindex:icd-code-comparison-ready', {
      detail:{ version:VERSION, maxItems:MAX_ITEMS },
    }));
    return true;
  }

  return Object.freeze({
    VERSION,
    STORAGE_KEY,
    MAX_ITEMS,
    normalizeCode,
    normalizeNode,
    normalizeResolved,
    normalizeItems,
    addItem,
    removeItem,
    serializeCodes,
    parseCodes,
    levelLabel,
    terminologyInfo,
    specificityInfo,
    deepestCommonAncestor,
    relationInfo,
    comparisonSummary,
    copyText,
    diagnosisContext,
    addCode,
    removeCode,
    current:() => normalizeItems(items),
    init,
  });
});