/* Protokollet V2 — consolidated runtime. */

(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);

  async function authJson(url = '/api/auth', options = {}, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        credentials:'same-origin',
        cache:'no-store',
        ...options,
        signal:controller.signal,
        headers:{ Accept:'application/json', ...(options.headers || {}) },
      });
      const payload = await response.json().catch(() => ({}));
      return { response, payload };
    } finally {
      clearTimeout(timer);
    }
  }

  function redirectToLogin() {
    const target = new URL('/landing.html', location.origin);
    target.searchParams.set('return', location.pathname + location.search + location.hash);
    location.replace(target.pathname + target.search);
  }

  async function ensureAuth() {
    const { response, payload } = await authJson();
    const signedOut = response.status === 401
      || response.status === 403
      || (response.ok && payload.authenticated === false);
    if (signedOut) {
      redirectToLogin();
      throw new Error('Sesioni nuk është aktiv.');
    }
    if (!response.ok || payload.authenticated !== true) {
      throw new Error('Sesioni nuk mund të verifikohet për momentin.');
    }
    return payload;
  }

  function loadRuntime(src, marker) {
    const existing = document.querySelector(`script[${marker}]`);
    if (existing) {
      return new Promise(resolve => {
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load', resolve, { once:true });
        setTimeout(resolve, 1800);
      });
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.setAttribute(marker, '1');
      script.addEventListener('load', () => {
        script.dataset.loaded = '1';
        resolve();
      }, { once:true });
      script.addEventListener('error', reject, { once:true });
      document.head.appendChild(script);
    });
  }

  async function syncProfile(payload) {
    await loadRuntime('/medindex-brand-runtime.js?v=drx-brand-v5', 'data-drx-profile-runtime').catch(() => null);
    window.MedIndexProfile?.adoptAccount?.(payload);
    window.dispatchEvent(new CustomEvent('medindex:auth-ready', { detail:payload }));
  }

  function loadSharedSidebarTaxonomy() {
    return loadRuntime('/sidebar-taxonomy-v3.js?v=sidebar-taxonomy-v4', 'data-drx-sidebar-taxonomy');
  }

  function openSidebar() {
    $('#sidebar')?.classList.add('is-open');
    const backdrop = $('#sidebarBackdrop');
    if (backdrop) backdrop.hidden = false;
  }

  function closeSidebar() {
    $('#sidebar')?.classList.remove('is-open');
    const backdrop = $('#sidebarBackdrop');
    if (backdrop) backdrop.hidden = true;
  }

  async function logout() {
    const button = $('#logoutButton');
    if (button) button.disabled = true;
    try {
      const { response } = await authJson('/api/auth', { method:'DELETE' });
      if (!response.ok) throw new Error('Dalja nuk u krye.');
      location.replace('/landing.html');
    } catch {
      if (button) button.disabled = false;
    }
  }

  let bound = false;
  function init() {
    if (bound) return;
    bound = true;
    void loadSharedSidebarTaxonomy();
    $('#menuButton')?.addEventListener('click', openSidebar);
    $('#sidebarClose')?.addEventListener('click', closeSidebar);
    $('#sidebarBackdrop')?.addEventListener('click', closeSidebar);
    $('#logoutButton')?.addEventListener('click', logout);
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeSidebar();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        $('#protocolSearch')?.focus();
      }
    });
  }

  window.DRxProtocolShell = Object.freeze({ init, ensureAuth, syncProfile });
})();

