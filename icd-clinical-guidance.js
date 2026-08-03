(function bootstrapIcdClinicalGuidance(root, factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!root) return;

  root.MedIndexIcdClinicalGuidance = api;
  const start = () => api.init(root);
  if (root.document?.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})(typeof window !== 'undefined' ? window : null, function createIcdClinicalGuidance() {
  'use strict';

  const VERSION = 'icd-clinical-guidance-v2';
  const API_PATH = '/api/icd';
  const MAX_KEYWORDS = 8;
  const CODE_PATTERN = /^[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?$/;
  const SPREADSHEET_PATTERN = /^[A-Za-z0-9_-]{20,}$/;

  let rootRef = null;
  let initialized = false;
  let datasetPromise = null;
  let datasetIndex = new Map();
  let datasetMeta = null;
  let activeCode = '';
  let renderSequence = 0;
  let codeObserver = null;
  let authObserver = null;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const safeText = (value, max = 1000) => clean(value).slice(0, max);
  const normalized = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[character]));

  function normalizeCode(value) {
    const code = safeText(value, 24).toUpperCase();
    return CODE_PATTERN.test(code) ? code : '';
  }

  function stringList(value, max = 12, itemMax = 500) {
    const source = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/\r?\n|;/)
        : [];
    const seen = new Set();
    const result = [];
    for (const item of source) {
      const text = safeText(item, itemMax);
      const key = normalized(text);
      if (!text || seen.has(key)) continue;
      seen.add(key);
      result.push(text);
      if (result.length >= max) break;
    }
    return result;
  }

  function booleanValue(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const text = normalized(value);
    if (['true', 'po', 'yes', '1'].includes(text)) return true;
    if (['false', 'jo', 'no', '0'].includes(text)) return false;
    return fallback;
  }

  function normalizeEntry(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const code = normalizeCode(value.code || value['Kodi ICD-10'] || value.Kodi);
    if (!code) return null;
    const primaryCare = safeText(value.primaryCare || value.familyMedicine || value['Mjekësi familjare'], 120);
    const emergency = safeText(value.emergency || value.urgency || value.Urgjencë, 120);
    const emergencyKey = normalized(emergency);
    return {
      code,
      title:safeText(value.title || value.titleSq || value['Emri në shqip'], 500),
      englishTitle:safeText(value.englishTitle || value.titleEn || value['Emri në anglisht'], 500),
      chapter:safeText(value.chapter || value.Kapitulli, 120),
      group:safeText(value.group || value.parent || value['Grupi / nënkategoria klinike'], 300),
      primaryCare,
      emergency,
      priority:safeText(value.priority || value.Prioriteti, 160),
      summary:safeText(value.summary || value['Përdorimi tipik'], 1200),
      warning:safeText(value.warning || value['Shenja alarmi / kujdes'], 1200),
      keywords:stringList(value.keywords || value['Fjalë kyçe'], MAX_KEYWORDS, 120),
      codingNotes:stringList(value.codingNotes || value.codingNote || value['Shënim kodimi'], 8, 1000),
      includes:stringList(value.includes || value.inclusionNotes, 12, 1000),
      excludes:stringList(value.excludes || value.exclusionNotes, 12, 1000),
      codeFirst:stringList(value.codeFirst || value.codeFirstNotes, 12, 1000),
      useAdditionalCode:stringList(value.useAdditionalCode || value.additionalCodeNotes, 12, 1000),
      sourceUrl:/^https:\/\//i.test(clean(value.sourceUrl || value['Burimi WHO'])) ? clean(value.sourceUrl || value['Burimi WHO']) : '',
      isFamilyMedicine:booleanValue(value.isFamilyMedicine, Boolean(primaryCare && primaryCare !== '—')),
      isEmergency:booleanValue(value.isEmergency, Boolean(emergency && emergency !== '—')),
      isCritical:booleanValue(value.isCritical, emergencyKey === 'kritik' || emergencyKey.includes('kritik')),
    };
  }

  function buildIndex(values) {
    const source = Array.isArray(values) ? values : [];
    const index = new Map();
    for (const value of source) {
      const entry = normalizeEntry(value);
      if (!entry || index.has(entry.code)) continue;
      index.set(entry.code, entry);
    }
    return index;
  }

  function categoryCode(value) {
    const code = normalizeCode(value);
    return code ? code.slice(0, 3) : '';
  }

  function resolveClinicalContext(value, source) {
    const requestedCode = normalizeCode(value);
    if (!requestedCode) return null;
    const index = source instanceof Map ? source : buildIndex(source);
    const exact = index.get(requestedCode);
    if (exact) {
      return {
        requestedCode,
        sourceCode:requestedCode,
        inherited:false,
        entry:exact,
      };
    }
    const category = categoryCode(requestedCode);
    const inherited = requestedCode.includes('.') ? index.get(category) : null;
    if (!inherited) return null;
    return {
      requestedCode,
      sourceCode:category,
      inherited:true,
      entry:inherited,
    };
  }

  function officialCodingSections(value) {
    const entry = normalizeEntry(value) || value || {};
    const sections = [
      { key:'includes', label:'Përfshin', items:stringList(entry.includes, 12, 1000) },
      { key:'excludes', label:'Përjashton', items:stringList(entry.excludes, 12, 1000) },
      { key:'codeFirst', label:'Kodifiko së pari', items:stringList(entry.codeFirst, 12, 1000) },
      { key:'useAdditionalCode', label:'Përdor kod shtesë', items:stringList(entry.useAdditionalCode, 12, 1000) },
    ];
    return {
      available:sections.some(section => section.items.length > 0),
      sections,
    };
  }

  function sourceLabel(value) {
    const source = normalized(value?.dataSource || value?.sourceState);
    if (source === 'sheets') return 'Google Sheet klinik · drejtpërdrejt';
    if (source === 'sheets-fallback') return 'Google Sheet klinik · fallback i sigurt';
    if (source === 'neon') return 'Google Sheet klinik · kopje e sinkronizuar';
    return 'Lista klinike MF & urgjencë';
  }

  function urgencyTone(value) {
    const entry = normalizeEntry(value) || value || {};
    const emergency = normalized(entry.emergency);
    const priority = normalized(entry.priority);
    if (entry.isCritical || emergency.includes('kritik')) return 'critical';
    if (priority.startsWith('1') || emergency.includes('shume i rendesishem')) return 'urgent';
    if (emergency.includes('i shpeshte')) return 'frequent';
    return 'neutral';
  }

  function copyText(context, meta = {}) {
    if (!context?.entry) return '';
    const entry = normalizeEntry(context.entry);
    if (!entry) return '';
    const official = officialCodingSections(entry);
    const lines = [
      'KONTEKST KLINIK ICD-10-WHO 2019',
      `Kodi: ${context.requestedCode}`,
      context.inherited ? `Konteksti: i trashëguar nga kategoria ${context.sourceCode}` : 'Konteksti: përputhje e drejtpërdrejtë',
      `Mjekësi familjare: ${entry.primaryCare || '—'}`,
      `Urgjencë: ${entry.emergency || '—'}`,
      `Prioriteti: ${entry.priority || '—'}`,
    ];
    if (entry.summary) lines.push(`Përdorimi tipik: ${entry.summary}`);
    if (entry.warning) lines.push(`Shenja alarmi / kujdes: ${entry.warning}`);
    if (entry.codingNotes.length) lines.push(`Shënim kodimi: ${entry.codingNotes.join(' | ')}`);
    if (entry.keywords.length) lines.push(`Fjalë kyçe: ${entry.keywords.join(', ')}`);
    if (official.available) {
      for (const section of official.sections) {
        if (section.items.length) lines.push(`${section.label}: ${section.items.join(' | ')}`);
      }
    } else {
      lines.push('Shënime zyrtare të strukturuara: nuk janë të disponueshme në burimin aktual; nuk duhen supozuar.');
    }
    lines.push('', 'Shënim sigurie: prioriteti është kontekst dokumentimi, jo protokoll automatik triazhimi ose trajtimi.');
    return lines.join('\n').trim();
  }

  function ensureHost() {
    const document = rootRef?.document;
    if (!document) return null;
    let host = document.getElementById('icdClinicalGuidance');
    if (host) return host;
    const workspace = document.getElementById('icdCodingWorkspace');
    const tree = document.querySelector('.icd-tree-panel');
    if (!workspace && !tree) return null;

    host = document.createElement('section');
    host.id = 'icdClinicalGuidance';
    host.className = 'icd-clinical-guidance';
    host.setAttribute('aria-labelledby', 'icdClinicalGuidanceTitle');
    host.innerHTML = `<header class="icd-clinical-guidance-head">
      <div>
        <p class="med-kicker">Google Sheet klinik · mjekësi familjare & urgjencë</p>
        <h2 id="icdClinicalGuidanceTitle">Konteksti klinik dhe kodimi i sigurt</h2>
        <p>Lidh hierarkinë e plotë ICD-10 me listën e përzgjedhur të kodeve të përdorura në MF, urgjencë dhe gjendje kritike.</p>
      </div>
      <span id="icdClinicalGuidanceState" class="icd-clinical-guidance-state" role="status" aria-live="polite">Pa kod aktiv</span>
    </header>
    <div id="icdClinicalGuidanceEmpty" class="icd-clinical-guidance-empty">
      <span aria-hidden="true">MF</span>
      <div><strong>Zgjidh një kategori ose nënkategori</strong><p>Konteksti klinik shfaqet vetëm kur kodi ekziston në listën e përzgjedhur ose trashëgohet qartë nga kategoria e tij.</p></div>
    </div>
    <div id="icdClinicalGuidanceContent" class="icd-clinical-guidance-content" hidden>
      <div id="icdClinicalGuidanceInheritance" class="icd-clinical-guidance-inheritance" hidden></div>
      <div class="icd-clinical-guidance-metrics">
        <section><small>Mjekësi familjare</small><strong id="icdClinicalGuidanceFamily">—</strong><p>Rëndësia praktike në listën klinike të përdorueses.</p></section>
        <section><small>Urgjencë</small><strong id="icdClinicalGuidanceEmergency">—</strong><p>Rëndësia në vlerësimin akut dhe urgjent.</p></section>
        <section><small>Prioriteti</small><strong id="icdClinicalGuidancePriority">—</strong><p>Prioritet dokumentimi, jo vendim automatik triazhimi.</p></section>
      </div>
      <section id="icdClinicalGuidanceWarning" class="icd-clinical-guidance-warning" hidden>
        <small>Shenja alarmi / kujdes</small><strong id="icdClinicalGuidanceWarningTitle">Vëmendje klinike</strong><p id="icdClinicalGuidanceWarningText"></p>
      </section>
      <div class="icd-clinical-guidance-detail-grid">
        <section id="icdClinicalGuidanceUse" hidden><small>Përdorimi tipik</small><p></p></section>
        <section id="icdClinicalGuidanceCoding"><small>Kodimi i sigurt</small><div id="icdClinicalGuidanceCodingNotes"></div></section>
      </div>
      <section id="icdClinicalGuidanceOfficial" class="icd-clinical-guidance-official">
        <small>Shënimet zyrtare të strukturuara</small>
        <div id="icdClinicalGuidanceOfficialContent"></div>
      </section>
      <div id="icdClinicalGuidanceKeywords" class="icd-clinical-guidance-keywords" hidden></div>
      <footer class="icd-clinical-guidance-footer">
        <span id="icdClinicalGuidanceSource">Lista klinike MF & urgjencë</span>
        <div>
          <a id="icdClinicalGuidanceSourceLink" href="#" target="_blank" rel="noopener noreferrer" hidden>Hap Google Sheet-in</a>
          <button type="button" data-mi-icd-clinical-copy>Kopjo kontekstin</button>
          <button type="button" data-mi-icd-clinical-retry hidden>Riprovo</button>
        </div>
      </footer>
      <p class="icd-clinical-guidance-disclaimer">Ky panel ndihmon dokumentimin dhe orientimin e kodimit. Nuk vendos diagnozë, triazh apo trajtim automatik.</p>
      <p id="icdClinicalGuidanceStatus" class="sr-only" role="status" aria-live="polite"></p>
    </div>`;

    if (workspace?.parentElement) workspace.insertAdjacentElement('afterend', host);
    else tree?.parentElement?.insertBefore(host, tree);
    return host;
  }

  function stateNode() {
    return rootRef?.document.getElementById('icdClinicalGuidanceState');
  }

  function setState(text, tone = '') {
    const node = stateNode();
    if (!node) return;
    node.textContent = text;
    node.dataset.tone = tone;
  }

  function announce(text) {
    const node = rootRef?.document.getElementById('icdClinicalGuidanceStatus');
    if (node) node.textContent = text;
  }

  function setEmpty(title, text, tone = '') {
    const host = ensureHost();
    if (!host) return;
    const empty = rootRef.document.getElementById('icdClinicalGuidanceEmpty');
    const content = rootRef.document.getElementById('icdClinicalGuidanceContent');
    empty.hidden = false;
    content.hidden = true;
    empty.dataset.tone = tone;
    empty.querySelector('strong').textContent = title;
    empty.querySelector('p').textContent = text;
  }

  function codingNotesMarkup(entry, context) {
    const notes = [...entry.codingNotes];
    if (context.inherited) notes.unshift(`Konteksti klinik vjen nga kategoria ${context.sourceCode}; verifiko nënkodin ${context.requestedCode} në hierarkinë e plotë.`);
    if (!notes.length) notes.push('Kontrollo nivelin më specifik të mbështetur nga dokumentacioni klinik para kodimit përfundimtar.');
    return `<ul>${notes.map(note => `<li>${esc(note)}</li>`).join('')}</ul>`;
  }

  function officialMarkup(entry) {
    const official = officialCodingSections(entry);
    if (!official.available) {
      return '<p class="is-unavailable"><strong>Nuk janë të disponueshme në burimin aktual.</strong> MedIndex nuk fabrikon shënime “Përfshin”, “Përjashton”, “Kodifiko së pari” ose “Përdor kod shtesë”. Kontrollo burimin zyrtar para kodimit përfundimtar.</p>';
    }
    return official.sections.filter(section => section.items.length).map(section =>
      `<section><strong>${esc(section.label)}</strong><ul>${section.items.map(item => `<li>${esc(item)}</li>`).join('')}</ul></section>`
    ).join('');
  }

  function renderContext(context) {
    const host = ensureHost();
    if (!host || !context?.entry) return false;
    const entry = normalizeEntry(context.entry);
    if (!entry) return false;
    const document = rootRef.document;
    const empty = document.getElementById('icdClinicalGuidanceEmpty');
    const content = document.getElementById('icdClinicalGuidanceContent');
    empty.hidden = true;
    content.hidden = false;

    const inheritance = document.getElementById('icdClinicalGuidanceInheritance');
    inheritance.hidden = !context.inherited;
    inheritance.innerHTML = context.inherited
      ? `<strong>Kontekst i trashëguar nga ${esc(context.sourceCode)}</strong><span>${esc(context.requestedCode)} nuk ka rresht të veçantë në listën e përzgjedhur; përdoren vetëm të dhënat e kategorisë.</span>`
      : '';

    const family = document.getElementById('icdClinicalGuidanceFamily');
    const emergency = document.getElementById('icdClinicalGuidanceEmergency');
    const priority = document.getElementById('icdClinicalGuidancePriority');
    family.textContent = entry.primaryCare || '—';
    emergency.textContent = entry.emergency || '—';
    priority.textContent = entry.priority || '—';
    emergency.dataset.tone = urgencyTone(entry);
    priority.dataset.tone = urgencyTone(entry);

    const warning = document.getElementById('icdClinicalGuidanceWarning');
    warning.hidden = !entry.warning;
    warning.dataset.tone = urgencyTone(entry);
    document.getElementById('icdClinicalGuidanceWarningTitle').textContent = entry.isCritical ? 'Gjendje potencialisht kritike' : 'Vëmendje klinike';
    document.getElementById('icdClinicalGuidanceWarningText').textContent = entry.warning;

    const usage = document.getElementById('icdClinicalGuidanceUse');
    usage.hidden = !entry.summary;
    usage.querySelector('p').textContent = entry.summary;
    document.getElementById('icdClinicalGuidanceCodingNotes').innerHTML = codingNotesMarkup(entry, context);
    document.getElementById('icdClinicalGuidanceOfficialContent').innerHTML = officialMarkup(entry);

    const keywords = document.getElementById('icdClinicalGuidanceKeywords');
    keywords.hidden = !entry.keywords.length;
    keywords.innerHTML = entry.keywords.map(keyword => `<span>${esc(keyword)}</span>`).join('');

    document.getElementById('icdClinicalGuidanceSource').textContent = sourceLabel(datasetMeta);
    const sourceLink = document.getElementById('icdClinicalGuidanceSourceLink');
    const spreadsheetId = safeText(datasetMeta?.sourceSpreadsheetId, 100);
    sourceLink.hidden = !SPREADSHEET_PATTERN.test(spreadsheetId);
    sourceLink.href = sourceLink.hidden ? '#' : `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`;
    host.dataset.tone = urgencyTone(entry);
    host.dataset.context = context.inherited ? 'inherited' : 'exact';
    setState(`${context.requestedCode} · ${entry.emergency || entry.primaryCare || 'kontekst klinik'}`, urgencyTone(entry));
    announce(`Konteksti klinik për ${context.requestedCode} u ngarkua.`);
    return true;
  }

  function renderNotSelected() {
    setEmpty('Zgjidh një kod për kontekstin klinik', 'Paneli lidhet me kategoritë dhe nënkategoritë e workspace-it.', 'empty');
    setState('Pa kod aktiv', 'empty');
    return false;
  }

  function renderNotCurated(code) {
    setEmpty(
      `${code} nuk është në setin e përzgjedhur`,
      'Kjo nuk do të thotë se kodi nuk është relevant. Përdor hierarkinë e plotë dhe kontrollo burimin zyrtar; MedIndex nuk i cakton prioritet klinik pa të dhëna burimore.',
      'not-curated',
    );
    setState(`${code} · pa klasifikim MF/urgjencë`, 'not-curated');
    return false;
  }

  function renderLoading(code) {
    setEmpty('Po ngarkohet lista klinike…', `Po kërkohet konteksti MF dhe urgjencë për ${code}.`, 'loading');
    setState('Duke ngarkuar…', 'loading');
  }

  function renderError(message) {
    const host = ensureHost();
    setEmpty('Konteksti klinik nuk u ngarkua', safeText(message, 300) || 'Workspace-i ICD mbetet i përdorshëm. Riprovo ngarkimin e listës klinike.', 'error');
    setState('Burimi klinik i padisponueshëm', 'error');
    const retryButton = host?.querySelector('[data-mi-icd-clinical-retry]');
    if (retryButton) retryButton.hidden = false;
    return false;
  }

  function authReady() {
    return rootRef?.document.documentElement.classList.contains('auth-ready');
  }

  async function loadDataset(force = false) {
    if (force) {
      datasetPromise = null;
      datasetIndex = new Map();
      datasetMeta = null;
    }
    if (datasetPromise) return datasetPromise;
    datasetPromise = (async () => {
      const response = await rootRef.fetch(API_PATH, {
        credentials:'same-origin',
        cache:'no-store',
        headers:{ Accept:'application/json' },
      });
      if (!response.ok) throw new Error(`Lista klinike ktheu statusin ${response.status}.`);
      const payload = await response.json();
      const entries = payload?.data?.entries;
      if (!payload?.ok || !Array.isArray(entries)) throw new Error('Lista klinike nuk kishte strukturën e pritur.');
      datasetIndex = buildIndex(entries);
      if (!datasetIndex.size) throw new Error('Lista klinike nuk përmbante kode të vlefshme.');
      datasetMeta = {
        dataSource:response.headers.get('X-MedIndex-Data-Source') || '',
        source:payload.data.source || '',
        sourceSpreadsheetId:payload.data.sourceSpreadsheetId || '',
        counts:payload.data.counts || null,
      };
      const retryButton = ensureHost()?.querySelector('[data-mi-icd-clinical-retry]');
      if (retryButton) retryButton.hidden = true;
      return datasetIndex;
    })().catch(error => {
      datasetPromise = null;
      throw error;
    });
    return datasetPromise;
  }

  async function updateForCode(value) {
    const code = normalizeCode(value);
    activeCode = code;
    const sequence = ++renderSequence;
    if (!code) return renderNotSelected();
    if (!authReady()) {
      renderLoading(code);
      return false;
    }
    renderLoading(code);
    try {
      const index = await loadDataset();
      if (sequence !== renderSequence || code !== activeCode) return false;
      const context = resolveClinicalContext(code, index);
      if (!context) return renderNotCurated(code);
      return renderContext(context);
    } catch (error) {
      if (sequence === renderSequence) return renderError(error?.message || error);
      return false;
    }
  }

  async function retry() {
    const code = normalizeCode(activeCode || activeWorkspaceCode());
    if (!code || !authReady()) return false;
    activeCode = code;
    const sequence = ++renderSequence;
    renderLoading(code);
    try {
      const index = await loadDataset(true);
      if (sequence !== renderSequence || code !== activeCode) return false;
      const context = resolveClinicalContext(code, index);
      if (!context) return renderNotCurated(code);
      const rendered = renderContext(context);
      if (rendered) {
        rootRef.document.documentElement.dataset.miIcdClinicalRecoveryResult = 'success';
        rootRef.dispatchEvent(new rootRef.CustomEvent('medindex:icd-clinical-recovered', {
          detail:{ code, source:datasetMeta?.dataSource || '' },
        }));
      }
      return rendered;
    } catch (error) {
      if (sequence === renderSequence) renderError(error?.message || error);
      rootRef.document.documentElement.dataset.miIcdClinicalRecoveryResult = 'error';
      return false;
    }
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

  async function copyActive() {
    const context = resolveClinicalContext(activeCode, datasetIndex);
    const text = copyText(context, datasetMeta);
    if (!text) return announce('Nuk ka kontekst klinik për kopjim.');
    const success = await writeClipboard(text);
    announce(success ? 'Konteksti klinik u kopjua.' : 'Kopjimi nuk u krye.');
  }

  function activeWorkspaceCode() {
    return normalizeCode(rootRef?.document.getElementById('icdCodingWorkspaceCode')?.textContent);
  }

  function observeCode() {
    const node = rootRef?.document.getElementById('icdCodingWorkspaceCode');
    if (!node || codeObserver) return;
    codeObserver = new MutationObserver(() => updateForCode(activeWorkspaceCode()));
    codeObserver.observe(node, { childList:true, characterData:true, subtree:true });
    updateForCode(activeWorkspaceCode());
  }

  function observeAuth() {
    if (authObserver || authReady()) return;
    authObserver = new MutationObserver(() => {
      if (!authReady()) return;
      authObserver.disconnect();
      authObserver = null;
      updateForCode(activeWorkspaceCode());
    });
    authObserver.observe(rootRef.document.documentElement, { attributes:true, attributeFilter:['class'] });
  }

  function bind() {
    rootRef.document.addEventListener('click', event => {
      if (event.target.closest('[data-mi-icd-clinical-copy]')) void copyActive();
      if (event.target.closest('[data-mi-icd-clinical-retry]')) void retry();
    });
    rootRef.addEventListener('medindex:icd-state', event => {
      const code = normalizeCode(event.detail?.code || event.detail?.node?.code);
      if (code) void updateForCode(code);
    });
    rootRef.addEventListener('popstate', () => {
      const code = normalizeCode(new URL(rootRef.location.href).searchParams.get('code'));
      if (code) void updateForCode(code);
    });
  }

  function init(rootWindow) {
    if (initialized || !rootWindow?.document?.getElementById('icdTree')) return false;
    rootRef = rootWindow;
    initialized = true;
    ensureHost();
    bind();
    observeCode();
    observeAuth();
    rootRef.document.documentElement.dataset.miIcdClinicalGuidance = VERSION;
    rootRef.dispatchEvent(new rootRef.CustomEvent('medindex:icd-clinical-guidance-ready', {
      detail:{ version:VERSION },
    }));
    return true;
  }

  return Object.freeze({
    VERSION,
    MAX_KEYWORDS,
    normalizeCode,
    stringList,
    normalizeEntry,
    buildIndex,
    categoryCode,
    resolveClinicalContext,
    officialCodingSections,
    sourceLabel,
    urgencyTone,
    copyText,
    retry,
    init,
  });
});