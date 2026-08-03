(() => {
  'use strict';

  const THEME_KEY = 'regjistriBarnave_theme_v1';
  const PAGE_TITLE = 'MedIndex | Protokollet';
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
      <div>
        <h2>${esc(document.order)}. ${esc(document.title)}</h2>
        <div class="clinical-row-meta"><span class="clinical-chip">${esc(categoryLabel(document.category))}</span><span class="clinical-chip">${esc(document.type.toUpperCase())}</span>${document.archived ? '<span class="clinical-chip is-warning">Arkivore</span>' : ''}</div>
        <p>${published}</p>
      </div>
      <div class="clinical-actions">
        <a class="primary protocol-action-elaborate" href="?protocol=${encodeURIComponent(document.id)}" data-protocol-open="${esc(document.id)}">Elaboro protokollin</a>
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
      $('#protocolCategory').innerHTML = '<option value="">Të gjitha kategoritë</option>'
        + state.manifest.categories.map(category => `<option value="${esc(category.id)}">${esc(category.label)}</option>`).join('');
      renderDirectory();
      syncRoute(false);
    } catch (error) {
      const message = text(error?.message) || 'Manifesti nuk u ngarkua.';
      if (routeProtocolId()) {
        showReaderError(message, true);
        return;
      }
      if (status) status.textContent = message;
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

  function init() {
    initTheme();
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