(() => {
  'use strict';

  const THEME_KEY = 'regjistriBarnave_theme_v1';
  const PAGE_TITLE = 'DRx | Protokollet';
  const MINISTRY_HOST = 'msh.rks-gov.net';
  const MINISTRY_DOCUMENT_PATH = '/Documents/DownloadDocument';
  const BLOB_HOST = /^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/i;
  const HASH_PATTERN = /^[a-f0-9]{64}$/i;
  const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i;
  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  const state = {
    manifest:{ categories:[], documents:[] },
    elaborations:new Map(),
    ready:false,
  };

  const hasDocument = typeof document !== 'undefined';
  const $ = selector => hasDocument ? document.querySelector(selector) : null;
  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const boundedText = (value, maximum) => text(value).slice(0, maximum);
  const boundedBody = (value, maximum) => String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maximum);
  const fold = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sq');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[character]));

  function safeHttpsUrl(value, kind = 'official') {
    try {
      const url = new URL(text(value));
      if (url.protocol !== 'https:' || url.username || url.password) return '';
      if (kind === 'blob') {
        return BLOB_HOST.test(url.hostname) ? url.href : '';
      }
      if (url.hostname !== MINISTRY_HOST || url.pathname !== MINISTRY_DOCUMENT_PATH) return '';
      return text(url.searchParams.get('fileName')) ? url.href : '';
    } catch {
      return '';
    }
  }

  function safeDate(value) {
    const candidate = text(value);
    if (!DATE_PATTERN.test(candidate)) return '';
    const date = new Date(`${candidate}T00:00:00Z`);
    return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== candidate ? '' : candidate;
  }

  function normalizeManifest(raw) {
    const categories = Array.isArray(raw?.categories)
      ? raw.categories.map(category => ({
        id:boundedText(category?.id, 64),
        label:boundedText(category?.label, 120),
      })).filter(category => ID_PATTERN.test(category.id) && category.label)
      : [];
    const knownCategories = new Set(categories.map(category => category.id));
    const seenIds = new Set();
    const documents = Array.isArray(raw?.documents) ? raw.documents.flatMap((document, index) => {
      const id = boundedText(document?.id, 64);
      const title = boundedText(document?.title, 500);
      const type = fold(document?.type);
      const category = boundedText(document?.category, 64);
      if (!ID_PATTERN.test(id) || !title || seenIds.has(id) || !['pdf', 'docx', 'html', 'txt'].includes(type)) return [];
      seenIds.add(id);
      const contentSha256 = /^[a-f0-9]{64}$/i.test(text(document?.contentSha256))
        ? text(document.contentSha256).toLowerCase()
        : '';
      return [{
        id,
        title,
        type,
        category:knownCategories.has(category) ? category : '',
        order:Number.isFinite(Number(document?.order)) ? Number(document.order) : index + 1,
        archived:Boolean(document?.archived),
        officialUrl:safeHttpsUrl(document?.officialUrl),
        blobUrl:safeHttpsUrl(document?.blobUrl, 'blob'),
        contentSha256,
        bytes:Number.isFinite(Number(document?.bytes)) && Number(document.bytes) >= 0 ? Number(document.bytes) : 0,
        keywords:Array.isArray(document?.keywords) ? document.keywords.map(value => boundedText(value, 120)).filter(Boolean) : [],
        publishedAt:safeDate(document?.publishedAt),
        verifiedAt:safeDate(text(document?.verifiedAt).slice(0, 10)),
        registryStatus:boundedText(document?.registryStatus, 80),
      }];
    }) : [];
    documents.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'sq'));
    return { categories, documents };
  }

  function normalizeCitation(raw) {
    const page = Number(raw?.page);
    if (!Number.isInteger(page) || page < 1 || page > 10000) return null;
    return {
      page,
      label:boundedText(raw?.label, 100) || `Faqja ${page}`,
    };
  }

  function normalizeElaborations(raw) {
    if (Number(raw?.schemaVersion) !== 1 || !Array.isArray(raw?.entries)) return new Map();
    const seenIds = new Set();
    const entries = new Map();
    raw.entries.forEach(candidate => {
      const id = boundedText(candidate?.protocolId, 64);
      const sourceHash = text(candidate?.sourceHash).toLowerCase();
      const reviewedAt = safeDate(candidate?.reviewedAt);
      if (!ID_PATTERN.test(id) || !HASH_PATTERN.test(sourceHash) || !reviewedAt || seenIds.has(id)) return;
      seenIds.add(id);
      const sectionIds = new Set();
      const sections = Array.isArray(candidate?.sections) ? candidate.sections.flatMap(section => {
        const sectionId = boundedText(section?.id, 64);
        const title = boundedText(section?.title, 300);
        const body = boundedBody(section?.body, 12000);
        if (!ID_PATTERN.test(sectionId) || sectionIds.has(sectionId) || !title || !body) return [];
        sectionIds.add(sectionId);
        return [{
          id:sectionId,
          title,
          body,
          citations:Array.isArray(section?.citations) ? section.citations.map(normalizeCitation).filter(Boolean) : [],
        }];
      }) : [];
      if (!sections.length) return;
      entries.set(id, {
        protocolId:id,
        sourceHash,
        reviewedAt,
        summary:boundedText(candidate?.summary, 1000),
        sections,
      });
    });
    return entries;
  }

  function matchingElaboration(documentRecord, elaborations) {
    if (!documentRecord?.id || !HASH_PATTERN.test(text(documentRecord?.contentSha256))) return null;
    const candidate = elaborations instanceof Map ? elaborations.get(documentRecord.id) : null;
    return candidate && candidate.sourceHash === text(documentRecord.contentSha256).toLowerCase() ? candidate : null;
  }

  const testApi = { safeHttpsUrl, normalizeManifest, normalizeElaborations, matchingElaboration };
  if (typeof module !== 'undefined' && module.exports) module.exports = testApi;
  if (!hasDocument) return;

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    const button = $('#themeButton');
    if (button) {
      button.textContent = theme === 'dark' ? '☀' : '☾';
      button.setAttribute('aria-label', theme === 'dark' ? 'Aktivizo temën e çelët' : 'Aktivizo temën e errët');
    }
  }

  function initTheme() {
    let saved = '';
    try { saved = localStorage.getItem(THEME_KEY) || ''; } catch {}
    const preferred = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
    applyTheme(['dark', 'light'].includes(saved) ? saved : preferred);
    $('#themeButton')?.addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  }

  function categoryLabel(id) {
    return state.manifest.categories.find(category => category.id === id)?.label || 'Pa kategori';
  }

  function formatDate(value) {
    if (!safeDate(value)) return 'Nuk është shënuar';
    try {
      return new Intl.DateTimeFormat('sq-AL', { day:'numeric', month:'long', year:'numeric', timeZone:'UTC' })
        .format(new Date(`${value}T00:00:00Z`));
    } catch {
      return value;
    }
  }

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) return 'Nuk është shënuar';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('sq-AL', { maximumFractionDigits:1 })} KB`;
    return `${(bytes / (1024 * 1024)).toLocaleString('sq-AL', { maximumFractionDigits:1 })} MB`;
  }

  function rowMarkup(document) {
    const official = document.officialUrl
      ? `<a href="${esc(document.officialUrl)}" class="protocol-action-source" target="_blank" rel="noopener noreferrer external">Shiko burimin</a>`
      : '<span class="clinical-action-disabled" aria-disabled="true">Burimi zyrtar mungon</span>';
    const published = document.publishedAt
      ? `Publikuar më ${esc(formatDate(document.publishedAt))} në regjistrin zyrtar.`
      : 'Dokument i lidhur drejtpërdrejt me burimin zyrtar të Ministrisë.';
    return `<article class="clinical-row" data-protocol-id="${esc(document.id)}">
      <span class="protocol-row-number" aria-hidden="true">${String(document.order).padStart(2, '0')}</span>
      <div class="protocol-row-copy">
        <h2>${esc(document.title)}</h2>
        <div class="clinical-row-meta"><span class="clinical-chip">${esc(categoryLabel(document.category))}</span><span class="clinical-chip">${esc(document.type.toUpperCase())}</span>${document.archived ? '<span class="clinical-chip is-warning">Arkivore</span>' : ''}</div>
        <p>${published}</p>
      </div>
      <div class="clinical-actions">
        <a class="primary protocol-action-elaborate" href="?protocol=${encodeURIComponent(document.id)}" data-protocol-open="${esc(document.id)}">Hap protokollin</a>
        ${official}
      </div>
    </article>`;
  }

  function renderDirectory() {
    if (!state.ready) return;
    const query = fold($('#protocolSearch')?.value);
    const category = $('#protocolCategory')?.value || '';
    const type = $('#protocolType')?.value || '';
    const archive = $('#protocolArchive')?.value || 'current';
    const documents = state.manifest.documents.filter(documentRecord => {
      const statusMatch = archive === 'all' || (archive === 'archived' ? documentRecord.archived : !documentRecord.archived);
      const searchable = `${documentRecord.title} ${categoryLabel(documentRecord.category)} ${documentRecord.type} ${documentRecord.keywords.join(' ')}`;
      return statusMatch
        && (!category || documentRecord.category === category)
        && (!type || documentRecord.type === type)
        && (!query || fold(searchable).includes(query));
    });
    $('#protocolCount').textContent = documents.length;
    if ($('#protocolVisibleCount')) $('#protocolVisibleCount').textContent = documents.length;
    $('#protocolStatus').textContent = `${documents.length} nga ${state.manifest.documents.length} dokumente`;
    $('#protocolList').innerHTML = documents.length
      ? documents.map(rowMarkup).join('')
      : '<div class="clinical-empty">Nuk u gjet asnjë dokument për këta filtra.</div>';
  }

  function officialPageUrl(documentRecord, page) {
    if (!documentRecord.officialUrl) return '';
    try {
      const url = new URL(documentRecord.officialUrl);
      url.hash = `page=${page}`;
      return url.href;
    } catch {
      return documentRecord.officialUrl;
    }
  }

  function citationMarkup(documentRecord, citation) {
    const url = officialPageUrl(documentRecord, citation.page);
    if (!url) return `<span class="protocol-citation">${esc(citation.label)}</span>`;
    return `<a class="protocol-citation" href="${esc(url)}" target="_blank" rel="noopener noreferrer external">${esc(citation.label)}</a>`;
  }

  function elaborationMarkup(documentRecord, elaboration) {
    const sections = elaboration.sections.map((section, index) => `<li class="protocol-section" id="protocol-section-${esc(section.id)}">
      <span class="protocol-section-label">Seksioni ${index + 1}</span>
      <h3>${esc(section.title)}</h3>
      <p class="protocol-section-body">${esc(section.body)}</p>
      ${section.citations.length ? `<div class="protocol-citations" aria-label="Referencat e seksionit">${section.citations.map(citation => citationMarkup(documentRecord, citation)).join('')}</div>` : ''}
    </li>`).join('');
    return `<article class="protocol-reader-main" aria-labelledby="protocolElaborationHeading">
      <header class="protocol-reader-section-head">
        <h2 id="protocolElaborationHeading">Elaborimi i lidhur me burimin</h2>
        <p>Përmbajtja më poshtë është ruajtur me referenca te dokumenti dhe shfaqet vetëm kur gjurma e burimit përputhet.</p>
      </header>
      <ol class="protocol-sections">${sections}</ol>
    </article>`;
  }

  function sourceOnlyMarkup(documentRecord, reason) {
    const stale = reason === 'hash-mismatch';
    const message = stale
      ? 'Elaborimi i ruajtur i përket një versioni tjetër të dokumentit dhe është fshehur. MedIndex nuk e përdor derisa të rishikohet kundrejt kësaj kopjeje.'
      : 'Për këtë dokument nuk ka ende përmbajtje të strukturuar të kontrolluar kundrejt kopjes aktuale. MedIndex nuk gjeneron hapa klinikë pa burim.';
    const action = documentRecord.officialUrl
      ? `<a class="protocol-source-button" href="${esc(documentRecord.officialUrl)}" target="_blank" rel="noopener noreferrer external">Shiko burimin</a>`
      : '<span class="protocol-source-unavailable">Burimi zyrtar nuk është i disponueshëm.</span>';
    return `<article class="protocol-source-only" aria-labelledby="protocolSourceOnlyHeading">
      <div class="protocol-source-only-inner">
        <span class="protocol-source-only-mark" aria-hidden="true">MSH</span>
        <h2 id="protocolSourceOnlyHeading">Vetëm burimi zyrtar</h2>
        <p>${message}</p>
        ${action}
      </div>
    </article>`;
  }

  function sourcePanelMarkup(documentRecord, elaboration) {
    const sourceHash = documentRecord.contentSha256 || 'Nuk është shënuar';
    const contents = elaboration ? `<section class="protocol-source-panel" aria-labelledby="protocolContentsHeading">
      <h2 id="protocolContentsHeading">Përmbajtja</h2>
      <ol class="protocol-contents">${elaboration.sections.map((section, index) => `<li><a href="#protocol-section-${esc(section.id)}">${index + 1}. ${esc(section.title)}</a></li>`).join('')}</ol>
    </section>` : '';
    return `<aside class="protocol-reader-sidebar" aria-label="Të dhënat e burimit">
      <section class="protocol-source-panel" aria-labelledby="protocolSourceHeading">
        <h2 id="protocolSourceHeading">Burimi</h2>
        <p>Dokumenti hapet drejtpërdrejt në faqen zyrtare të Ministrisë së Shëndetësisë.</p>
        <dl class="protocol-source-facts">
          <div><dt>Institucioni</dt><dd>Ministria e Shëndetësisë</dd></div>
          <div><dt>Formati</dt><dd>${esc(documentRecord.type.toUpperCase())} · ${esc(formatBytes(documentRecord.bytes))}</dd></div>
          <div><dt>Publikimi</dt><dd>${esc(formatDate(documentRecord.publishedAt))}</dd></div>
          <div><dt>Statusi</dt><dd>${documentRecord.archived ? 'Dokument arkivor' : 'Jo i shënuar si arkivor'}</dd></div>
          <div><dt>SHA-256 i burimit</dt><dd class="protocol-source-hash">${esc(sourceHash)}</dd></div>
          ${elaboration ? `<div><dt>Rishikimi i elaborimit</dt><dd>${esc(formatDate(elaboration.reviewedAt))}</dd></div>` : ''}
        </dl>
        ${documentRecord.officialUrl ? `<a class="protocol-source-button" href="${esc(documentRecord.officialUrl)}" target="_blank" rel="noopener noreferrer external">Shiko burimin</a>` : ''}
      </section>
      ${contents}
    </aside>`;
  }

  function elaborationState(documentRecord) {
    const candidate = state.elaborations.get(documentRecord.id);
    const elaboration = matchingElaboration(documentRecord, state.elaborations);
    if (elaboration) return { elaboration, reason:'matched' };
    return { elaboration:null, reason:candidate ? 'hash-mismatch' : 'missing' };
  }

  function readerIntegrityMarkup(documentRecord, result) {
    const copy = result.elaboration
      ? `<strong>Elaborim i lidhur me versionin e burimit</strong>Gjurmët SHA-256 përputhen. Seksionet shfaqen nga materiali i rishikuar, jo nga tekst i gjeneruar gjatë hapjes.`
      : result.reason === 'hash-mismatch'
        ? `<strong>Elaborimi është ndalur</strong>Gjurmët SHA-256 nuk përputhen. Shfaqet vetëm burimi zyrtar derisa elaborimi të rishikohet.`
        : `<strong>Nuk ka elaborim të verifikuar</strong>Shfaqet vetëm burimi zyrtar; asnjë hap klinik nuk plotësohet ose shpiket nga MedIndex.`;
    return `<div class="protocol-reader-integrity"><span class="protocol-integrity-mark" aria-hidden="true"></span><div>${copy}</div></div>`;
  }

  function showReader(documentRecord, shouldFocus = false) {
    const reader = $('#protocolReader');
    const directory = $('#protocolDirectory');
    if (!reader || !directory) return;
    const result = elaborationState(documentRecord);
    const summary = result.elaboration?.summary
      || 'Lexuesi paraqet vetëm përmbajtje të lidhur me versionin e dokumentit zyrtar. Kur nuk ka elaborim të kontrolluar, mbetet vetëm burimi.';
    directory.hidden = true;
    reader.hidden = false;
    document.title = `${documentRecord.title} | MedIndex`;
    reader.innerHTML = `<div class="protocol-reader-frame">
      <button class="protocol-reader-back" type="button" data-protocol-back>← Kthehu te protokollet</button>
      <header class="protocol-reader-header">
        <div>
          <div class="protocol-reader-eyebrow"><span class="clinical-chip">${esc(categoryLabel(documentRecord.category))}</span><span class="clinical-chip">${esc(documentRecord.type.toUpperCase())}</span>${documentRecord.archived ? '<span class="clinical-chip is-warning">Arkivore</span>' : ''}</div>
          <h1 id="protocolReaderTitle" tabindex="-1">${esc(documentRecord.title)}</h1>
          <p>${esc(summary)}</p>
        </div>
        <div class="protocol-reader-actions">
          ${documentRecord.officialUrl ? `<a class="protocol-official-button" href="${esc(documentRecord.officialUrl)}" target="_blank" rel="noopener noreferrer external">Shiko burimin</a>` : '<span class="protocol-source-unavailable">Burimi zyrtar mungon</span>'}
        </div>
      </header>
      ${readerIntegrityMarkup(documentRecord, result)}
      <div class="protocol-reader-layout">
        ${result.elaboration ? elaborationMarkup(documentRecord, result.elaboration) : sourceOnlyMarkup(documentRecord, result.reason)}
        ${sourcePanelMarkup(documentRecord, result.elaboration)}
      </div>
    </div>`;
    const frame = reader.querySelector('.protocol-reader-frame');
    requestAnimationFrame(() => frame?.classList.add('is-visible'));
    if (shouldFocus) {
      requestAnimationFrame(() => {
        reader.querySelector('#protocolReaderTitle')?.focus?.({ preventScroll:true });
        reader.scrollIntoView({ block:'start' });
      });
    }
  }

  function showDirectory(shouldFocus = false) {
    const reader = $('#protocolReader');
    const directory = $('#protocolDirectory');
    if (!reader || !directory) return;
    reader.hidden = true;
    directory.hidden = false;
    document.title = PAGE_TITLE;
    if (shouldFocus) {
      requestAnimationFrame(() => {
        directory.querySelector('h1')?.setAttribute('tabindex', '-1');
        directory.querySelector('h1')?.focus({ preventScroll:true });
        directory.scrollIntoView({ block:'start' });
      });
    }
  }

  function showReaderError(message, retry = false) {
    const reader = $('#protocolReader');
    const directory = $('#protocolDirectory');
    if (!reader || !directory) return;
    directory.hidden = true;
    reader.hidden = false;
    document.title = PAGE_TITLE;
    reader.innerHTML = `<div class="protocol-reader-error">
      <button class="protocol-reader-back" type="button" data-protocol-back>← Kthehu te protokollet</button>
      <h1 id="protocolReaderTitle" tabindex="-1">Protokolli nuk mund të hapet</h1>
      <p>${esc(message)}</p>
      ${retry ? '<button class="protocol-retry-button" id="protocolRetry" type="button">Provo përsëri</button>' : ''}
    </div>`;
    if (retry) $('#protocolRetry')?.addEventListener('click', load, { once:true });
  }

  function routeProtocolId() {
    try {
      return boundedText(new URL(window.location.href).searchParams.get('protocol'), 128);
    } catch {
      return '';
    }
  }

  function syncRoute(shouldFocus = false) {
    const id = routeProtocolId();
    if (!id) {
      showDirectory(shouldFocus);
      return;
    }
    if (!state.ready) {
      $('#protocolDirectory').hidden = true;
      $('#protocolReader').hidden = false;
      $('#protocolReader').innerHTML = '<p class="protocol-reader-loading" role="status">Duke përgatitur lexuesin…</p>';
      return;
    }
    const documentRecord = state.manifest.documents.find(item => item.id === id);
    if (!documentRecord) {
      showReaderError('Identifikuesi në adresë nuk i përket asnjë dokumenti në regjistrin aktual.');
      return;
    }
    showReader(documentRecord, shouldFocus);
  }

  function protocolUrl(id) {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    if (id) url.searchParams.set('protocol', id);
    return `${url.pathname}${url.search}`;
  }

  function openProtocol(id) {
    if (!state.manifest.documents.some(documentRecord => documentRecord.id === id)) return;
    window.history.pushState({ medindexProtocol:id, protocolReaderOrigin:'directory' }, '', protocolUrl(id));
    syncRoute(true);
  }

  function closeReader() {
    if (window.history.state?.protocolReaderOrigin === 'directory') {
      window.history.back();
      return;
    }
    window.history.replaceState({ medindexProtocol:null, protocolReaderOrigin:'entry' }, '', protocolUrl(''));
    showDirectory(true);
  }

  async function loadElaborations() {
    try {
      const response = await fetch('/data/protocol-elaborations.json', {
        credentials:'same-origin',
        cache:'no-cache',
        headers:{ Accept:'application/json' },
      });
      if (!response.ok) return new Map();
      return normalizeElaborations(await response.json());
    } catch {
      return new Map();
    }
  }

  async function load() {
    const status = $('#protocolStatus');
    state.ready = false;
    syncRoute(false);
    try {
      const [response, elaborations] = await Promise.all([
        fetch('/data/protocols.json', {
          credentials:'same-origin',
          cache:'no-cache',
          headers:{ Accept:'application/json' },
        }),
        loadElaborations(),
      ]);
      if (!response.ok) throw new Error(`Manifesti ${response.status}`);
      const manifest = normalizeManifest(await response.json());
      if (!manifest.documents.length) throw new Error('Manifesti nuk përmban dokumente të vlefshme.');
      state.manifest = manifest;
      state.elaborations = elaborations;
      state.ready = true;
      const currentCount = state.manifest.documents.filter(item => !item.archived).length;
      if ($('#protocolTotalCount')) $('#protocolTotalCount').textContent = state.manifest.documents.length;
      if ($('#protocolCategoryCount')) $('#protocolCategoryCount').textContent = state.manifest.categories.length;
      if ($('#protocolCurrentCount')) $('#protocolCurrentCount').textContent = currentCount;
      if ($('#syncText')) $('#syncText').textContent = 'Burime zyrtare';
      if ($('#sourceStatus')) $('#sourceStatus').textContent = `Ministria e Shëndetësisë · ${state.manifest.documents.length} dokumente`;
      $('#protocolCategory').innerHTML = '<option value="">Të gjitha kategoritë</option>'
        + state.manifest.categories.map(category => `<option value="${esc(category.id)}">${esc(category.label)}</option>`).join('');
      renderDirectory();
      syncRoute(false);
      $('#appShell')?.setAttribute('aria-busy', 'false');
    } catch (error) {
      const message = text(error?.message) || 'Manifesti nuk u ngarkua.';
      if (routeProtocolId()) {
        showReaderError(message, true);
        return;
      }
      if (status) status.textContent = message;
      if ($('#syncText')) $('#syncText').textContent = 'Gabim';
      $('#appShell')?.setAttribute('aria-busy', 'false');
      $('#protocolList').innerHTML = '<div class="clinical-empty"><strong>Manifesti i protokolleve nuk u ngarkua.</strong><button id="protocolRetry" type="button">Provo përsëri</button></div>';
      $('#protocolRetry')?.addEventListener('click', load, { once:true });
    }
  }

  function handleDocumentClick(event) {
    const opener = event.target.closest?.('[data-protocol-open]');
    if (opener) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openProtocol(text(opener.dataset.protocolOpen));
      return;
    }
    if (event.target.closest?.('[data-protocol-back]')) {
      event.preventDefault();
      closeReader();
    }
  }

  async function init() {
    window.DRxProtocolShell?.init();
    const authPayload = await window.DRxProtocolShell?.ensureAuth();
    await window.DRxProtocolShell?.syncProfile(authPayload);
    document.documentElement.dataset.theme = 'light';
    ['protocolSearch', 'protocolCategory', 'protocolType', 'protocolArchive'].forEach(id => {
      document.getElementById(id)?.addEventListener(id === 'protocolSearch' ? 'input' : 'change', renderDirectory);
    });
    document.addEventListener('click', handleDocumentClick);
    window.addEventListener('popstate', () => syncRoute(true));
    const initialId = routeProtocolId();
    window.history.replaceState({ medindexProtocol:initialId || null, protocolReaderOrigin:'entry' }, '', window.location.href);
    syncRoute(false);
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();


(() => {
  'use strict';

  const TARGET_PROTOCOL = 'upk-01';
  const DATA_URL = '/data/protocol-elaborations.json';
  const MANIFEST_URL = '/data/protocols.json';
  const CHECK_STORAGE_KEY = 'medindex_protocol_upk01_visit_checks_v2';
  const RISK_STORAGE_KEY = 'medindex_protocol_upk01_risk_profile_v1';
  const RX_STORAGE_KEY = 'medindex_protocol_upk01_rx_draft_v1';
  const MODE_STORAGE_KEY = 'medindex_protocol_upk01_mode_v1';
  let payloadPromise = null;
  let renderToken = 0;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const routeId = () => {
    try { return new URL(window.location.href).searchParams.get('protocol') || ''; }
    catch { return ''; }
  };

  function safeSessionGet(key, fallback = {}) {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(key) || '');
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function safeSessionSet(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function safeSessionRemove(key) {
    try { sessionStorage.removeItem(key); } catch {}
  }

  function savedMode() {
    try {
      const value = sessionStorage.getItem(MODE_STORAGE_KEY);
      return value === 'full' ? 'full' : 'quick';
    } catch {
      return 'quick';
    }
  }

  async function loadPayload() {
    if (payloadPromise) return payloadPromise;
    payloadPromise = Promise.all([
      fetch(DATA_URL, { credentials:'same-origin', cache:'no-cache', headers:{ Accept:'application/json' } }),
      fetch(MANIFEST_URL, { credentials:'same-origin', cache:'no-cache', headers:{ Accept:'application/json' } }),
    ]).then(async ([dataResponse, manifestResponse]) => {
      if (!dataResponse.ok || !manifestResponse.ok) throw new Error('Të dhënat e protokollit nuk u ngarkuan.');
      const [data, manifest] = await Promise.all([dataResponse.json(), manifestResponse.json()]);
      const entry = Array.isArray(data?.entries) ? data.entries.find(item => item?.protocolId === TARGET_PROTOCOL) : null;
      const documentRecord = Array.isArray(manifest?.documents) ? manifest.documents.find(item => item?.id === TARGET_PROTOCOL) : null;
      if (!entry?.primaryCare || !documentRecord) throw new Error('Protokolli interaktiv nuk është konfiguruar.');
      const sourceHash = clean(entry.sourceHash).toLowerCase();
      const currentHash = clean(documentRecord.contentSha256).toLowerCase();
      if (!sourceHash || sourceHash !== currentHash) throw new Error('Versioni i burimit ka ndryshuar. Pamja interaktive është ndalur.');
      return { entry, documentRecord };
    }).catch(error => {
      payloadPromise = null;
      throw error;
    });
    return payloadPromise;
  }

  function toneClass(tone) {
    return ['danger', 'warning', 'info', 'primary'].includes(tone) ? ` is-${tone}` : '';
  }

  function officialPageUrl(documentRecord, page) {
    const source = clean(documentRecord?.officialUrl);
    const pageNumber = Number(page);
    if (!source || !Number.isInteger(pageNumber) || pageNumber < 1) return '';
    try {
      const url = new URL(source);
      url.hash = `page=${pageNumber}`;
      return url.href;
    } catch {
      return '';
    }
  }

  function sourceChipMarkup(documentRecord, page, label = '') {
    const url = officialPageUrl(documentRecord, page);
    if (!url) return '';
    return `<a class="pc-source-chip" href="${esc(url)}" target="_blank" rel="noopener noreferrer external" aria-label="Hap burimin zyrtar në faqen ${esc(page)}">${esc(label || `Burimi · f. ${page}`)}</a>`;
  }

  function sourcePagesMarkup(documentRecord, pages) {
    const values = [...new Set((Array.isArray(pages) ? pages : [pages]).map(Number).filter(Number.isInteger))];
    if (!values.length) return '';
    return `<div class="pc-source-row">${values.map(page => sourceChipMarkup(documentRecord, page)).join('')}</div>`;
  }

  function modeToggleMarkup(pc) {
    const labels = pc?.modeLabels || {};
    return `<div class="pc-mode-toggle" role="group" aria-label="Pamja e protokollit">
      <button type="button" data-pc-mode="quick" aria-pressed="false">${esc(labels.quick || 'Shpejt')}</button>
      <button type="button" data-pc-mode="full" aria-pressed="false">${esc(labels.full || 'E plotë')}</button>
    </div>`;
  }

  function todayActionsMarkup(items, documentRecord) {
    if (!items.length) return '';
    return `<section class="pc-panel pc-today" id="pc-today" aria-labelledby="pcTodayTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Sot në vizitë</span>
        <h2 id="pcTodayTitle">4 gjërat kryesore para se të vazhdosh</h2>
        <p>Lexoji nga e majta në të djathtë. Secila pikë lidhet me faqen përkatëse të burimit zyrtar.</p>
      </div>
      <div class="pc-today-grid">
        ${items.map(item => `<article class="pc-today-card${toneClass(item.tone)}">
          <div class="pc-today-number">${esc(item.number)}</div>
          <div>
            <h3>${esc(item.title)}</h3>
            <p>${esc(item.body)}</p>
            ${sourceChipMarkup(documentRecord, item.sourcePage)}
          </div>
        </article>`).join('')}
      </div>
    </section>`;
  }

  function quickChecksMarkup(items, documentRecord) {
    const stored = safeSessionGet(CHECK_STORAGE_KEY);
    return `<section class="pc-panel pc-quick" aria-labelledby="pcQuickTitle">
      <div class="pc-section-head pc-section-head-split">
        <div>
          <span class="pc-kicker">Kontroll i shpejtë</span>
          <h2 id="pcQuickTitle">Çka me kontrollu në 60 sekonda</h2>
          <p>Kliko vetëm ato që vlejnë për pacientin. MedIndex nuk vendos diagnozë; paneli vetëm ta organizon vizitën.</p>
        </div>
        <div class="pc-progress-wrap" aria-live="polite">
          <strong id="pcProgressText">0/${items.length}</strong>
          <span>të shënuara</span>
        </div>
      </div>
      <div class="pc-progress" aria-hidden="true"><span id="pcProgressBar"></span></div>
      <div class="pc-check-grid">
        ${items.map(item => `<label class="pc-check${toneClass(item.tone)}">
          <input type="checkbox" data-pc-check="${esc(item.id)}" ${stored[item.id] ? 'checked' : ''}>
          <span class="pc-check-box" aria-hidden="true"></span>
          <span class="pc-check-copy">${esc(item.label)}${sourceChipMarkup(documentRecord, item.sourcePage, `f. ${item.sourcePage}`)}</span>
        </label>`).join('')}
      </div>
      <div class="pc-context-alerts" data-pc-context-alerts aria-live="polite"></div>
      <button class="pc-text-button" type="button" data-pc-reset>Rivendos kontrollin</button>
    </section>`;
  }

  function riskProfileMarkup(profile, documentRecord) {
    const items = Array.isArray(profile?.items) ? profile.items : [];
    const stored = safeSessionGet(RISK_STORAGE_KEY);
    if (!items.length) return '';
    return `<section class="pc-panel pc-deep pc-risk" id="pc-risk" aria-labelledby="pcRiskTitle">
      <div class="pc-section-head pc-section-head-split">
        <div>
          <span class="pc-kicker">FRAX / faktorët e rrezikut</span>
          <h2 id="pcRiskTitle">${esc(profile.title)}</h2>
          <p>${esc(profile.helper)}</p>
        </div>
        <div class="pc-risk-count" aria-live="polite"><strong data-pc-risk-count>0</strong><span>faktorë të shënuar</span></div>
      </div>
      <div class="pc-risk-grid">
        ${items.map(item => `<label class="pc-risk-item">
          <input type="checkbox" data-pc-risk="${esc(item.id)}" ${stored[item.id] ? 'checked' : ''}>
          <span aria-hidden="true"></span>
          <b>${esc(item.label)}</b>
        </label>`).join('')}
      </div>
      <div class="pc-risk-summary" data-pc-risk-summary>Asnjë faktor nuk është shënuar në këtë panel.</div>
      ${sourcePagesMarkup(documentRecord, profile.sourcePage)}
    </section>`;
  }

  function workflowMarkup(items, documentRecord) {
    return `<section class="pc-panel pc-deep" id="pc-workflow" aria-labelledby="pcWorkflowTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Hap pas hapi</span>
        <h2 id="pcWorkflowTitle">Çka bën mjeku familjar?</h2>
        <p>Hap vetëm hapin që të duhet. “QKMF”, “referim” dhe “specialist” tregojnë ku kryhet pjesa kryesore e hapit.</p>
      </div>
      <div class="pc-steps">
        ${items.map((item, index) => `<details class="pc-step" ${index === 0 ? 'open' : ''}>
          <summary>
            <span class="pc-step-number">${esc(item.number)}</span>
            <span class="pc-step-title">${esc(item.title)}</span>
            <span class="pc-step-setting">${esc(item.setting)}</span>
            <span class="pc-step-chevron" aria-hidden="true">⌄</span>
          </summary>
          <div class="pc-step-body"><p>${esc(item.body)}</p>${sourceChipMarkup(documentRecord, item.sourcePage)}</div>
        </details>`).join('')}
      </div>
    </section>`;
  }

  function diagnosisMarkup(box, documentRecord) {
    return `<section class="pc-diagnosis" id="pc-dxa" aria-labelledby="pcDxaTitle">
      <div class="pc-diagnosis-mark">${esc(box?.label || 'DXA')}</div>
      <div>
        <span class="pc-kicker">Pika kryesore</span>
        <h2 id="pcDxaTitle">${esc(box?.title)}</h2>
        <p>${esc(box?.body)}</p>
        ${sourcePagesMarkup(documentRecord, box?.sourcePage)}
      </div>
    </section>`;
  }

  function labsMarkup(labs, documentRecord) {
    const list = (items, className = '') => `<ul class="pc-pill-list ${className}">${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>`;
    return `<section class="pc-panel pc-deep" id="pc-labs" aria-labelledby="pcLabsTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Hetimet</span>
        <h2 id="pcLabsTitle">Analizat — bazë vs. vetëm sipas indikacionit</h2>
        <p>Paneli bazë është i ndarë nga testet e zgjeruara që varen nga dyshimi klinik.</p>
        ${sourcePagesMarkup(documentRecord, labs?.sourcePage)}
      </div>
      <div class="pc-lab-grid">
        <div class="pc-lab-card">
          <div class="pc-lab-label">Bazë</div>
          ${list(Array.isArray(labs?.essential) ? labs.essential : [])}
        </div>
        <div class="pc-lab-card is-secondary">
          <div class="pc-lab-label">Vetëm kur indikohet</div>
          ${list(Array.isArray(labs?.whenIndicated) ? labs.whenIndicated : [], 'is-muted')}
        </div>
      </div>
    </section>`;
  }

  function treatmentMarkup(treatment, documentRecord) {
    const cards = Array.isArray(treatment?.cards) ? treatment.cards : [];
    if (!cards.length) return '';
    return `<section class="pc-panel pc-deep" id="pc-treatment" aria-labelledby="pcTreatmentTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Terapia — orientimi praktik</span>
        <h2 id="pcTreatmentTitle">Çka është në QKMF dhe çka kalon te specialisti?</h2>
        <p>Ky seksion paraqet rrugën e protokollit; nuk zgjedh preparatin ose dozën në vend të mjekut.</p>
        ${sourcePagesMarkup(documentRecord, treatment?.sourcePages)}
      </div>
      <div class="pc-treatment-grid">
        ${cards.map(card => `<article class="pc-treatment-card${toneClass(card.tone)}">
          <span>${esc(card.label)}</span>
          <h3>${esc(card.title)}</h3>
          <p>${esc(card.body)}</p>
        </article>`).join('')}
      </div>
    </section>`;
  }

  function rxEditorMarkup(rx) {
    const fields = Array.isArray(rx?.editableFields) ? rx.editableFields : [];
    const saved = safeSessionGet(RX_STORAGE_KEY);
    return `<div class="pc-rx-editor" aria-labelledby="pcRxDraftTitle">
      <div class="pc-rx-editor-head">
        <div><span>Rp.</span><strong id="pcRxDraftTitle">Receta e punës</strong></div>
        <span>Plotësohet nga mjeku</span>
      </div>
      <div class="pc-rx-fields">
        ${fields.map(field => {
          const value = clean(saved[field.id] || '');
          const isInstructions = field.id === 'instructions';
          return `<label class="${isInstructions ? 'is-wide' : ''}">
            <span>${esc(field.label)}</span>
            ${isInstructions
              ? `<textarea rows="2" data-pc-rx-field="${esc(field.id)}" placeholder="${esc(field.placeholder)}">${esc(value)}</textarea>`
              : `<input type="text" data-pc-rx-field="${esc(field.id)}" value="${esc(value)}" placeholder="${esc(field.placeholder)}" autocomplete="off">`}
          </label>`;
        }).join('')}
      </div>
      <div class="pc-rx-editor-actions">
        <button class="pc-copy-button is-primary" type="button" data-pc-copy-rx>Kopjo recetën e punës</button>
        <button class="pc-text-button" type="button" data-pc-clear-rx>Pastro fushat</button>
      </div>
      <p class="pc-copy-status" data-pc-copy-status aria-live="polite"></p>
    </div>`;
  }

  function rxMarkup(rx, documentRecord) {
    const lines = Array.isArray(rx?.lines) ? rx.lines : [];
    const specialist = Array.isArray(rx?.specialist) ? rx.specialist : [];
    const checks = Array.isArray(rx?.checksBeforeRx) ? rx.checksBeforeRx : [];
    return `<section class="pc-panel pc-rx-section" id="pc-rx" aria-labelledby="pcRxTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Terapia / receta</span>
        <h2 id="pcRxTitle">Receta në një katror — por vendimi mbetet klinik</h2>
        <p>${esc(rx?.subtitle)}</p>
        ${sourcePagesMarkup(documentRecord, rx?.sourcePages)}
      </div>
      <div class="pc-rx-layout">
        <div class="pc-rx-card" aria-label="Korniza e terapisë nga protokolli">
          <div class="pc-rx-topline">
            <div><span>Rx</span><strong>${esc(rx?.title || 'Terapia')}</strong></div>
            <span class="pc-rx-badge">Nga protokolli</span>
          </div>
          <div class="pc-rx-lines">
            ${lines.map((line, index) => `<div class="pc-rx-line">
              <span class="pc-rx-index">${index + 1}</span>
              <div><strong>${esc(line.medicine)}</strong><p>${esc(line.details)}</p><button type="button" class="pc-rx-seed" data-pc-rx-seed="${esc(line.medicine)}">Përdor si bazë</button></div>
            </div>`).join('')}
          </div>
          ${specialist.length ? `<div class="pc-rx-specialist"><strong>Specialisti / terapia parenterale</strong>${specialist.map(item => `<p>${esc(item)}</p>`).join('')}</div>` : ''}
          ${checks.length ? `<div class="pc-rx-checks"><strong>Para përshkrimit, kontrollo</strong><div>${checks.map(item => `<span>✓ ${esc(item)}</span>`).join('')}</div></div>` : ''}
          <div class="pc-rx-footer">Kjo anë përmbledh rrugën e protokollit. Ana tjetër është drafti që plotësohet nga mjeku.</div>
        </div>
        ${rxEditorMarkup(rx)}
      </div>
    </section>`;
  }

  function monitoringMarkup(monitoring, documentRecord) {
    const items = Array.isArray(monitoring?.items) ? monitoring.items : [];
    if (!items.length) return '';
    return `<section class="pc-panel pc-deep" id="pc-monitoring" aria-labelledby="pcMonitoringTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Follow-up</span>
        <h2 id="pcMonitoringTitle">${esc(monitoring.title)}</h2>
        <p>Një checklistë e shkurtër për kontrollin pasues.</p>
        ${sourcePagesMarkup(documentRecord, monitoring.sourcePage)}
      </div>
      <div class="pc-follow-grid">${items.map(item => `<div><span aria-hidden="true">✓</span><p>${esc(item)}</p></div>`).join('')}</div>
    </section>`;
  }

  function safetyMarkup(safety, documentRecord) {
    const items = Array.isArray(safety?.items) ? safety.items : [];
    if (!items.length) return '';
    return `<section class="pc-panel pc-deep pc-safety" id="pc-safety" aria-labelledby="pcSafetyTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Siguria</span>
        <h2 id="pcSafetyTitle">${esc(safety.title)}</h2>
        <p>Këto janë pika të veçuara në seksionin e menaxhimit të efekteve anësore të protokollit.</p>
        ${sourcePagesMarkup(documentRecord, safety.sourcePage)}
      </div>
      <div class="pc-safety-grid">
        ${items.map(item => `<article><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></article>`).join('')}
      </div>
    </section>`;
  }

  function educationMarkup(education, documentRecord) {
    const items = Array.isArray(education?.items) ? education.items : [];
    if (!items.length) return '';
    return `<section class="pc-panel pc-deep pc-education" id="pc-education" aria-labelledby="pcEducationTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Në fund të vizitës</span>
        <h2 id="pcEducationTitle">${esc(education.title)}</h2>
        ${sourcePagesMarkup(documentRecord, education.sourcePages)}
      </div>
      <ol>${items.map((item, index) => `<li><span>${index + 1}</span><p>${esc(item)}</p></li>`).join('')}</ol>
    </section>`;
  }

  function referralMarkup(referral, documentRecord) {
    const planned = Array.isArray(referral?.planned) ? referral.planned : [];
    const urgent = Array.isArray(referral?.urgent) ? referral.urgent : [];
    return `<section class="pc-panel pc-referral" id="pc-referral" aria-labelledby="pcReferralTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Referimi</span>
        <h2 id="pcReferralTitle">${esc(referral?.title || 'Kur referohet?')}</h2>
        <p><strong>Destinacioni:</strong> ${esc(referral?.destination)}</p>
        ${sourcePagesMarkup(documentRecord, referral?.sourcePage)}
      </div>
      <div class="pc-referral-grid">
        <div class="pc-referral-box is-planned"><strong>${esc(referral?.plannedLabel || 'Referim i planifikuar')}</strong><ul>${planned.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>
        <div class="pc-referral-box is-urgent"><strong>${esc(referral?.urgentLabel || 'Vlerësim specialistik')}</strong><ul>${urgent.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>
      </div>
    </section>`;
  }

  function mainMarkup(entry, documentRecord) {
    const pc = entry.primaryCare || {};
    const checks = Array.isArray(pc.quickChecks) ? pc.quickChecks : [];
    const workflow = Array.isArray(pc.workflow) ? pc.workflow : [];
    const todayActions = Array.isArray(pc.todayActions) ? pc.todayActions : [];
    return `<article class="protocol-reader-main protocol-primary-care" data-pc-mode="${esc(savedMode())}" aria-labelledby="pcProtocolHeading">
      <header class="pc-hero">
        <div>
          <div class="pc-hero-meta"><span>${esc(pc.eyebrow || 'Për mjekun familjar')}</span><span class="pc-review-badge">${esc(pc.statusLabel || 'Në rishikim')}</span></div>
          <h2 id="pcProtocolHeading">${esc(pc.title)}</h2>
          <p>${esc(pc.subtitle)}</p>
        </div>
        <div class="pc-hero-tools">
          ${modeToggleMarkup(pc)}
          <div class="pc-hero-source"><span>Burimi</span><strong>MSH · ${esc(documentRecord.publishedAt || '')}</strong></div>
        </div>
      </header>

      <nav class="pc-jump-nav" aria-label="Shko te seksioni">
        <a href="#pc-today">Sot</a>
        <a href="#pc-dxa">DXA</a>
        <a href="#pc-rx">Receta</a>
        <a href="#pc-referral">Referimi</a>
        <a class="pc-nav-deep pc-deep" href="#pc-labs">Analizat</a>
        <a class="pc-nav-deep pc-deep" href="#pc-monitoring">Follow-up</a>
      </nav>

      ${todayActionsMarkup(todayActions, documentRecord)}
      ${quickChecksMarkup(checks, documentRecord)}
      ${riskProfileMarkup(pc.riskProfile || {}, documentRecord)}
      ${workflowMarkup(workflow, documentRecord)}
      ${diagnosisMarkup(pc.diagnosisBox || {}, documentRecord)}
      ${labsMarkup(pc.labs || {}, documentRecord)}
      ${treatmentMarkup(pc.treatmentOptions || {}, documentRecord)}
      ${rxMarkup(pc.rxBox || {}, documentRecord)}
      ${monitoringMarkup(pc.monitoring || {}, documentRecord)}
      ${safetyMarkup(pc.safety || {}, documentRecord)}
      ${educationMarkup(pc.patientEducation || {}, documentRecord)}
      ${referralMarkup(pc.referral || {}, documentRecord)}

      <aside class="pc-safety-note">
        <strong>Gjurmueshmëri klinike</strong>
        <p>Kjo pamje shfaqet vetëm kur SHA-256 përputhet me kopjen aktuale të dokumentit zyrtar. Statusi mbetet “në rishikim klinik”; burimi zyrtar ka përparësi nëse ka paqartësi.</p>
      </aside>
    </article>`;
  }

  function updateProgress(root, entry) {
    const boxes = [...root.querySelectorAll('[data-pc-check]')];
    const checked = boxes.filter(box => box.checked);
    const textNode = root.querySelector('#pcProgressText');
    const bar = root.querySelector('#pcProgressBar');
    if (textNode) textNode.textContent = `${checked.length}/${boxes.length}`;
    if (bar) bar.style.width = boxes.length ? `${Math.round((checked.length / boxes.length) * 100)}%` : '0%';

    const alerts = root.querySelector('[data-pc-context-alerts]');
    if (!alerts) return;
    const items = Array.isArray(entry?.primaryCare?.quickChecks) ? entry.primaryCare.quickChecks : [];
    const active = checked.map(box => items.find(item => item.id === box.dataset.pcCheck)).filter(Boolean);
    alerts.innerHTML = active.map(item => `<div class="pc-context-alert${toneClass(item.tone)}"><strong>${esc(item.label)}</strong><span>${esc(item.response || '')}</span></div>`).join('');
  }

  function updateRiskSummary(root) {
    const boxes = [...root.querySelectorAll('[data-pc-risk]')];
    const checked = boxes.filter(box => box.checked);
    const count = root.querySelector('[data-pc-risk-count]');
    const summary = root.querySelector('[data-pc-risk-summary]');
    if (count) count.textContent = String(checked.length);
    if (summary) {
      summary.textContent = checked.length
        ? `${checked.length} faktorë janë shënuar. Vazhdo me vlerësimin klinik dhe FRAX; ky numër nuk është kategori rreziku.`
        : 'Asnjë faktor nuk është shënuar në këtë panel.';
    }
  }

  function updateMode(root, mode) {
    const next = mode === 'full' ? 'full' : 'quick';
    root.dataset.pcMode = next;
    try { sessionStorage.setItem(MODE_STORAGE_KEY, next); } catch {}
    root.querySelectorAll('[data-pc-mode]').forEach(button => {
      button.setAttribute('aria-pressed', button.dataset.pcMode === next ? 'true' : 'false');
    });
  }

  function rxValues(root) {
    return Object.fromEntries([...root.querySelectorAll('[data-pc-rx-field]')].map(field => [field.dataset.pcRxField, clean(field.value)]));
  }

  function rxClipboardText(root) {
    const values = rxValues(root);
    if (!values.medicine) return '';
    const labels = {
      medicine:'Rp.', strength:'Fortësia', dose:'Doza', frequency:'Shpeshtësia',
      duration:'Kohëzgjatja', quantity:'Sasia', instructions:'Udhëzimi',
    };
    return Object.entries(labels)
      .map(([key, label]) => values[key] ? `${label}: ${values[key]}` : '')
      .filter(Boolean)
      .concat(['— Draft i plotësuar nga mjeku; verifiko para përdorimit.'])
      .join('\n');
  }

  function bindInteractiveEvents(root, entry) {
    root.querySelectorAll('[data-pc-check]').forEach(box => {
      box.addEventListener('change', () => {
        const state = safeSessionGet(CHECK_STORAGE_KEY);
        state[box.dataset.pcCheck] = box.checked;
        safeSessionSet(CHECK_STORAGE_KEY, state);
        updateProgress(root, entry);
      });
    });

    root.querySelector('[data-pc-reset]')?.addEventListener('click', () => {
      root.querySelectorAll('[data-pc-check]').forEach(box => { box.checked = false; });
      safeSessionRemove(CHECK_STORAGE_KEY);
      updateProgress(root, entry);
    });

    root.querySelectorAll('[data-pc-risk]').forEach(box => {
      box.addEventListener('change', () => {
        const state = safeSessionGet(RISK_STORAGE_KEY);
        state[box.dataset.pcRisk] = box.checked;
        safeSessionSet(RISK_STORAGE_KEY, state);
        updateRiskSummary(root);
      });
    });

    root.querySelectorAll('[data-pc-mode]').forEach(button => {
      button.addEventListener('click', () => updateMode(root, button.dataset.pcMode));
    });

    root.querySelectorAll('[data-pc-rx-field]').forEach(field => {
      field.addEventListener('input', () => safeSessionSet(RX_STORAGE_KEY, rxValues(root)));
    });

    root.querySelectorAll('[data-pc-rx-seed]').forEach(button => {
      button.addEventListener('click', () => {
        const field = root.querySelector('[data-pc-rx-field="medicine"]');
        if (!field) return;
        field.value = clean(button.dataset.pcRxSeed);
        safeSessionSet(RX_STORAGE_KEY, rxValues(root));
        field.focus({ preventScroll:true });
        root.querySelector('.pc-rx-editor')?.scrollIntoView({ behavior:'smooth', block:'center' });
      });
    });

    root.querySelector('[data-pc-copy-rx]')?.addEventListener('click', async event => {
      const status = root.querySelector('[data-pc-copy-status]');
      const value = rxClipboardText(root);
      if (!value) {
        if (status) status.textContent = 'Plotëso së paku barin / preparatin para kopjimit.';
        root.querySelector('[data-pc-rx-field="medicine"]')?.focus();
        return;
      }
      try {
        await navigator.clipboard.writeText(value);
        event.currentTarget.textContent = 'U kopjua';
        if (status) status.textContent = 'Drafti u kopjua. Verifiko të gjitha fushat para përdorimit.';
      } catch {
        if (status) status.textContent = 'Kopjimi automatik nuk u lejua nga shfletuesi.';
      }
      window.setTimeout(() => { if (event.currentTarget) event.currentTarget.textContent = 'Kopjo recetën e punës'; }, 1800);
    });

    root.querySelector('[data-pc-clear-rx]')?.addEventListener('click', () => {
      root.querySelectorAll('[data-pc-rx-field]').forEach(field => { field.value = ''; });
      safeSessionRemove(RX_STORAGE_KEY);
      const status = root.querySelector('[data-pc-copy-status]');
      if (status) status.textContent = 'Fushat e recetës së punës u pastruan.';
    });

    updateMode(root, savedMode());
    updateProgress(root, entry);
    updateRiskSummary(root);
  }

  async function tryRender() {
    const token = ++renderToken;
    if (routeId() !== TARGET_PROTOCOL) return;
    const reader = document.querySelector('#protocolReader:not([hidden])');
    const currentMain = reader?.querySelector('.protocol-reader-main');
    if (!reader || !currentMain || currentMain.classList.contains('protocol-primary-care')) return;
    try {
      const { entry, documentRecord } = await loadPayload();
      if (token !== renderToken || routeId() !== TARGET_PROTOCOL) return;
      const latestReader = document.querySelector('#protocolReader:not([hidden])');
      const latestMain = latestReader?.querySelector('.protocol-reader-main');
      if (!latestReader || !latestMain || latestMain.classList.contains('protocol-primary-care')) return;
      latestMain.outerHTML = mainMarkup(entry, documentRecord);
      const enhanced = latestReader.querySelector('.protocol-primary-care');
      const integrity = latestReader.querySelector('.protocol-reader-integrity');
      if (integrity) {
        integrity.classList.add('is-review');
        integrity.innerHTML = '<span class="protocol-integrity-mark" aria-hidden="true"></span><div><strong>Pamje praktike e lidhur me burimin</strong>SHA-256 përputhet me dokumentin aktual. Përmbajtja është e strukturuar për kujdesin parësor dhe statusi klinik mbetet në rishikim.</div>';
      }
      if (enhanced) bindInteractiveEvents(enhanced, entry);
    } catch (error) {
      const integrity = reader?.querySelector('.protocol-reader-integrity');
      if (integrity) {
        integrity.classList.add('is-warning');
        const target = integrity.querySelector('div');
        if (target) target.textContent = clean(error?.message) || 'Pamja interaktive nuk u ngarkua.';
      }
    }
  }

  function scheduleRender() {
    window.requestAnimationFrame(() => window.setTimeout(tryRender, 0));
  }

  function init() {
    const observer = new MutationObserver(scheduleRender);
    observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden'] });
    window.addEventListener('popstate', scheduleRender);
    document.addEventListener('click', event => {
      if (event.target.closest?.('[data-protocol-open], [data-protocol-back]')) scheduleRender();
    });
    scheduleRender();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();

(() => {
'use strict';
const ID='upk-02',DATA='/data/protocol-elaborations-upk02.json',MANIFEST='/data/protocols.json';
const K={checks:'mi_upk02_checks',risk:'mi_upk02_risk',rx:'mi_upk02_rx',mode:'mi_upk02_mode',transfer:'medindexPrescriptionProtocolDraft'};
let pending=null,token=0;
const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
const clean=(v,n=1200)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,n);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const route=()=>{try{return new URL(location.href).searchParams.get('protocol')||''}catch{return''}};
const read=(key)=>{try{const v=JSON.parse(sessionStorage.getItem(key)||'{}');return v&&typeof v==='object'?v:{}}catch{return{}}};
const save=(key,v)=>{try{sessionStorage.setItem(key,JSON.stringify(v))}catch{}};
const source=(doc,page,label='')=>{const n=Number(page);if(!doc?.officialUrl||!Number.isInteger(n))return'';try{const u=new URL(doc.officialUrl);u.hash=`page=${n}`;return `<a class="pc-source-chip" href="${esc(u.href)}" target="_blank" rel="noopener noreferrer external">${esc(label||`Burimi · f. ${n}`)}</a>`}catch{return''}};
const sources=(doc,pages)=>{const a=[...new Set((Array.isArray(pages)?pages:[pages]).map(Number).filter(Number.isInteger))];return a.length?`<div class="pc-source-row">${a.map(p=>source(doc,p)).join('')}</div>`:''};
const tone=t=>['danger','warning','info','primary'].includes(t)?` is-${t}`:'';
async function payload(){if(pending)return pending;pending=Promise.all([fetch(DATA,{cache:'no-cache',credentials:'same-origin'}),fetch(MANIFEST,{cache:'no-cache',credentials:'same-origin'})]).then(async([a,b])=>{if(!a.ok||!b.ok)throw Error('Të dhënat e protokollit nr. 2 nuk u ngarkuan.');const[d,m]=await Promise.all([a.json(),b.json()]);const e=d.entries?.find(x=>x.protocolId===ID),doc=m.documents?.find(x=>x.id===ID);if(!e?.primaryCare||!doc)throw Error('Pamja interaktive nuk është konfiguruar.');const h=clean(e.sourceHash,64).toLowerCase();if(!/^[a-f0-9]{64}$/.test(h)||h!==clean(doc.contentSha256,64).toLowerCase())throw Error('Versioni i burimit ka ndryshuar. Pamja interaktive është ndalur.');return{e,doc,h}}).catch(e=>{pending=null;throw e});return pending}
function today(pc,doc){return `<section class="pc-panel pc-today" id="pc2-today"><div class="pc-section-head"><span class="pc-kicker">Sot në vizitë</span><h2>4 gjërat që s'duhet t'i humbësh</h2><p>Vetëm pikat që e ndryshojnë vendimin ose rrugën e pacientit.</p></div><div class="pc-today-grid">${pc.todayActions.map(x=>`<article class="pc-today-card${tone(x.tone)}"><div class="pc-today-number">${esc(x.number)}</div><div><h3>${esc(x.title)}</h3><p>${esc(x.body)}</p>${source(doc,x.sourcePage)}</div></article>`).join('')}</div></section>`}
function checks(pc,doc){const s=read(K.checks);return `<section class="pc-panel pc-quick"><div class="pc-section-head pc-section-head-split"><div><span class="pc-kicker">Kontroll interaktiv</span><h2>Kontrollo në 60 sekonda</h2><p>Shëno vetëm çka vlen për pacientin; MedIndex nuk vendos diagnozë.</p></div><div class="pc-progress-wrap"><strong data-p2-count>0/${pc.quickChecks.length}</strong><span>të shënuara</span></div></div><div class="pc-progress"><span data-p2-bar></span></div><div class="pc-check-grid">${pc.quickChecks.map(x=>`<div class="pc-check-row"><label class="pc-check${tone(x.tone)}"><input type="checkbox" data-p2-check="${esc(x.id)}" ${s[x.id]?'checked':''}><span class="pc-check-box"></span><span class="pc-check-copy">${esc(x.label)}</span></label>${source(doc,x.sourcePage,`f. ${x.sourcePage}`)}</div>`).join('')}</div><div class="pc-context-alerts" data-p2-alerts></div><button class="pc-text-button" type="button" data-p2-reset>Rivendos kontrollin</button></section>`}
function risk(pc,doc){const p=pc.riskProfile,s=read(K.risk);return `<section class="pc-panel pc-deep pc-risk" id="pc2-risk"><div class="pc-section-head pc-section-head-split"><div><span class="pc-kicker">FRAX / faktorët</span><h2>${esc(p.title)}</h2><p>${esc(p.helper)}</p></div><div class="pc-risk-count"><strong data-p2-risk-count>0</strong><span>faktorë</span></div></div><div class="pc-risk-grid">${p.items.map(x=>`<label class="pc-risk-item"><input type="checkbox" data-p2-risk="${esc(x.id)}" ${s[x.id]?'checked':''}><span></span><b>${esc(x.label)}</b></label>`).join('')}</div><div class="pc-risk-summary" data-p2-risk-summary>Asnjë faktor nuk është shënuar.</div>${sources(doc,p.sourcePage)}</section>`}
function diagnosis(pc,doc){const b=pc.diagnosisBox;return `<section class="pc-diagnosis" id="pc2-dxa"><div class="pc-diagnosis-mark">${esc(b.label)}</div><div><span class="pc-kicker">Pika kryesore</span><h2>${esc(b.title)}</h2><p>${esc(b.body)}</p>${sources(doc,b.sourcePage)}</div></section>`}
function treatment(pc,doc){const t=pc.treatmentOptions;return `<section class="pc-panel pc-deep" id="pc2-treatment"><div class="pc-section-head"><span class="pc-kicker">Trajtimi</span><h2>Çfarë duhet kontrolluar para se të përshkruash?</h2><p>Zgjedhja mbetet klinike; kartat vetëm përmbledhin rrugën e Udhërrëfyesit.</p>${sources(doc,t.sourcePages)}</div><div class="pc-treatment-grid">${t.cards.map(x=>`<article class="pc-treatment-card${tone(x.tone)}"><span>${esc(x.label)}</span><h3>${esc(x.title)}</h3><p>${esc(x.body)}</p></article>`).join('')}</div></section>`}
function more(pc,doc){const labs=pc.labs,m=pc.monitoring,s=pc.safety;const pills=a=>`<ul class="pc-pill-list">${a.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;return `<section class="pc-panel pc-deep" id="pc2-labs"><div class="pc-section-head"><span class="pc-kicker">Analizat</span><h2>Bazë vs. sipas indikacionit</h2>${sources(doc,labs.sourcePage)}</div><div class="pc-lab-grid"><div class="pc-lab-card"><div class="pc-lab-label">Bazë</div>${pills(labs.essential)}</div><div class="pc-lab-card is-secondary"><div class="pc-lab-label">Sipas indikacionit</div>${pills(labs.whenIndicated)}</div></div></section><section class="pc-panel pc-deep" id="pc2-monitoring"><div class="pc-section-head"><span class="pc-kicker">Follow-up</span><h2>${esc(m.title)}</h2>${sources(doc,m.sourcePage)}</div><div class="pc-follow-grid">${m.items.map(x=>`<div><span>✓</span><p>${esc(x)}</p></div>`).join('')}</div></section><section class="pc-panel pc-deep pc-safety"><div class="pc-section-head"><span class="pc-kicker">Siguria</span><h2>${esc(s.title)}</h2>${sources(doc,s.sourcePage)}</div><div class="pc-safety-grid">${s.items.map(x=>`<article><h3>${esc(x.title)}</h3><p>${esc(x.body)}</p></article>`).join('')}</div></section>`}
function rx(pc,doc){const r=pc.rxBox,s=read(K.rx);return `<section class="pc-panel pc-rx-section" id="pc2-rx"><div class="pc-section-head"><span class="pc-kicker">Terapia / receta</span><h2>Draft i kontrolluar nga mjeku</h2><p>${esc(r.subtitle)}</p>${sources(doc,r.sourcePages)}</div><div class="pc-rx-layout"><div class="pc-rx-card"><div class="pc-rx-topline"><div><span>Rx</span><strong>${esc(r.title)}</strong></div><span class="pc-rx-badge">Nga Udhërrëfyesi</span></div><div class="pc-rx-lines">${r.lines.map((x,i)=>`<div class="pc-rx-line"><span class="pc-rx-index">${i+1}</span><div><strong>${esc(x.medicine)}</strong><p>${esc(x.details)}</p><button class="pc-rx-seed" type="button" data-p2-seed="${esc(x.medicine)}">Përdor si bazë</button></div></div>`).join('')}</div><div class="pc-rx-specialist"><strong>Specialist / parenterale</strong>${r.specialist.map(x=>`<p>${esc(x)}</p>`).join('')}</div><div class="pc-rx-checks"><strong>Para përshkrimit</strong><div>${r.checksBeforeRx.map(x=>`<span>✓ ${esc(x)}</span>`).join('')}</div></div></div><div class="pc-rx-editor"><div class="pc-rx-editor-head"><div><span>Rp.</span><strong>Receta e punës</strong></div><span>Plotësohet nga mjeku</span></div><div class="pc-rx-fields">${r.editableFields.map(f=>`<label class="${f.id==='instructions'?'is-wide':''}"><span>${esc(f.label)}</span>${f.id==='instructions'?`<textarea rows="2" data-p2-field="${f.id}" placeholder="${esc(f.placeholder)}">${esc(s[f.id]||'')}</textarea>`:`<input data-p2-field="${f.id}" value="${esc(s[f.id]||'')}" placeholder="${esc(f.placeholder)}" autocomplete="off">`}</label>`).join('')}</div><div class="pc-rx-editor-actions"><button class="pc-copy-button is-primary" type="button" data-p2-copy>Kopjo draftin</button><button class="pc-copy-button pc-rx-handoff" type="button" data-p2-handoff>Vazhdo te Recetat</button><button class="pc-text-button" type="button" data-p2-clear>Pastro</button></div><p class="pc-copy-status" data-p2-status></p></div></div></section>`}
function referral(pc,doc){const r=pc.referral;return `<section class="pc-panel pc-referral" id="pc2-referral"><div class="pc-section-head"><span class="pc-kicker">Referimi</span><h2>${esc(r.title)}</h2><p><strong>Destinacioni:</strong> ${esc(r.destination)}</p>${sources(doc,r.sourcePage)}</div><div class="pc-referral-grid"><div class="pc-referral-box is-planned"><strong>${esc(r.plannedLabel)}</strong><ul>${r.planned.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div><div class="pc-referral-box is-urgent"><strong>${esc(r.urgentLabel)}</strong><ul>${r.urgent.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></div></section>`}
function markup(e,doc){const pc=e.primaryCare;let mode='quick';try{mode=sessionStorage.getItem(K.mode)==='full'?'full':'quick'}catch{}return `<article class="protocol-reader-main protocol-primary-care" data-p2-root data-pc-mode="${mode}"><header class="pc-hero"><div><div class="pc-hero-meta"><span>${esc(pc.eyebrow)}</span><span class="pc-review-badge">${esc(pc.statusLabel)}</span></div><h2>${esc(pc.title)}</h2><p>${esc(pc.subtitle)}</p></div><div class="pc-hero-tools"><div class="pc-mode-toggle"><button type="button" data-p2-mode="quick">Shpejt</button><button type="button" data-p2-mode="full">Më shumë</button></div><div class="pc-hero-source"><span>Burimi</span><strong>MSH · ${esc(doc.publishedAt||'')}</strong></div></div></header><nav class="pc-jump-nav"><a href="#pc2-today">Sot</a><a href="#pc2-dxa">FRAX/DXA</a><a href="#pc2-rx">Receta</a><a href="#pc2-referral">Referimi</a><a class="pc-deep" href="#pc2-labs">Analizat</a></nav>${today(pc,doc)}${checks(pc,doc)}${risk(pc,doc)}${diagnosis(pc,doc)}${treatment(pc,doc)}${rx(pc,doc)}${more(pc,doc)}${referral(pc,doc)}<aside class="pc-safety-note"><strong>Gjurmueshmëri klinike</strong><p>Kjo pamje hapet vetëm kur SHA-256 përputhet me kopjen aktuale të Udhërrëfyesit; burimi zyrtar ka përparësi.</p></aside></article>`}
function mode(root,v){v=v==='full'?'full':'quick';root.dataset.pcMode=v;try{sessionStorage.setItem(K.mode,v)}catch{}qa('[data-p2-mode]',root).forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.p2Mode===v)))}
function update(root,pc){const b=qa('[data-p2-check]',root),on=b.filter(x=>x.checked);q('[data-p2-count]',root).textContent=`${on.length}/${b.length}`;q('[data-p2-bar]',root).style.width=b.length?`${Math.round(100*on.length/b.length)}%`:'0%';q('[data-p2-alerts]',root).innerHTML=on.map(x=>pc.quickChecks.find(i=>i.id===x.dataset.p2Check)).filter(Boolean).map(x=>`<div class="pc-context-alert${tone(x.tone)}"><strong>${esc(x.label)}</strong><span>${esc(x.response)}</span></div>`).join('');const rb=qa('[data-p2-risk]',root),n=rb.filter(x=>x.checked).length;q('[data-p2-risk-count]',root).textContent=n;q('[data-p2-risk-summary]',root).textContent=n?`${n} faktorë janë shënuar. Vazhdo me FRAX/vlerësimin klinik; ky numër nuk është kategori rreziku.`:'Asnjë faktor nuk është shënuar.'}
function values(root){return Object.fromEntries(qa('[data-p2-field]',root).map(f=>[f.dataset.p2Field,clean(f.value,f.dataset.p2Field==='instructions'?1200:300)]))}
function rxtext(v){if(!v.medicine)return'';const med=[v.medicine,v.strength].filter(Boolean).join(' '),sig=[v.dose&&`Doza: ${v.dose}`,v.frequency&&`Shpeshtësia: ${v.frequency}`,v.duration&&`Kohëzgjatja: ${v.duration}`,v.instructions].filter(Boolean).join(' · ');return['Rp:',med,v.quantity&&`Sasia: ${v.quantity}`,sig&&`S (Signatura): ${sig}`].filter(Boolean).join('\n')}
function bind(root,e,p){const pc=e.primaryCare;qa('[data-p2-check]',root).forEach(x=>x.onchange=()=>{const s=read(K.checks);s[x.dataset.p2Check]=x.checked;save(K.checks,s);update(root,pc)});q('[data-p2-reset]',root).onclick=()=>{qa('[data-p2-check]',root).forEach(x=>x.checked=false);sessionStorage.removeItem(K.checks);update(root,pc)};qa('[data-p2-risk]',root).forEach(x=>x.onchange=()=>{const s=read(K.risk);s[x.dataset.p2Risk]=x.checked;save(K.risk,s);update(root,pc)});qa('[data-p2-mode]',root).forEach(x=>x.onclick=()=>mode(root,x.dataset.p2Mode));qa('[data-p2-field]',root).forEach(x=>x.oninput=()=>save(K.rx,values(root)));qa('[data-p2-seed]',root).forEach(x=>x.onclick=()=>{const f=q('[data-p2-field="medicine"]',root);f.value=x.dataset.p2Seed;save(K.rx,values(root));f.focus()});q('[data-p2-clear]',root).onclick=()=>{qa('[data-p2-field]',root).forEach(x=>x.value='');sessionStorage.removeItem(K.rx);q('[data-p2-status]',root).textContent='Fushat u pastruan.'};q('[data-p2-copy]',root).onclick=async()=>{const t=rxtext(values(root)),s=q('[data-p2-status]',root);if(!t){s.textContent='Plotëso së paku barin / preparatin.';return}try{await navigator.clipboard.writeText(`${t}\n— Draft i plotësuar nga mjeku; verifiko para përdorimit.`);s.textContent='Drafti u kopjua. Verifiko të gjitha fushat.'}catch{s.textContent='Kopjimi automatik nuk u lejua.'}};q('[data-p2-handoff]',root).onclick=()=>{const t={version:1,protocolId:ID,protocolTitle:'Udhërrëfyesi Klinik – Menaxhimi i Osteoporozës',diagnosis:'Osteoporozë',sourceHash:p.h,composer:rxtext(values(root)),createdAt:new Date().toISOString()};try{sessionStorage.setItem(K.transfer,JSON.stringify(t));location.assign(`recetat.html?from=protocol&protocol=${ID}`)}catch{q('[data-p2-status]',root).textContent='Shfletuesi nuk lejoi bartjen e draftit.'}};mode(root,root.dataset.pcMode);update(root,pc)}
async function render(){const t=++token;if(route()!==ID)return;const reader=q('#protocolReader:not([hidden])');if(!reader||q('[data-p2-root]',reader))return;const target=q('.protocol-reader-main, .protocol-source-only',reader);if(!target)return;try{const p=await payload();if(t!==token||route()!==ID)return;const r=q('#protocolReader:not([hidden])'),x=r&&q('.protocol-reader-main, .protocol-source-only',r);if(!r||!x||q('[data-p2-root]',r))return;x.outerHTML=markup(p.e,p.doc);const root=q('[data-p2-root]',r),integrity=q('.protocol-reader-integrity',r);if(integrity){integrity.classList.add('is-review');integrity.innerHTML='<span class="protocol-integrity-mark"></span><div><strong>Pamje praktike e lidhur me burimin</strong>SHA-256 përputhet. Janë shfaqur vetëm gjërat kryesore që ndikojnë vendimin klinik.</div>'}bind(root,p.e,p)}catch(err){const i=q('#protocolReader:not([hidden]) .protocol-reader-integrity');if(i){i.classList.add('is-warning');const d=q('div',i);if(d)d.textContent=clean(err?.message)||'Pamja interaktive nuk u ngarkua.'}}}
function schedule(){requestAnimationFrame(()=>setTimeout(render,0))}
function init(){new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});addEventListener('popstate',schedule);document.addEventListener('click',e=>{if(e.target.closest?.('[data-protocol-open],[data-protocol-back]'))schedule()});schedule()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

(() => {
  'use strict';

  const ID = 'upk-03';
  const DATA_URL = '/data/protocol-elaborations-upk03.json';
  const MANIFEST_URL = '/data/protocols.json';
  const TRANSFER_KEY = 'medindexPrescriptionProtocolDraft';
  const WHO_URL = 'https://www.who.int/publications/i/item/9789240024168';
  const K = {
    checks:'mi_upk03_checks_v1',
    syndrome:'mi_upk03_syndrome_v1',
    rx:'mi_upk03_rx_v1',
    mode:'mi_upk03_mode_v1',
  };

  let pending = null;
  let scheduled = false;

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clean = (value, max = 1200) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[c]));

  function routeId() {
    try { return new URL(window.location.href).searchParams.get('protocol') || ''; }
    catch { return ''; }
  }

  function readState(key) {
    try {
      const value = JSON.parse(sessionStorage.getItem(key) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch { return {}; }
  }

  function saveState(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function readString(key, fallback = '') {
    try { return sessionStorage.getItem(key) || fallback; }
    catch { return fallback; }
  }

  function saveString(key, value) {
    try { sessionStorage.setItem(key, value); } catch {}
  }

  function toneClass(tone) {
    return ['danger', 'warning', 'info', 'primary'].includes(tone) ? ` is-${tone}` : '';
  }

  async function loadPayload() {
    if (pending) return pending;
    pending = Promise.all([
      fetch(DATA_URL, { credentials:'same-origin', cache:'no-cache', headers:{ Accept:'application/json' } }),
      fetch(MANIFEST_URL, { credentials:'same-origin', cache:'no-cache', headers:{ Accept:'application/json' } }),
    ]).then(async ([dataResponse, manifestResponse]) => {
      if (!dataResponse.ok || !manifestResponse.ok) throw new Error('Të dhënat e protokollit nr. 3 nuk u ngarkuan.');
      const [data, manifest] = await Promise.all([dataResponse.json(), manifestResponse.json()]);
      const entry = data?.entry;
      const documentRecord = Array.isArray(manifest?.documents) ? manifest.documents.find(item => item?.id === ID) : null;
      if (!entry?.primaryCare || !documentRecord || entry.protocolId !== ID) throw new Error('Pamja interaktive nuk është konfiguruar.');
      const sourceHash = clean(entry.sourceHash, 64).toLowerCase();
      const currentHash = clean(documentRecord.contentSha256, 64).toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(sourceHash) || sourceHash !== currentHash) {
        throw new Error('Versioni i burimit MSH ka ndryshuar. Pamja interaktive është ndalur.');
      }
      return { entry, documentRecord, sourceHash };
    }).catch(error => {
      pending = null;
      throw error;
    });
    return pending;
  }

  function officialLink(documentRecord, label = 'Hap Udhërrëfyesin e MSH') {
    const url = clean(documentRecord?.officialUrl, 1200);
    if (!url) return '';
    return `<a class="pc-source-chip" href="${esc(url)}" target="_blank" rel="noopener noreferrer external">${esc(label)}</a>`;
  }

  function supportLinks(documentRecord) {
    return `<div class="p3-source-pair">${officialLink(documentRecord, 'MSH · dokumenti zyrtar')}<a class="pc-source-chip p3-who" href="${WHO_URL}" target="_blank" rel="noopener noreferrer external">WHO 2021 · mbështetje e strukturës</a></div>`;
  }

  function todayMarkup(pc) {
    return `<section class="pc-panel pc-today" id="p3-today" aria-labelledby="p3TodayTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Sot në vizitë</span>
        <h2 id="p3TodayTitle">4 gjërat që s'duhet t'i humbësh</h2>
        <p>Fillimisht siguria, pastaj sindroma. Mos nis nga emri i mikrobit me hamendje.</p>
      </div>
      <div class="pc-today-grid">
        ${pc.todayActions.map(item => `<article class="pc-today-card${toneClass(item.tone)}">
          <div class="pc-today-number">${esc(item.number)}</div>
          <div><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></div>
        </article>`).join('')}
      </div>
    </section>`;
  }

  function checksMarkup(pc) {
    const saved = readState(K.checks);
    return `<section class="pc-panel pc-quick" id="p3-checks" aria-labelledby="p3ChecksTitle">
      <div class="pc-section-head pc-section-head-split">
        <div>
          <span class="pc-kicker">Kontroll interaktiv</span>
          <h2 id="p3ChecksTitle">Kontrollo në 60 sekonda</h2>
          <p>Shëno vetëm çka vlen. Kur del shenjë alarmi, paneli ta ndryshon menjëherë fokusin.</p>
        </div>
        <div class="pc-progress-wrap" aria-live="polite"><strong data-p3-count>0/${pc.quickChecks.length}</strong><span>të shënuara</span></div>
      </div>
      <div class="pc-progress" aria-hidden="true"><span data-p3-bar></span></div>
      <div class="pc-check-grid">
        ${pc.quickChecks.map(item => `<label class="pc-check${toneClass(item.tone)}">
          <input type="checkbox" data-p3-check="${esc(item.id)}" ${saved[item.id] ? 'checked' : ''}>
          <span class="pc-check-box" aria-hidden="true"></span>
          <span class="pc-check-copy">${esc(item.label)}</span>
        </label>`).join('')}
      </div>
      <div class="pc-context-alerts" data-p3-alerts aria-live="polite"></div>
      <button class="pc-text-button" type="button" data-p3-reset>Rivendos kontrollin</button>
    </section>`;
  }

  function syndromeDetailMarkup(item) {
    if (!item) return `<div class="p3-syndrome-empty"><strong>Zgjidh një sindromë</strong><span>Do të shfaqen vetëm hapat që kanë rëndësi për atë paraqitje.</span></div>`;
    return `<article class="p3-syndrome-detail" data-p3-detail-id="${esc(item.id)}">
      <header><span>Pyetja kryesore</span><h3>${esc(item.prompt)}</h3></header>
      <div class="p3-detail-grid">
        <section><strong>Çka kontrollon</strong><ol>${item.assessment.map(value => `<li>${esc(value)}</li>`).join('')}</ol></section>
        <section class="is-decision"><strong>Vendimi</strong><p>${esc(item.decision)}</p></section>
        <section class="is-follow"><strong>Follow-up / kur eskalon</strong><p>${esc(item.followUp)}</p></section>
      </div>
      <button class="p3-use-syndrome" type="button" data-p3-use-diagnosis="${esc(item.rxDiagnosis)}">Përdore këtë sindromë te Rp.</button>
    </article>`;
  }

  function syndromesMarkup(pc) {
    const savedId = readString(K.syndrome, '');
    const initial = pc.syndromes.find(item => item.id === savedId) || null;
    return `<section class="pc-panel p3-syndromes" id="p3-syndromes" aria-labelledby="p3SyndromesTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Hapi kryesor</span>
        <h2 id="p3SyndromesTitle">Cilën sindromë po e sheh?</h2>
        <p>Zgjidh vetëm paraqitjen që dominon. Nëse ka dy sindroma, vlerësoji të dyja klinikisht.</p>
      </div>
      <div class="p3-syndrome-grid" role="list">
        ${pc.syndromes.map(item => `<button type="button" class="p3-syndrome-card${initial?.id === item.id ? ' is-active' : ''}" data-p3-syndrome="${esc(item.id)}" aria-pressed="${initial?.id === item.id ? 'true' : 'false'}">
          <span>${esc(item.short)}</span><strong>${esc(item.title)}</strong>
        </button>`).join('')}
      </div>
      <div data-p3-syndrome-detail>${syndromeDetailMarkup(initial)}</div>
    </section>`;
  }

  function alwaysDoMarkup(pc, documentRecord) {
    return `<section class="pc-panel pc-deep p3-always" id="p3-always" aria-labelledby="p3AlwaysTitle">
      <div class="pc-section-head"><span class="pc-kicker">Në çdo sindromë</span><h2 id="p3AlwaysTitle">Mos i lër këto jashtë vizitës</h2></div>
      <div class="pc-follow-grid">${pc.alwaysDo.map(item => `<div><span aria-hidden="true">✓</span><p>${esc(item)}</p></div>`).join('')}</div>
      ${supportLinks(documentRecord)}
    </section>`;
  }

  function rxFieldMarkup(field, saved) {
    const value = clean(saved[field.id] || '', field.id === 'instructions' ? 1200 : 400);
    const wide = ['diagnosis', 'instructions'].includes(field.id);
    const textArea = field.id === 'instructions';
    return `<label class="${wide ? 'is-wide' : ''}"><span>${esc(field.label)}</span>${textArea
      ? `<textarea rows="2" data-p3-field="${esc(field.id)}" placeholder="${esc(field.placeholder)}">${esc(value)}</textarea>`
      : `<input type="text" data-p3-field="${esc(field.id)}" value="${esc(value)}" placeholder="${esc(field.placeholder)}" autocomplete="off">`}</label>`;
  }

  function rxMarkup(pc) {
    const rx = pc.rx;
    const saved = readState(K.rx);
    return `<section class="pc-panel pc-rx-section" id="p3-rx" aria-labelledby="p3RxTitle">
      <div class="pc-section-head">
        <span class="pc-kicker">Receta</span>
        <h2 id="p3RxTitle">Rp. në një katror — pa shpikur regjimin</h2>
        <p>${esc(rx.subtitle)}</p>
      </div>
      <div class="p3-rx-warning"><strong>Regjimi lokal duhet verifikuar</strong><span>MedIndex nuk e para-mbush antibiotikun/dozën për protokollin nr. 3 derisa Udhërrëfyesi MSH të auditohet faqe-për-faqe.</span></div>
      <div class="pc-rx-editor p3-rx-editor">
        <div class="pc-rx-editor-head"><div><span>Rp.</span><strong>${esc(rx.title)}</strong></div><span>Plotësohet nga mjeku</span></div>
        <div class="pc-rx-fields">${rx.fields.map(field => rxFieldMarkup(field, saved)).join('')}</div>
        <div class="pc-rx-editor-actions">
          <button class="pc-copy-button is-primary" type="button" data-p3-copy>Kopjo draftin</button>
          <button class="pc-copy-button pc-rx-handoff" type="button" data-p3-handoff>Vazhdo te Recetat</button>
          <button class="pc-text-button" type="button" data-p3-clear>Pastro</button>
        </div>
        <p class="pc-copy-status" data-p3-rx-status role="status" aria-live="polite"></p>
      </div>
    </section>`;
  }

  function referralMarkup(pc) {
    const referral = pc.referral;
    return `<section class="pc-panel pc-referral" id="p3-referral" aria-labelledby="p3ReferralTitle">
      <div class="pc-section-head"><span class="pc-kicker">Referimi</span><h2 id="p3ReferralTitle">${esc(referral.title)}</h2><p>Kjo ndarje e mban të dukshme atë që s'duhet të humbet në QKMF.</p></div>
      <div class="pc-referral-grid">
        <div class="pc-referral-box is-planned"><strong>Referim / testim i planifikuar</strong><ul>${referral.planned.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>
        <div class="pc-referral-box is-urgent"><strong>Vlerësim urgjent</strong><ul>${referral.urgent.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>
      </div>
    </section>`;
  }

  function mainMarkup(entry, documentRecord) {
    const pc = entry.primaryCare;
    const mode = readString(K.mode, 'quick') === 'full' ? 'full' : 'quick';
    return `<article class="protocol-reader-main protocol-primary-care p3-root" data-p3-root data-pc-mode="${mode}" aria-labelledby="p3Title">
      <header class="pc-hero">
        <div>
          <div class="pc-hero-meta"><span>${esc(pc.eyebrow)}</span><span class="pc-review-badge">${esc(pc.statusLabel)}</span></div>
          <h2 id="p3Title">${esc(pc.title)}</h2>
          <p>${esc(pc.subtitle)}</p>
        </div>
        <div class="pc-hero-tools">
          <div class="pc-mode-toggle" role="group" aria-label="Pamja e protokollit">
            <button type="button" data-p3-mode="quick">Shpejt</button>
            <button type="button" data-p3-mode="full">Më shumë</button>
          </div>
          <div class="pc-hero-source"><span>Burimi zyrtar</span><strong>MSH · ${esc(documentRecord.publishedAt || '')}</strong></div>
        </div>
      </header>
      <nav class="pc-jump-nav" aria-label="Shko te seksioni">
        <a href="#p3-today">Sot</a><a href="#p3-syndromes">Sindroma</a><a href="#p3-rx">Rp.</a><a href="#p3-referral">Referimi</a><a class="pc-deep" href="#p3-always">Gjithmonë</a>
      </nav>
      ${todayMarkup(pc)}
      ${checksMarkup(pc)}
      ${syndromesMarkup(pc)}
      ${rxMarkup(pc)}
      ${alwaysDoMarkup(pc, documentRecord)}
      ${referralMarkup(pc)}
      <aside class="pc-safety-note p3-integrity-note"><strong>Gjurmueshmëri klinike</strong><p>Identiteti dhe SHA-256 i dokumentit MSH verifikohen para se të hapet kjo pamje. Struktura sindromike është mbështetur edhe në WHO 2021; regjimet farmakologjike lokale nuk auto-publikohen pa audit të Udhërrëfyesit MSH.</p>${supportLinks(documentRecord)}</aside>
    </article>`;
  }

  function updateChecks(root, pc) {
    const boxes = qa('[data-p3-check]', root);
    const checked = boxes.filter(box => box.checked);
    const count = q('[data-p3-count]', root);
    const bar = q('[data-p3-bar]', root);
    const alerts = q('[data-p3-alerts]', root);
    if (count) count.textContent = `${checked.length}/${boxes.length}`;
    if (bar) bar.style.width = boxes.length ? `${Math.round((checked.length / boxes.length) * 100)}%` : '0%';
    if (alerts) {
      alerts.innerHTML = checked.map(box => pc.quickChecks.find(item => item.id === box.dataset.p3Check)).filter(Boolean)
        .map(item => `<div class="pc-context-alert${toneClass(item.tone)}"><strong>${esc(item.label)}</strong><span>${esc(item.response)}</span></div>`).join('');
    }
  }

  function setMode(root, value) {
    const mode = value === 'full' ? 'full' : 'quick';
    root.dataset.pcMode = mode;
    saveString(K.mode, mode);
    qa('[data-p3-mode]', root).forEach(button => button.setAttribute('aria-pressed', String(button.dataset.p3Mode === mode)));
  }

  function rxValues(root) {
    return Object.fromEntries(qa('[data-p3-field]', root).map(field => [field.dataset.p3Field, clean(field.value, field.dataset.p3Field === 'instructions' ? 1200 : 400)]));
  }

  function rxText(values) {
    if (!values.medicine) return '';
    const medicine = [values.medicine, values.strength].filter(Boolean).join(' ');
    const signature = [
      values.dose && `Doza: ${values.dose}`,
      values.frequency && `Shpeshtësia: ${values.frequency}`,
      values.duration && `Kohëzgjatja: ${values.duration}`,
      values.instructions,
    ].filter(Boolean).join(' · ');
    return [
      values.diagnosis && `Indikacioni: ${values.diagnosis}`,
      'Rp:',
      medicine,
      values.quantity && `Sasia: ${values.quantity}`,
      signature && `S (Signatura): ${signature}`,
    ].filter(Boolean).join('\n');
  }

  function useSyndrome(root, pc, id) {
    const item = pc.syndromes.find(candidate => candidate.id === id);
    if (!item) return;
    saveString(K.syndrome, item.id);
    qa('[data-p3-syndrome]', root).forEach(button => {
      const active = button.dataset.p3Syndrome === item.id;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const detail = q('[data-p3-syndrome-detail]', root);
    if (detail) detail.innerHTML = syndromeDetailMarkup(item);
  }

  function applyDiagnosisToRx(root, diagnosis) {
    const field = q('[data-p3-field="diagnosis"]', root);
    if (!field) return;
    field.value = clean(diagnosis, 400);
    saveState(K.rx, rxValues(root));
    q('#p3-rx', root)?.scrollIntoView({ behavior:'smooth', block:'center' });
    field.focus({ preventScroll:true });
  }

  function bind(root, entry, documentRecord, sourceHash) {
    if (root.dataset.p3Ready === 'true') return;
    root.dataset.p3Ready = 'true';
    const pc = entry.primaryCare;

    qa('[data-p3-check]', root).forEach(box => box.addEventListener('change', () => {
      const saved = readState(K.checks);
      saved[box.dataset.p3Check] = box.checked;
      saveState(K.checks, saved);
      updateChecks(root, pc);
    }));

    q('[data-p3-reset]', root)?.addEventListener('click', () => {
      qa('[data-p3-check]', root).forEach(box => { box.checked = false; });
      try { sessionStorage.removeItem(K.checks); } catch {}
      updateChecks(root, pc);
    });

    qa('[data-p3-mode]', root).forEach(button => button.addEventListener('click', () => setMode(root, button.dataset.p3Mode)));

    root.addEventListener('click', event => {
      const syndrome = event.target.closest?.('[data-p3-syndrome]');
      if (syndrome) {
        useSyndrome(root, pc, syndrome.dataset.p3Syndrome);
        return;
      }
      const use = event.target.closest?.('[data-p3-use-diagnosis]');
      if (use) applyDiagnosisToRx(root, use.dataset.p3UseDiagnosis);
    });

    qa('[data-p3-field]', root).forEach(field => field.addEventListener('input', () => saveState(K.rx, rxValues(root))));

    q('[data-p3-copy]', root)?.addEventListener('click', async () => {
      const status = q('[data-p3-rx-status]', root);
      const value = rxText(rxValues(root));
      if (!value) {
        if (status) status.textContent = 'Plotëso barin / preparatin vetëm pasi të kesh verifikuar regjimin lokal.';
        q('[data-p3-field="medicine"]', root)?.focus();
        return;
      }
      try {
        await navigator.clipboard.writeText(value);
        if (status) status.textContent = 'Drafti u kopjua. Verifiko regjimin klinik para përdorimit.';
      } catch {
        if (status) status.textContent = 'Shfletuesi nuk lejoi kopjimin automatik.';
      }
    });

    q('[data-p3-clear]', root)?.addEventListener('click', () => {
      qa('[data-p3-field]', root).forEach(field => { field.value = ''; });
      try { sessionStorage.removeItem(K.rx); } catch {}
      const status = q('[data-p3-rx-status]', root);
      if (status) status.textContent = 'Drafti u pastrua.';
    });

    q('[data-p3-handoff]', root)?.addEventListener('click', () => {
      const values = rxValues(root);
      const composer = rxText(values);
      const status = q('[data-p3-rx-status]', root);
      if (!values.diagnosis) {
        if (status) status.textContent = 'Zgjidh sindromën ose plotëso indikacionin para vazhdimit.';
        q('[data-p3-field="diagnosis"]', root)?.focus();
        return;
      }
      const transfer = {
        version:1,
        protocolId:ID,
        sourceHash,
        protocolTitle:clean(documentRecord.title, 200),
        diagnosis:values.diagnosis,
        composer,
        createdAt:new Date().toISOString(),
      };
      try {
        sessionStorage.setItem(TRANSFER_KEY, JSON.stringify(transfer));
        window.location.href = 'recetat.html';
      } catch {
        if (status) status.textContent = 'Drafti nuk mund të bartet në këtë shfletues.';
      }
    });

    setMode(root, readString(K.mode, 'quick'));
    updateChecks(root, pc);
  }

  async function enhance() {
    scheduled = false;
    if (routeId() !== ID) return;
    const reader = q('#protocolReader:not([hidden])');
    const layout = reader?.querySelector('.protocol-reader-layout');
    if (!reader || !layout || reader.querySelector('[data-p3-root]')) return;

    try {
      const { entry, documentRecord, sourceHash } = await loadPayload();
      if (routeId() !== ID) return;
      const latestReader = q('#protocolReader:not([hidden])');
      const latestLayout = latestReader?.querySelector('.protocol-reader-layout');
      if (!latestReader || !latestLayout || latestReader.querySelector('[data-p3-root]')) return;

      latestReader.querySelector('[data-protocol-workspace]')?.remove();
      const replaceTarget = latestLayout.querySelector('.protocol-source-only, .protocol-reader-main:not(.protocol-primary-care)');
      if (!replaceTarget) return;
      replaceTarget.outerHTML = mainMarkup(entry, documentRecord);

      const enhanced = latestReader.querySelector('[data-p3-root]');
      const integrity = latestReader.querySelector('.protocol-reader-integrity');
      if (integrity) {
        integrity.classList.add('is-review');
        integrity.innerHTML = '<span class="protocol-integrity-mark" aria-hidden="true"></span><div><strong>Burimi MSH i lidhur; përmbajtja në rishikim</strong>SHA-256 përputhet me dokumentin aktual. Struktura e sindromave mbështetet nga WHO 2021; dozat lokale nuk auto-plotësohen pa audit faqe-për-faqe të Udhërrëfyesit.</div>';
      }
      if (enhanced) bind(enhanced, entry, documentRecord, sourceHash);
    } catch (error) {
      const integrity = reader.querySelector('.protocol-reader-integrity');
      if (integrity) {
        integrity.classList.add('is-warning');
        const target = integrity.querySelector('div');
        if (target) target.textContent = clean(error?.message) || 'Pamja interaktive nuk u ngarkua.';
      }
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => window.setTimeout(enhance, 0));
  }

  function init() {
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden'] });
    window.addEventListener('popstate', schedule);
    window.addEventListener('pageshow', schedule, { passive:true });
    document.addEventListener('click', event => {
      if (event.target.closest?.('[data-protocol-open], [data-protocol-back]')) schedule();
    });
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();


(() => {
  'use strict';

  const SUPPORTED = new Set(['upk-05', 'upk-06', 'upk-07']);
  const DATA_URL = '/data/protocol-elaborations-copd.json';
  const MANIFEST_URL = '/data/protocols.json';
  let pending = null;
  let renderToken = 0;
  let scheduled = false;

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clean = (value, max = 2000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[character]));

  function routeId() {
    try {
      const id = new URL(window.location.href).searchParams.get('protocol') || '';
      return SUPPORTED.has(id) ? id : '';
    } catch {
      return '';
    }
  }

  function keys(id) {
    return {
      checks:`medindex_${id}_checks_v1`,
      mode:`medindex_${id}_mode_v1`,
    };
  }

  function read(key) {
    try {
      const value = JSON.parse(sessionStorage.getItem(key) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  function save(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function remove(key) {
    try { sessionStorage.removeItem(key); } catch {}
  }

  function savedMode(id) {
    try { return sessionStorage.getItem(keys(id).mode) === 'full' ? 'full' : 'quick'; }
    catch { return 'quick'; }
  }

  async function loadPayload() {
    if (pending) return pending;
    pending = Promise.all([
      fetch(DATA_URL, { credentials:'same-origin', cache:'no-cache', headers:{ Accept:'application/json' } }),
      fetch(MANIFEST_URL, { credentials:'same-origin', cache:'no-cache', headers:{ Accept:'application/json' } }),
    ]).then(async ([dataResponse, manifestResponse]) => {
      if (!dataResponse.ok || !manifestResponse.ok) throw new Error('Të dhënat e protokolleve të SPOK-ut nuk u ngarkuan.');
      const [data, manifest] = await Promise.all([dataResponse.json(), manifestResponse.json()]);
      return { data, manifest };
    }).catch(error => {
      pending = null;
      throw error;
    });
    return pending;
  }

  function matchedPayload(id, payload) {
    const entry = Array.isArray(payload?.data?.entries) ? payload.data.entries.find(item => item?.protocolId === id) : null;
    const documentRecord = Array.isArray(payload?.manifest?.documents) ? payload.manifest.documents.find(item => item?.id === id) : null;
    if (!entry?.primaryCare || !documentRecord) throw new Error('Pamja praktike nuk është konfiguruar për këtë protokoll.');
    const sourceHash = clean(entry.sourceHash, 64).toLowerCase();
    const currentHash = clean(documentRecord.contentSha256, 64).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sourceHash) || sourceHash !== currentHash) {
      throw new Error('Versioni i burimit ka ndryshuar. Pamja praktike është ndalur deri në rishikim.');
    }
    return { entry, documentRecord };
  }

  function toneClass(tone) {
    return ['danger', 'warning', 'info', 'primary'].includes(tone) ? ` is-${tone}` : '';
  }

  function sourceUrl(documentRecord, page) {
    const pageNumber = Number(page);
    if (!documentRecord?.officialUrl || !Number.isInteger(pageNumber) || pageNumber < 1) return '';
    try {
      const url = new URL(documentRecord.officialUrl);
      url.hash = `page=${pageNumber}`;
      return url.href;
    } catch {
      return '';
    }
  }

  function sourceChip(documentRecord, page, label = '') {
    const url = sourceUrl(documentRecord, page);
    if (!url) return '';
    return `<a class="pc-source-chip" href="${esc(url)}" target="_blank" rel="noopener noreferrer external">${esc(label || `Burimi · f. ${page}`)}</a>`;
  }

  function sourceRow(documentRecord, pages) {
    const values = [...new Set((Array.isArray(pages) ? pages : [pages]).map(Number).filter(Number.isInteger))];
    return values.length ? `<div class="pc-source-row">${values.map(page => sourceChip(documentRecord, page)).join('')}</div>` : '';
  }

  function todayMarkup(pc, documentRecord) {
    const items = Array.isArray(pc.todayActions) ? pc.todayActions : [];
    if (!items.length) return '';
    return `<section class="pc-panel pc-today" id="copd-today">
      <div class="pc-section-head"><span class="pc-kicker">Sot në vizitë</span><h2>Gjërat që ndryshojnë vendimin</h2><p>Çdo kartë lidhet drejtpërdrejt me faqen përkatëse të protokollit zyrtar.</p></div>
      <div class="pc-today-grid">${items.map(item => `<article class="pc-today-card${toneClass(item.tone)}"><div class="pc-today-number">${esc(item.number)}</div><div><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p>${sourceChip(documentRecord, item.sourcePage)}</div></article>`).join('')}</div>
    </section>`;
  }

  function checksMarkup(id, pc, documentRecord) {
    const items = Array.isArray(pc.quickChecks) ? pc.quickChecks : [];
    if (!items.length) return '';
    const stored = read(keys(id).checks);
    return `<section class="pc-panel pc-quick" id="copd-checks">
      <div class="pc-section-head pc-section-head-split"><div><span class="pc-kicker">Kontroll i shpejtë</span><h2>Kontrollo para se të vazhdosh</h2><p>Shëno vetëm çka vlen për pacientin. Paneli organizon protokollin; nuk vendos diagnozë dhe nuk zgjedh trajtimin në vend të mjekut.</p></div><div class="pc-progress-wrap"><strong data-copd-count>0/${items.length}</strong><span>të shënuara</span></div></div>
      <div class="pc-progress"><span data-copd-bar></span></div>
      <div class="pc-check-grid">${items.map(item => `<div class="pc-check-row"><label class="pc-check${toneClass(item.tone)}"><input type="checkbox" data-copd-check="${esc(item.id)}" ${stored[item.id] ? 'checked' : ''}><span class="pc-check-box"></span><span class="pc-check-copy">${esc(item.label)}</span></label>${sourceChip(documentRecord, item.sourcePage, `f. ${item.sourcePage}`)}</div>`).join('')}</div>
      <div class="pc-context-alerts" data-copd-alerts aria-live="polite"></div>
      <button class="pc-text-button" type="button" data-copd-reset>Rivendos kontrollin</button>
    </section>`;
  }

  function sectionMarkup(section, documentRecord, index) {
    const items = Array.isArray(section.items) ? section.items : [];
    return `<section class="pc-panel pc-deep" id="copd-section-${esc(section.id || index)}">
      <div class="pc-section-head"><span class="pc-kicker">${esc(section.kicker || 'Praktika')}</span><h2>${esc(section.title)}</h2><p>${esc(section.body)}</p>${sourceRow(documentRecord, section.sourcePages)}</div>
      ${items.length ? `<div class="pc-treatment-grid">${items.map(item => `<article class="pc-treatment-card${toneClass(item.tone)}"><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></article>`).join('')}</div>` : ''}
    </section>`;
  }

  function referralMarkup(referral, documentRecord) {
    if (!referral) return '';
    const planned = Array.isArray(referral.planned) ? referral.planned : [];
    const urgent = Array.isArray(referral.urgent) ? referral.urgent : [];
    return `<section class="pc-panel pc-referral" id="copd-referral">
      <div class="pc-section-head"><span class="pc-kicker">Referimi</span><h2>${esc(referral.title || 'Kur referohet?')}</h2><p><strong>Destinacioni:</strong> ${esc(referral.destination || '')}</p>${sourceRow(documentRecord, referral.sourcePage)}</div>
      <div class="pc-referral-grid"><div class="pc-referral-box is-planned"><strong>${esc(referral.plannedLabel || 'Referim')}</strong><ul>${planned.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div><div class="pc-referral-box is-urgent"><strong>${esc(referral.urgentLabel || 'Urgjencë / hospitalizim')}</strong><ul>${urgent.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div></div>
    </section>`;
  }

  function mainMarkup(id, entry, documentRecord) {
    const pc = entry.primaryCare || {};
    const sections = Array.isArray(pc.sections) ? pc.sections : [];
    return `<article class="protocol-reader-main protocol-primary-care" data-copd-root="${esc(id)}" data-pc-mode="${esc(savedMode(id))}" aria-labelledby="copdProtocolHeading">
      <header class="pc-hero"><div><div class="pc-hero-meta"><span>${esc(pc.eyebrow || 'Për mjekun familjar')}</span><span class="pc-review-badge">${esc(pc.statusLabel || 'Në rishikim klinik')}</span></div><h2 id="copdProtocolHeading">${esc(pc.title)}</h2><p>${esc(pc.subtitle)}</p></div><div class="pc-hero-tools"><div class="pc-mode-toggle" role="group" aria-label="Pamja e protokollit"><button type="button" data-copd-mode="quick">Shpejt</button><button type="button" data-copd-mode="full">E plotë</button></div><div class="pc-hero-source"><span>Burimi</span><strong>MSH · ${esc(documentRecord.publishedAt || '')}</strong></div></div></header>
      <nav class="pc-jump-nav" aria-label="Shko te seksioni"><a href="#copd-today">Sot</a><a href="#copd-checks">Kontrolli</a><a href="#copd-referral">Referimi</a>${sections.map((section, index) => `<a class="pc-deep" href="#copd-section-${esc(section.id || index)}">${esc(section.kicker || `Pjesa ${index + 1}`)}</a>`).join('')}</nav>
      ${todayMarkup(pc, documentRecord)}
      ${checksMarkup(id, pc, documentRecord)}
      ${sections.map((section, index) => sectionMarkup(section, documentRecord, index)).join('')}
      ${referralMarkup(pc.referral, documentRecord)}
      <aside class="pc-safety-note"><strong>Gjurmueshmëri klinike</strong><p>Kjo pamje shfaqet vetëm kur SHA-256 përputhet me kopjen aktuale të protokollit zyrtar. Statusi mbetet “në rishikim klinik”; dokumenti zyrtar ka përparësi.</p></aside>
    </article>`;
  }

  function setMode(root, id, value) {
    const mode = value === 'full' ? 'full' : 'quick';
    root.dataset.pcMode = mode;
    try { sessionStorage.setItem(keys(id).mode, mode); } catch {}
    qa('[data-copd-mode]', root).forEach(button => button.setAttribute('aria-pressed', String(button.dataset.copdMode === mode)));
  }

  function updateChecks(root, id, pc) {
    const boxes = qa('[data-copd-check]', root);
    const checked = boxes.filter(box => box.checked);
    const count = q('[data-copd-count]', root);
    const bar = q('[data-copd-bar]', root);
    if (count) count.textContent = `${checked.length}/${boxes.length}`;
    if (bar) bar.style.width = boxes.length ? `${Math.round((checked.length / boxes.length) * 100)}%` : '0%';
    const items = Array.isArray(pc.quickChecks) ? pc.quickChecks : [];
    const alerts = q('[data-copd-alerts]', root);
    if (alerts) {
      alerts.innerHTML = checked.map(box => items.find(item => item.id === box.dataset.copdCheck)).filter(Boolean).map(item => `<div class="pc-context-alert${toneClass(item.tone)}"><strong>${esc(item.label)}</strong><span>${esc(item.response || '')}</span></div>`).join('');
    }
  }

  function bind(root, id, pc) {
    const keySet = keys(id);
    qa('[data-copd-check]', root).forEach(box => box.addEventListener('change', () => {
      const state = read(keySet.checks);
      state[box.dataset.copdCheck] = box.checked;
      save(keySet.checks, state);
      updateChecks(root, id, pc);
    }));
    q('[data-copd-reset]', root)?.addEventListener('click', () => {
      qa('[data-copd-check]', root).forEach(box => { box.checked = false; });
      remove(keySet.checks);
      updateChecks(root, id, pc);
    });
    qa('[data-copd-mode]', root).forEach(button => button.addEventListener('click', () => setMode(root, id, button.dataset.copdMode)));
    setMode(root, id, root.dataset.pcMode);
    updateChecks(root, id, pc);
  }

  async function render() {
    scheduled = false;
    const id = routeId();
    const token = ++renderToken;
    if (!id) return;
    const reader = q('#protocolReader:not([hidden])');
    if (!reader || q(`[data-copd-root="${id}"]`, reader)) return;
    const target = q('.protocol-reader-main, .protocol-source-only', reader);
    if (!target) return;
    try {
      const payload = await loadPayload();
      const { entry, documentRecord } = matchedPayload(id, payload);
      if (token !== renderToken || routeId() !== id) return;
      const currentReader = q('#protocolReader:not([hidden])');
      const currentTarget = currentReader && q('.protocol-reader-main, .protocol-source-only', currentReader);
      if (!currentReader || !currentTarget || q(`[data-copd-root="${id}"]`, currentReader)) return;
      currentTarget.outerHTML = mainMarkup(id, entry, documentRecord);
      const root = q(`[data-copd-root="${id}"]`, currentReader);
      const integrity = q('.protocol-reader-integrity', currentReader);
      if (integrity) {
        integrity.classList.add('is-review');
        integrity.innerHTML = '<span class="protocol-integrity-mark" aria-hidden="true"></span><div><strong>Pamje praktike e lidhur me burimin</strong>SHA-256 përputhet me dokumentin aktual. Përmbajtja mbetet në rishikim klinik.</div>';
      }
      if (root) bind(root, id, entry.primaryCare || {});
    } catch (error) {
      const integrity = q('#protocolReader:not([hidden]) .protocol-reader-integrity');
      if (integrity) {
        integrity.classList.add('is-warning');
        const copy = q('div', integrity);
        if (copy) copy.textContent = clean(error?.message) || 'Pamja praktike nuk u ngarkua.';
      }
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => setTimeout(render, 0));
  }

  function init() {
    new MutationObserver(schedule).observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden'] });
    window.addEventListener('popstate', schedule);
    window.addEventListener('pageshow', schedule, { passive:true });
    document.addEventListener('click', event => {
      if (event.target.closest?.('[data-protocol-open], [data-protocol-back]')) schedule();
    });
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();


(() => {
  'use strict';

  const TARGET_PROTOCOL = 'upk-01';
  const TRANSFER_KEY = 'medindexPrescriptionProtocolDraft';
  const HASH_PATTERN = /^[a-f0-9]{64}$/i;
  let scheduled = false;

  const clean = (value, max = 500) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

  function routeId() {
    try { return new URL(window.location.href).searchParams.get('protocol') || ''; }
    catch { return ''; }
  }

  function currentRoot() {
    if (routeId() !== TARGET_PROTOCOL) return null;
    return document.querySelector('#protocolReader:not([hidden]) .protocol-primary-care');
  }

  function moveCitationOutsideLabel(label) {
    if (!label || label.closest('.pc-check-row')) return;
    const link = label.querySelector('.pc-source-chip');
    if (!link || !label.parentNode) return;
    const row = document.createElement('div');
    row.className = 'pc-check-row';
    label.parentNode.insertBefore(row, label);
    row.appendChild(label);
    row.appendChild(link);
  }

  function normalizeInteractiveSemantics(root) {
    root.querySelectorAll('.pc-check').forEach(moveCitationOutsideLabel);
    const title = root.querySelector('#pcProtocolHeading');
    if (title) title.textContent = 'Osteoporoza — çfarë duhet të kesh parasysh në praktikë';
    const quick = root.querySelector('#pcQuickTitle');
    if (quick) quick.textContent = 'Çfarë duhet të kontrollosh në 60 sekonda';
    const workflow = root.querySelector('#pcWorkflowTitle');
    if (workflow) workflow.textContent = 'Çfarë bën mjeku familjar?';
    const treatment = root.querySelector('#pcTreatmentTitle');
    if (treatment) treatment.textContent = 'Çfarë menaxhohet në QKMF dhe çfarë kalon te specialisti?';
  }

  function ensureHandoffButton(root) {
    const actions = root.querySelector('.pc-rx-editor-actions');
    if (!actions || actions.querySelector('[data-pc-open-receta]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pc-copy-button pc-rx-handoff';
    button.dataset.pcOpenReceta = '1';
    button.textContent = 'Vazhdo te Recetat';
    const clear = actions.querySelector('[data-pc-clear-rx]');
    actions.insertBefore(button, clear || null);
  }

  function rxValues(root) {
    return Object.fromEntries([...root.querySelectorAll('[data-pc-rx-field]')].map(field => [
      clean(field.dataset.pcRxField, 40),
      clean(field.value, field.dataset.pcRxField === 'instructions' ? 1200 : 300),
    ]));
  }

  function composerFromValues(values) {
    if (!values.medicine) return '';
    const medication = [values.medicine, values.strength].filter(Boolean).join(' ');
    const signature = [
      values.dose ? `Doza: ${values.dose}` : '',
      values.frequency ? `Shpeshtësia: ${values.frequency}` : '',
      values.duration ? `Kohëzgjatja: ${values.duration}` : '',
      values.instructions || '',
    ].filter(Boolean).join(' · ');
    return [
      'Rp:',
      medication,
      values.quantity ? `Sasia: ${values.quantity}` : '',
      signature ? `S (Signatura): ${signature}` : '',
    ].filter(Boolean).join('\n');
  }

  function sourceHash() {
    const value = clean(document.querySelector('#protocolReader .protocol-source-hash')?.textContent, 64).toLowerCase();
    return HASH_PATTERN.test(value) ? value : '';
  }

  function transferToPrescriptions(root) {
    const values = rxValues(root);
    const hash = sourceHash();
    const status = root.querySelector('[data-pc-copy-status]');
    if (!hash) {
      if (status) status.textContent = 'Burimi nuk u verifikua; drafti nuk u bart te Recetat.';
      return;
    }

    const payload = {
      version:1,
      protocolId:TARGET_PROTOCOL,
      protocolTitle:'Menaxhimi i osteoporozës',
      diagnosis:'Osteoporozë',
      sourceHash:hash,
      composer:composerFromValues(values),
      fields:values,
      createdAt:new Date().toISOString(),
    };

    try {
      sessionStorage.setItem(TRANSFER_KEY, JSON.stringify(payload));
    } catch {
      if (status) status.textContent = 'Shfletuesi nuk lejoi bartjen e draftit.';
      return;
    }

    const button = root.querySelector('[data-pc-open-receta]');
    if (button) {
      button.disabled = true;
      button.textContent = 'Duke hapur Recetat…';
    }
    window.location.assign(`recetat.html?from=protocol&protocol=${encodeURIComponent(TARGET_PROTOCOL)}`);
  }

  function enhance() {
    scheduled = false;
    const root = currentRoot();
    if (!root) return;
    normalizeInteractiveSemantics(root);
    ensureHandoffButton(root);
    if (root.dataset.pcHandoffReady === 'true') return;
    root.dataset.pcHandoffReady = 'true';
    root.addEventListener('click', event => {
      const button = event.target.closest?.('[data-pc-open-receta]');
      if (!button) return;
      event.preventDefault();
      transferToPrescriptions(root);
    });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhance);
  }

  function init() {
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden'] });
    window.addEventListener('popstate', schedule);
    window.addEventListener('pageshow', schedule, { passive:true });
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();


(() => {
  'use strict';

  const STORAGE_PREFIX = 'medindex_protocol_workspace_';
  const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i;
  let scheduled = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[character]));
  const clean = (value, max = 12000) => String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
  const oneLine = (value, max = 500) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

  function routeId() {
    try {
      const value = new URL(window.location.href).searchParams.get('protocol') || '';
      return ID_PATTERN.test(value) ? value : '';
    } catch {
      return '';
    }
  }

  function storageKey(id) {
    return `${STORAGE_PREFIX}${id}_v1`;
  }

  function readState(id) {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey(id)) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeState(id, value) {
    try { localStorage.setItem(storageKey(id), JSON.stringify(value)); } catch {}
  }

  function clearState(id) {
    try { localStorage.removeItem(storageKey(id)); } catch {}
  }

  function currentReader() {
    const reader = document.querySelector('#protocolReader:not([hidden])');
    if (!reader || !routeId()) return null;
    return reader;
  }

  function currentTitle(reader) {
    return oneLine(reader.querySelector('#protocolReaderTitle')?.textContent, 500) || 'Protokoll klinik';
  }

  function currentSource(reader) {
    const link = reader.querySelector('.protocol-official-button[href], .protocol-source-button[href]');
    return link?.href || '';
  }

  function hasSourceElaboration(reader) {
    return Boolean(reader.querySelector('.protocol-reader-main:not(.protocol-primary-care)'));
  }

  const reviewItems = [
    ['scope', 'Qëllimi, popullata dhe kufijtë e dokumentit janë identifikuar nga burimi.'],
    ['assessment', 'Diagnostikimi / vlerësimi dhe kriteret kryesore janë kontrolluar kundrejt burimit.'],
    ['treatment', 'Trajtimi / intervenimet dhe çdo dozë e përmendur janë kontrolluar kundrejt burimit.'],
    ['referral', 'Referimi, urgjencat dhe kufijtë mes niveleve të kujdesit janë identifikuar.'],
    ['followup', 'Monitorimi, follow-up dhe pikat e sigurisë janë kontrolluar.'],
    ['citations', 'Pikat që do të publikohen në MedIndex kanë faqe / referencë të qartë në burim.'],
  ];

  const noteFields = [
    ['scope', 'Qëllimi / popullata', 'Shëno vetëm çka mbështetet nga dokumenti…'],
    ['assessment', 'Vlerësimi / diagnostikimi', 'Algoritmi, kriteret, ekzaminimi, analizat…'],
    ['treatment', 'Trajtimi / terapia', 'Intervenimet, barnat, dozat, kufizimet…'],
    ['referral', 'Referimi / urgjenca', 'Kur referohet, ku referohet, çka nuk duhet humbur…'],
    ['followup', 'Follow-up / siguria', 'Monitorimi, efektet anësore, edukimi i pacientit…'],
  ];

  function checkedCount(saved) {
    const checks = saved?.checks && typeof saved.checks === 'object' ? saved.checks : {};
    return reviewItems.filter(([key]) => Boolean(checks[key])).length;
  }

  function enhanceDirectory() {
    document.querySelectorAll('.clinical-row[data-protocol-id]').forEach(row => {
      const id = oneLine(row.dataset.protocolId, 64);
      if (!ID_PATTERN.test(id)) return;
      const action = row.querySelector('.protocol-action-elaborate');
      if (action) {
        action.textContent = 'Hape protokollin';
        action.setAttribute('aria-label', `Hape ${oneLine(row.querySelector('h2')?.textContent, 240) || id}`);
      }
      const meta = row.querySelector('.clinical-row-meta');
      if (!meta) return;
      let chip = meta.querySelector('[data-paw-row-status]');
      if (!chip) {
        chip = document.createElement('span');
        chip.className = 'clinical-chip';
        chip.dataset.pawRowStatus = '1';
        meta.appendChild(chip);
      }
      const count = checkedCount(readState(id));
      chip.textContent = id === 'upk-01' ? 'Interaktiv' : (count ? `Audit ${count}/${reviewItems.length}` : 'Workspace');
    });
  }

  function workspaceMarkup(id, title, sourceUrl, elaborated, saved) {
    const checks = saved.checks && typeof saved.checks === 'object' ? saved.checks : {};
    const notes = saved.notes && typeof saved.notes === 'object' ? saved.notes : {};
    const completed = checkedCount(saved);
    const progress = Math.round((completed / reviewItems.length) * 100);
    const statusCopy = elaborated
      ? 'Elaborimi i burimit ekziston; ky workspace shërben për auditimin final para publikimit klinik.'
      : 'Nuk ka ende elaborim klinik të strukturuar. Workspace-i ruan vetëm auditimin dhe shënimet e tua; nuk shpik rekomandime.';

    return `<section class="protocol-audit-workspace" data-protocol-workspace="${esc(id)}" aria-labelledby="pawTitle">
      <header class="paw-head">
        <div>
          <span class="paw-kicker">Workspace i auditimit · ${esc(id.toUpperCase())}</span>
          <h2 id="pawTitle">Strukturoje protokollin pa humbur gjurmueshmërinë</h2>
          <p>${esc(statusCopy)}</p>
        </div>
        <span class="paw-status">${elaborated ? 'Audit final' : 'Draft pune'}</span>
      </header>

      <div class="paw-body">
        <section class="paw-section" aria-labelledby="pawChecklistTitle">
          <div class="paw-section-head">
            <div><h3 id="pawChecklistTitle">Checklistë para strukturimit</h3><p>Shënoje një pikë vetëm pasi ta kesh kontrolluar në dokumentin zyrtar.</p></div>
            <div class="paw-progress-label" aria-live="polite"><strong data-paw-count>${completed}/${reviewItems.length}</strong><span>të kontrolluara</span></div>
          </div>
          <div class="paw-progress" aria-hidden="true"><span data-paw-progress style="width:${progress}%"></span></div>
          <div class="paw-checks">
            ${reviewItems.map(([key, label]) => `<label class="paw-check"><input type="checkbox" data-paw-check="${esc(key)}" ${checks[key] ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}
          </div>
        </section>

        <section class="paw-section" aria-labelledby="pawNotesTitle">
          <div class="paw-section-head"><div><h3 id="pawNotesTitle">Shënimet e auditimit</h3><p>Ruhen lokalisht për këtë protokoll dhe nuk paraqiten si rekomandim klinik.</p></div></div>
          <div class="paw-notes">
            ${noteFields.map(([key, label, placeholder]) => `<label class="paw-note"><span>${esc(label)}</span><textarea rows="3" data-paw-note="${esc(key)}" placeholder="${esc(placeholder)}">${esc(clean(notes[key] || '', 4000))}</textarea></label>`).join('')}
          </div>
        </section>
      </div>

      <div class="paw-actions">
        ${sourceUrl ? `<a class="paw-button is-primary" href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer external">Hap burimin zyrtar</a>` : ''}
        <button class="paw-button" type="button" data-paw-copy>Kopjo auditimin</button>
        <button class="paw-button" type="button" data-paw-clear>Pastro workspace-in</button>
      </div>
      <p class="paw-status-text" data-paw-status role="status" aria-live="polite"></p>
      <aside class="paw-warning"><strong>${esc(title)}</strong><br>Ky panel është mjet pune. Përmbajtja klinike që publikohet në MedIndex duhet të mbetet e lidhur me versionin dhe faqet e burimit zyrtar.</aside>
    </section>`;
  }

  function collectState(root) {
    return {
      checks:Object.fromEntries([...root.querySelectorAll('[data-paw-check]')].map(input => [input.dataset.pawCheck, Boolean(input.checked)])),
      notes:Object.fromEntries([...root.querySelectorAll('[data-paw-note]')].map(input => [input.dataset.pawNote, clean(input.value, 4000)])),
      updatedAt:new Date().toISOString(),
    };
  }

  function updateProgress(root) {
    const boxes = [...root.querySelectorAll('[data-paw-check]')];
    const checked = boxes.filter(box => box.checked).length;
    const count = root.querySelector('[data-paw-count]');
    const progress = root.querySelector('[data-paw-progress]');
    if (count) count.textContent = `${checked}/${boxes.length}`;
    if (progress) progress.style.width = boxes.length ? `${Math.round((checked / boxes.length) * 100)}%` : '0%';
  }

  function auditClipboardText(root, title, id) {
    const state = collectState(root);
    const checked = reviewItems.filter(([key]) => state.checks[key]).map(([, label]) => `✓ ${label}`);
    const notes = noteFields
      .map(([key, label]) => state.notes[key] ? `${label}:\n${state.notes[key]}` : '')
      .filter(Boolean);
    return [
      `${title} · ${id.toUpperCase()}`,
      '',
      'Kontrollet e përfunduara:',
      checked.length ? checked.join('\n') : '— Asnjë',
      '',
      'Shënimet:',
      notes.length ? notes.join('\n\n') : '— Pa shënime',
      '',
      'Draft auditimi; verifiko kundrejt burimit zyrtar para publikimit klinik.',
    ].join('\n');
  }

  function bind(root, id, title) {
    if (root.dataset.pawReady === 'true') return;
    root.dataset.pawReady = 'true';

    const persist = () => {
      writeState(id, collectState(root));
      updateProgress(root);
    };
    root.querySelectorAll('[data-paw-check]').forEach(input => input.addEventListener('change', persist));
    root.querySelectorAll('[data-paw-note]').forEach(input => input.addEventListener('input', persist, { passive:true }));

    root.querySelector('[data-paw-copy]')?.addEventListener('click', async () => {
      const status = root.querySelector('[data-paw-status]');
      try {
        await navigator.clipboard.writeText(auditClipboardText(root, title, id));
        if (status) status.textContent = 'Auditimi u kopjua.';
      } catch {
        if (status) status.textContent = 'Shfletuesi nuk lejoi kopjimin automatik.';
      }
    });

    root.querySelector('[data-paw-clear]')?.addEventListener('click', () => {
      root.querySelectorAll('[data-paw-check]').forEach(input => { input.checked = false; });
      root.querySelectorAll('[data-paw-note]').forEach(input => { input.value = ''; });
      clearState(id);
      updateProgress(root);
      const status = root.querySelector('[data-paw-status]');
      if (status) status.textContent = 'Workspace-i u pastrua për këtë protokoll.';
    });

    updateProgress(root);
  }

  function enhance() {
    scheduled = false;
    enhanceDirectory();
    const reader = currentReader();
    if (!reader) return;
    const id = routeId();
    const existing = reader.querySelector('[data-protocol-workspace]');

    if (reader.querySelector('.protocol-primary-care')) {
      existing?.remove();
      return;
    }

    if (existing && existing.dataset.protocolWorkspace === id) return;
    existing?.remove();

    const layout = reader.querySelector('.protocol-reader-layout');
    if (!layout) return;
    const title = currentTitle(reader);
    const source = currentSource(reader);
    const elaborated = hasSourceElaboration(reader);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = workspaceMarkup(id, title, source, elaborated, readState(id));
    const root = wrapper.firstElementChild;
    if (!root) return;
    layout.insertBefore(root, layout.firstElementChild || null);
    bind(root, id, title);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhance);
  }

  function init() {
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden'] });
    window.addEventListener('popstate', schedule);
    window.addEventListener('pageshow', schedule, { passive:true });
    document.addEventListener('click', event => {
      if (event.target.closest?.('[data-protocol-open], [data-protocol-back]')) schedule();
    });
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
