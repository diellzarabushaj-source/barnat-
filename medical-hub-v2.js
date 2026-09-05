(() => {
  'use strict';

  const HUB_API = '/api/medical-hub';

  const state = {
    items: [],
    filtered: [],
    selectedId: '',
    term: '',
    category: '',
    searchChapter: '',
    preSearchCategory: '',
    backendResults: null,
    searching: false,
    searchSequence: 0,
  };

  const detailCache = new Map();
  const detailRequests = new Map();
  const searchIndex = new Map();
  let searchTimer = 0;
  let drawerReturnFocus = null;
  const navigationDrawerQuery = window.matchMedia?.('(max-width:1420px)');

  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[char]));
  const normalize = value => String(value ?? '')
    .toLocaleLowerCase('sq')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function safeHref(value) {
    const raw = clean(value);
    if (!raw) return '';
    try {
      const url = new URL(raw, window.location.origin);
      return ['http:','https:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  function isNavigationDrawerViewport() {
    return Boolean(navigationDrawerQuery?.matches);
  }

  function navigationDrawerOpen() {
    return $('#hubNavigationDrawer')?.classList.contains('is-open') || false;
  }

  function syncNavigationDrawerMode() {
    const drawer = $('#hubNavigationDrawer');
    const toggle = $('#hubNavigationToggle');
    const backdrop = $('#hubNavigationBackdrop');
    if (!drawer || !toggle) return;

    if (!isNavigationDrawerViewport()) {
      drawer.classList.remove('is-open');
      drawer.removeAttribute('role');
      drawer.removeAttribute('aria-modal');
      drawer.removeAttribute('aria-hidden');
      drawer.inert = false;
      toggle.setAttribute('aria-expanded', 'false');
      if (backdrop) backdrop.hidden = true;
      document.body.classList.remove('hub-drawer-open');
      return;
    }

    const open = navigationDrawerOpen();
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-label', 'Navigimi i librit');
    drawer.setAttribute('aria-hidden', String(!open));
    drawer.inert = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (backdrop) backdrop.hidden = !open;
    document.body.classList.toggle('hub-drawer-open', open);
  }

  function openNavigationDrawer() {
    if (!isNavigationDrawerViewport()) return;
    const drawer = $('#hubNavigationDrawer');
    if (!drawer) return;
    drawerReturnFocus = document.activeElement;
    drawer.classList.add('is-open');
    syncNavigationDrawerMode();
    requestAnimationFrame(() => $('#learningCategory')?.focus());
  }

  function closeNavigationDrawer({ restoreFocus = true } = {}) {
    const drawer = $('#hubNavigationDrawer');
    if (!drawer?.classList.contains('is-open')) return;
    drawer.classList.remove('is-open');
    syncNavigationDrawerMode();
    if (restoreFocus && drawerReturnFocus instanceof HTMLElement) drawerReturnFocus.focus({ preventScroll:true });
    drawerReturnFocus = null;
  }

  function trapNavigationDrawerFocus(event) {
    if (event.key !== 'Tab' || !isNavigationDrawerViewport() || !navigationDrawerOpen()) return;
    const drawer = $('#hubNavigationDrawer');
    const focusable = [...(drawer?.querySelectorAll('button:not([disabled]),a[href],select:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])') || [])]
      .filter(node => !node.hidden && node.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function bindNavigationDrawer() {
    $('#hubNavigationToggle')?.addEventListener('click', openNavigationDrawer);
    $('#hubNavigationClose')?.addEventListener('click', () => closeNavigationDrawer());
    $('#hubNavigationBackdrop')?.addEventListener('click', () => closeNavigationDrawer());
    if (navigationDrawerQuery?.addEventListener) navigationDrawerQuery.addEventListener('change', syncNavigationDrawerMode);
    else navigationDrawerQuery?.addListener?.(syncNavigationDrawerMode);
    syncNavigationDrawerMode();
  }

  function setShortcutLabel() {
    const platform = clean(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent);
    const isApple = /mac|iphone|ipad|ipod/i.test(platform);
    const shortcut = $('#learningShortcut');
    if (shortcut) shortcut.textContent = isApple ? '⌘ K' : 'Ctrl K';
  }

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
    const explicitlySignedOut = response.status === 401
      || response.status === 403
      || (response.ok && payload.authenticated === false);

    if (explicitlySignedOut) {
      redirectToLogin();
      throw new Error('Sesioni nuk është aktiv.');
    }
    if (!response.ok) throw new Error('Sesioni nuk mund të verifikohet për momentin. Provo përsëri.');
    if (payload.authenticated !== true) throw new Error('Gjendja e sesionit nuk u konfirmua. Provo përsëri.');
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

  async function syncProfileChrome(payload) {
    await loadRuntime('/medindex-brand-runtime.js?v=drx-brand-v6', 'data-drx-profile-runtime').catch(() => null);
    window.MedIndexProfile?.adoptAccount?.(payload);
    window.dispatchEvent(new CustomEvent('medindex:auth-ready', { detail:payload }));
  }

  function loadSharedSidebarTaxonomy() {
    void loadRuntime('/sidebar-taxonomy-v3.js?v=sidebar-taxonomy-v4', 'data-drx-sidebar-taxonomy');
  }

  async function hubApi(params = {}, { timeout = 12000 } = {}) {
    const url = new URL(HUB_API, location.origin);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== '' && value != null) url.searchParams.set(key, String(value));
    });

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url.pathname + url.search, {
        credentials:'same-origin',
        headers:{ Accept:'application/json' },
        cache:'no-store',
        signal:controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        throw new Error('Sesioni nuk është aktiv.');
      }
      if (!response.ok || payload.ok !== true) {
        throw new Error(payload.error || `Medical Hub API ${response.status}`);
      }
      return payload;
    } finally {
      window.clearTimeout(timer);
    }
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

  function bindShell() {
    setShortcutLabel();
    bindNavigationDrawer();
    $('#menuButton')?.addEventListener('click', openSidebar);
    $('#sidebarClose')?.addEventListener('click', closeSidebar);
    $('#sidebarBackdrop')?.addEventListener('click', closeSidebar);
    $('#logoutButton')?.addEventListener('click', logout);

    window.addEventListener('keydown', event => {
      trapNavigationDrawerFocus(event);
      if (event.key === 'Escape') {
        if (navigationDrawerOpen()) {
          event.preventDefault();
          closeNavigationDrawer();
          return;
        }
        if (document.activeElement === $('#learningSearch') && state.term) {
          event.preventDefault();
          clearSearch();
          return;
        }
        closeSidebar();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        $('#learningSearch')?.focus();
      }
    });
  }

  function currentItem() {
    return state.items.find(item => item._id === state.selectedId)
      || state.filtered.find(item => item._id === state.selectedId)
      || null;
  }

  function readerNavigationItems() {
    if (clean(state.term)) return state.filtered.slice();
    if (state.category) return state.filtered.filter(item => !isChapter(item));
    return state.filtered.slice();
  }

  function chapterNumberFromId(id) {
    const match = String(id || '').match(/^medicalhub-dod-ch(\d{2})(?:-sub(\d+))?$/);
    return match ? Number(match[1]) : null;
  }

  function lessonNumberFromId(id) {
    const match = String(id || '').match(/^medicalhub-dod-ch\d{2}-sub(\d+)$/);
    return match ? Number(match[1]) : null;
  }

  function chapterKey(item) {
    const number = Number(item?.chapterNumber) || chapterNumberFromId(item?._id);
    return number ? String(number).padStart(2, '0') : '';
  }

  function isChapter(item) {
    return item?.contentKind === 'chapter'
      || /^medicalhub-dod-ch\d{2}$/.test(String(item?._id || ''));
  }

  function chapterLessons(key) {
    return state.items
      .filter(item => !isChapter(item) && chapterKey(item) === key)
      .sort((a,b) => topicOrder(a) - topicOrder(b));
  }

  function preferredChapterItem(key) {
    const chapter = state.items.find(item => isChapter(item) && chapterKey(item) === key) || null;
    const lessons = chapterLessons(key);
    return lessons.length === 1 ? lessons[0] : chapter;
  }

  function topicOrder(item) {
    const chapter = chapterNumberFromId(item?._id) || Number(item?.chapterNumber) || 999;
    const legacyLesson = lessonNumberFromId(item?._id);
    const lesson = legacyLesson == null ? (Number(item?.lessonNumber || item?.order) || 0) : legacyLesson;
    return chapter * 1000 + lesson;
  }

  function procedureEntries(item) {
    return (item?.procedureCodes || []).map(entry => {
      if (typeof entry === 'string') return { code:entry, system:'ICHI' };
      return { system:'ICHI', ...(entry || {}) };
    }).filter(entry => entry.code);
  }

  function codeSuffix(item) {
    const parts = [];
    const icd = (item?.icdCodes || []).filter(Boolean);
    const procedures = procedureEntries(item);
    if (icd.length) parts.push(`ICD‑10 ${icd.join(' · ')}`);
    if (procedures.length) {
      const grouped = procedures.map(entry => `${entry.system || 'ICHI'} ${entry.code}`);
      parts.push(grouped.join(' · '));
    }
    return parts.length ? ` · ${parts.join(' · ')}` : '';
  }

  function codedTitle(item) {
    let title = clean(item?.title || item?.question || '');
    const icdCodes = (item?.icdCodes || []).filter(Boolean);
    for (const code of icdCodes) {
      const suffix = ` · ICD-10 ${code}`;
      if (title.toUpperCase().endsWith(suffix.toUpperCase())) title = title.slice(0, -suffix.length).trim();
    }
    return title + codeSuffix(item);
  }

  function itemSearchText(item) {
    if (!item?._id) return '';
    if (searchIndex.has(item._id)) return searchIndex.get(item._id);
    const procedureText = procedureEntries(item)
      .flatMap(entry => [entry.code, entry.system, entry.label])
      .filter(Boolean);
    const value = normalize([
      item.question,
      item.title,
      item.summary,
      ...(item.keywords || []),
      ...(item.icdCodes || []),
      ...procedureText,
    ].join(' '));
    searchIndex.set(item._id, value);
    return value;
  }

  function applyFilterState() {
    const term = normalize(state.term);
    const candidates = term && Array.isArray(state.backendResults) ? state.backendResults : state.items;
    const source = term ? candidates.filter(item => !isChapter(item)) : candidates;
    state.filtered = source.filter(item => {
      const chapter = chapterKey(item);
      const localTermMatch = !term || Array.isArray(state.backendResults) || itemSearchText(item).includes(term);
      // Search is global across the complete book. Chapter selection only scopes browsing.
      return localTermMatch && (Boolean(term) || !state.category || chapter === state.category);
    }).sort((a, b) => topicOrder(a) - topicOrder(b) || clean(a.title).localeCompare(clean(b.title), 'sq'));

    if (!state.filtered.some(item => item._id === state.selectedId)) {
      const preferred = state.filtered.find(isChapter) || state.filtered[0];
      state.selectedId = preferred?._id || '';
      if (preferred) state.category = chapterKey(preferred) || state.category;
    }
  }

  function syncUrl({ push = false } = {}) {
    try {
      const url = new URL(window.location.href);
      const item = currentItem() || state.filtered.find(candidate => candidate._id === state.selectedId);
      if (state.category) url.searchParams.set('chapter', state.category);
      else url.searchParams.delete('chapter');
      if (item?.slug) url.searchParams.set('topic', item.slug);
      else url.searchParams.delete('topic');
      const next = `${url.pathname}${url.search}${url.hash}`;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (next === current) return;
      history[push ? 'pushState' : 'replaceState']({ medicalHub:true }, '', next);
    } catch {}
  }

  function restoreUrl() {
    try {
      const url = new URL(window.location.href);
      const slug = url.searchParams.get('topic') || '';
      const chapter = url.searchParams.get('chapter') || '';
      const item = state.items.find(candidate => candidate.slug === slug);
      if (item) {
        state.selectedId = item._id;
        state.category = chapterKey(item);
        return true;
      }
      if (/^\d{1,2}$/.test(chapter)) {
        state.category = String(Number(chapter)).padStart(2, '0');
        const preferred = preferredChapterItem(state.category);
        if (preferred) state.selectedId = preferred._id;
        return true;
      }
    } catch {}
    return false;
  }

  function restoreHistoryState() {
    if (!state.items.length) return;
    restoreUrl();
    const category = $('#learningCategory');
    if (category) category.value = state.category;
    applyFilterState();
    renderList();
    renderReaderNavigation();
    void renderSelectedDetail();
  }

  function reviewMeta(status) {
    const value = clean(status).toLowerCase();
    if (value === 'verified') return { className:'is-verified', label:'I verifikuar' };
    if (value === 'review') return { className:'is-review', label:'Në rishikim' };
    if (value === 'draft') return { className:'is-draft', label:'Draft' };
    return { className:'', label:value || 'Pa status' };
  }

  function richText(value) {
    let html = esc(clean(value));
    html = html
      .replace(/\*\*(.+?)\*\*/g, '<strong class="ck-inline-bold">$1</strong>')
      .replace(/==(.+?)==/g, '<mark class="ck-inline-mark">$1</mark>')
      .replace(/\n/g, '<br>');
    return html;
  }

  function plainText(value) {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') return clean(value);
    if (Array.isArray(value)) return clean(value.map(plainText).filter(Boolean).join(' '));
    if (typeof value === 'object') {
      if (Array.isArray(value.children)) return clean(value.children.map(child => child?.text || '').join(''));
      return clean(value.text || value.label || value.title || value.value || '');
    }
    return '';
  }

  function safeAnchor(value, fallback = 'section') {
    const token = normalize(value)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72);
    return token || fallback;
  }

  function portableInlineMarkup(block) {
    const markDefs = Array.isArray(block?.markDefs) ? block.markDefs : [];
    return (block?.children || []).map(child => {
      let output = esc(String(child?.text ?? '')).replace(/\n/g, '<br>');
      for (const mark of child?.marks || []) {
        if (mark === 'strong') output = `<strong>${output}</strong>`;
        else if (mark === 'em') output = `<em>${output}</em>`;
        else if (mark === 'code') output = `<code>${output}</code>`;
        else if (mark === 'underline') output = `<u>${output}</u>`;
        else if (mark === 'strike-through') output = `<s>${output}</s>`;
        else {
          const definition = markDefs.find(entry => entry?._key === mark);
          const href = safeHref(definition?.href);
          if (href) output = `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${output}</a>`;
        }
      }
      return output;
    }).join('');
  }

  function portableBlockMarkup(block) {
    const body = portableInlineMarkup(block);
    if (!body) return '';
    const style = clean(block?.style).toLowerCase();
    if (/^h[1-6]$/.test(style)) return `<h4 class="ck-source-subheading">${body}</h4>`;
    if (style === 'blockquote') return `<blockquote class="ck-source-quote">${body}</blockquote>`;
    return `<p class="ck-source-paragraph">${body}</p>`;
  }

  function sourceLocatorParts(locator) {
    if (!locator || typeof locator !== 'object') return [];
    const pageStart = Number(locator.pageStart) || 0;
    const pageEnd = Number(locator.pageEnd) || 0;
    const paragraphStart = Number(locator.paragraphStart) || 0;
    const paragraphEnd = Number(locator.paragraphEnd) || 0;
    const pages = pageStart
      ? `fq. ${pageStart}${pageEnd && pageEnd !== pageStart ? `–${pageEnd}` : ''}`
      : '';
    const paragraphs = paragraphStart
      ? `par. ${paragraphStart}${paragraphEnd && paragraphEnd !== paragraphStart ? `–${paragraphEnd}` : ''}`
      : '';
    const heading = Array.isArray(locator.headingPath)
      ? locator.headingPath.map(clean).filter(Boolean).join(' › ')
      : clean(locator.headingPath);
    return [pages, paragraphs, heading].filter(Boolean);
  }

  function sourceLocatorMarkup(locator, label = 'Në burim') {
    const parts = sourceLocatorParts(locator);
    const note = clean(locator?.sourceNote);
    if (!parts.length && !note) return '';
    return `<div class="ck-source-locator"><span>${esc(label)}</span>${parts.length ? `<strong>${esc(parts.join(' · '))}</strong>` : ''}${note ? `<small>${esc(note)}</small>` : ''}</div>`;
  }

  function bookDisplayMeta(item) {
    const book = item?.book || {};
    const version = clean(item?.version);
    let title = clean(book.shortTitle || book.title);
    let edition = [
      clean(book.edition).replace(/^[\s·—,:;-]+/, ''),
      book.publishedYear || book.publicationYear ? String(book.publishedYear || book.publicationYear) : '',
    ].filter(Boolean).join(' · ');
    if (!title && /doctor on duty/i.test(version)) {
      title = 'Doctor on Duty';
      edition = clean(version.replace(/doctor on duty/i, ''));
    }
    if (!title) title = 'Doctor on Duty';
    if (!edition) edition = version || 'Botimi klinik i publikuar';
    return { title, edition };
  }

  function bookSourceHref(item) {
    const file = item?.book?.sourceFile || {};
    const direct = safeHref(file.url || item?.book?.sourceUrl);
    if (direct) return direct;
    const driveFileId = clean(file.driveFileId || item?.book?.sourceFileId);
    return driveFileId ? `https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/view` : '';
  }

  function sourcePanelMarkup(item) {
    const meta = bookDisplayMeta(item);
    const sourceHref = bookSourceHref(item) || safeHref(item?.sources?.[0]?.url);
    const sourceFile = clean(
      item?.book?.sourceFile?.fileName
      || item?.book?.sourceName
      || item?.sources?.[0]?.title
      || item?.sources?.[0]?.organization
    );
    const locator = sourceLocatorParts(item?.sourceLocator);
    const review = reviewMeta(item?.reviewStatus);
    const reviewedAt = item?.lastReviewedAt
      ? new Date(item.lastReviewedAt).toLocaleDateString('sq-AL')
      : '';
    const isVerified = clean(item?.reviewStatus).toLowerCase() === 'verified';
    return `
      <aside class="ck-source-panel" aria-label="Burimi dhe verifikimi">
        <div class="ck-source-publication">
          <span>Burimi i librit</span>
          <strong>${esc(meta.title)}</strong>
          <small>${esc([meta.edition, sourceFile].filter(Boolean).join(' · '))}</small>
        </div>
        <div class="ck-source-verification">
          <span class="ck-review-badge ${review.className}"><span class="ck-review-dot" aria-hidden="true"></span><strong>${esc(review.label)}</strong></span>
          ${locator.length ? `<span class="ck-source-page">${esc(locator.join(' · '))}</span>` : ''}
          ${reviewedAt ? `<span class="ck-source-date">Rishikuar ${esc(reviewedAt)}</span>` : ''}
          ${sourceHref ? `<a href="${esc(sourceHref)}" target="_blank" rel="noopener noreferrer">Hap dokumentin burimor ↗</a>` : ''}
        </div>
      </aside>
      ${isVerified ? '' : `
        <aside class="ck-review-warning" role="note">
          <strong>Përmbajtje në proces editorial</strong>
          <p>Kjo temë nuk është verifikuar ende. Mos e përdor për vendimmarrje klinike derisa statusi të jetë “I verifikuar”.</p>
        </aside>`}`;
  }

  function updateBookChrome(item) {
    if (!item) return;
    const meta = bookDisplayMeta(item);
    const review = reviewMeta(item?.book?.reviewStatus || item.reviewStatus);
    const title = $('#hubBookTitle');
    const edition = $('#hubBookEdition');
    const status = $('#hubBookReview');
    const sourceLink = $('#hubBookSourceLink');
    const href = bookSourceHref(item);
    if (title) title.textContent = meta.title;
    if (edition) edition.textContent = meta.edition;
    if (status) status.textContent = review.label;
    if (sourceLink) {
      sourceLink.hidden = !href;
      if (href) sourceLink.href = href;
      else sourceLink.removeAttribute('href');
    }
  }

  function clinicalCalloutMarkup(block) {
    const intent = normalize(block?.intent);
    const className = intent === 'redflag' ? 'is-danger'
      : intent === 'referral' ? 'is-success'
        : intent === 'warning' ? 'is-warning'
          : 'is-info';
    const title = clean(block?.title || (intent === 'redflag' ? 'Shenjë alarmuese' : intent === 'warning' ? 'Kujdes' : intent === 'referral' ? 'Referim' : 'Shënim klinik'));
    return `
      <aside class="ck-clinical-callout ${className}">
        <strong>${esc(title)}</strong>
        <div>${medicalContentMarkup(block?.body || [])}</div>
      </aside>`;
  }

  function clinicalStepGroupMarkup(block) {
    const steps = Array.isArray(block?.steps) ? block.steps : [];
    if (!steps.length && !clean(block?.intro)) return '';
    return `
      <section class="ck-modern-block ck-modern-step-group">
        ${block?.title ? `<h4>${esc(block.title)}</h4>` : ''}
        ${block?.intro ? `<p class="ck-source-paragraph">${esc(block.intro)}</p>` : ''}
        ${steps.length ? `<div class="ck-steps">${steps.map((step, index) => stepMarkup({ ...step, why:step.rationale || step.why }, index)).join('')}</div>` : ''}
      </section>`;
  }

  function prescriptionGroupMarkup(block) {
    const lines = Array.isArray(block?.lines) ? block.lines : [];
    const relationToken = clean(block?.relation);
    const relation = /^(or|ose|alternative)$/i.test(relationToken)
      ? 'Alternativa'
      : relationToken === 'asNeeded' ? 'Sipas nevojës' : '';
    if (!lines.length && !clean(block?.note)) return '';
    return `
      <section class="ck-modern-block ck-modern-prescriptions">
        <div class="ck-section-heading"><span>Rx</span><h4>${esc(block?.title || 'Receta / skema e përshkrimit')}</h4></div>
        ${(block?.applicability || relation) ? `<div class="ck-prescription-context">${block?.applicability ? `<span>${esc(block.applicability)}</span>` : ''}${relation ? `<strong>${esc(relation)}</strong>` : ''}</div>` : ''}
        ${lines.length ? rxGroupMarkup(lines) : ''}
        ${block?.note ? `<p class="ck-section-note">${esc(block.note)}</p>` : ''}
      </section>`;
  }

  function medicalFigureBlockMarkup(block, index) {
    const url = clean(block?.imageUrl || block?.externalUrl);
    if (!url) return '';
    const figure = figureMarkup({
      ...block,
      url,
      sourceUrl:block.sourceUrl || block.externalUrl,
    }, index);
    return `<div class="ck-modern-block ck-medical-figure">${figure}${sourceLocatorMarkup(block?.sourceLocator, 'Figura në burim')}</div>`;
  }

  function medicalTableMarkup(block) {
    const columns = Array.isArray(block?.columns) ? block.columns : [];
    const rows = Array.isArray(block?.rows) ? block.rows : [];
    if (!columns.length && !rows.length) return '';
    const hasLabels = rows.some(row => clean(row?.label));
    return `
      <section class="ck-modern-block ck-medical-table-block">
        ${block?.title ? `<h4>${esc(block.title)}</h4>` : ''}
        <div class="ck-medical-table-wrap" tabindex="0" role="region" aria-label="${esc(block?.title || 'Tabelë klinike')}">
          <table class="ck-medical-table">
            <thead><tr>${hasLabels ? '<th scope="col">Kategoria</th>' : ''}${columns.map(column => `<th scope="col">${esc(plainText(column))}</th>`).join('')}</tr></thead>
            <tbody>${rows.map(row => `<tr>${hasLabels ? `<th scope="row">${esc(row?.label || '')}</th>` : ''}${(row?.cells || []).map(cell => `<td>${esc(plainText(cell))}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>
        ${block?.note ? `<p class="ck-section-note">${esc(block.note)}</p>` : ''}
        ${sourceLocatorMarkup(block?.sourceLocator, 'Tabela në burim')}
      </section>`;
  }

  function contentBlockMarkup(block, index) {
    const type = clean(block?._type);
    if (type === 'block') return portableBlockMarkup(block);
    if (type === 'clinicalCallout') return clinicalCalloutMarkup(block);
    if (type === 'clinicalStepGroup') return clinicalStepGroupMarkup(block);
    if (type === 'prescriptionGroup') return prescriptionGroupMarkup(block);
    if (type === 'medicalFigure') return medicalFigureBlockMarkup(block, index);
    if (type === 'medicalTable') return medicalTableMarkup(block);
    return '';
  }

  function medicalContentMarkup(blocks) {
    const content = Array.isArray(blocks) ? blocks : [];
    let html = '';
    for (let index = 0; index < content.length; index += 1) {
      const block = content[index];
      if (block?._type === 'block' && block.listItem) {
        const listItem = clean(block.listItem).toLowerCase();
        const tag = listItem === 'number' ? 'ol' : 'ul';
        const items = [];
        while (index < content.length && content[index]?._type === 'block' && clean(content[index].listItem).toLowerCase() === listItem) {
          items.push(`<li>${portableInlineMarkup(content[index])}</li>`);
          index += 1;
        }
        index -= 1;
        html += `<${tag} class="ck-source-list-block">${items.join('')}</${tag}>`;
        continue;
      }
      html += contentBlockMarkup(block, index);
    }
    return html;
  }

  function isMedicalTopic(item) {
    return item?._type === 'medicalTopic' && Array.isArray(item?.sections);
  }

  function stepStyleClass(step) {
    const token = normalize(step?.priority || '');
    if (token === 'highlight') return 'is-source-highlight';
    if (token === 'note') return 'is-source-note';
    if (token === 'table') return 'is-source-table';
    if (token === 'warning') return 'is-source-warning';
    return '';
  }

  function chip(label, className = '') {
    return `<span class="ck-chip ${className}">${esc(label)}</span>`;
  }

  function icdChip(code) {
    const value = clean(code);
    if (!value) return '';
    return `<a class="ck-chip ck-code-chip" href="/icd.html#${encodeURIComponent(value)}" title="Hap ${esc(value)} në ICD-10">ICD‑10 ${esc(value)}</a>`;
  }

  function procedureChip(entry) {
    const code = clean(entry?.code);
    if (!code) return '';
    const system = clean(entry?.system || 'Procedurë');
    const label = clean(entry?.label);
    const title = [system, label].filter(Boolean).join(' — ');
    return `<span class="ck-chip ck-procedure-chip" title="${esc(title)}">${esc(system)} ${esc(code)}</span>`;
  }

  function figureDisplayUrl(rawUrl) {
    const value = clean(rawUrl);
    if (!value) return '';
    try {
      const parsed = new URL(value, window.location.origin);
      if (parsed.hostname === 'upload.wikimedia.org' || parsed.hostname === 'commons.wikimedia.org') {
        return `/api/medical-hub-image?url=${encodeURIComponent(parsed.href)}`;
      }
      return parsed.href;
    } catch {
      return value;
    }
  }

  function figureMarkup(figure, index) {
    const originalUrl = clean(figure?.url);
    if (!originalUrl) return '';
    const displayUrl = figureDisplayUrl(originalUrl);
    const alt = clean(figure?.alt || figure?.title || `Figura ${index + 1}`);
    const caption = clean(figure?.caption || figure?.title);
    const sourceUrl = clean(figure?.sourceUrl);
    const credit = clean(figure?.credit);
    return `
      <figure class="ck-figure">
        <a class="ck-figure-media" href="${esc(displayUrl)}" target="_blank" rel="noopener noreferrer" title="Hap figurën në rezolucion të plotë">
          <img data-hub-figure-image src="${esc(displayUrl)}" alt="${esc(alt)}" loading="lazy" decoding="async">
          <span class="ck-figure-fallback" data-hub-figure-fallback hidden>
            <strong>Figura nuk u ngarkua.</strong>
            <small>Hape burimin/licencën poshtë ose provo përsëri.</small>
          </span>
          <span class="ck-figure-zoom" aria-hidden="true">↗</span>
        </a>
        ${caption || credit || sourceUrl ? `
          <figcaption>
            ${caption ? `<strong>${esc(caption)}</strong>` : ''}
            ${credit ? `<span>${esc(credit)}</span>` : ''}
            ${sourceUrl ? `<a href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">Burimi / licenca ↗</a>` : ''}
          </figcaption>
        ` : ''}
      </figure>`;
  }

  function hasSourceRx(item) {
    return (item?.steps || []).some(step => normalize(step?.priority) === 'rx-source');
  }

  function sourceRxStepMarkup(step, index) {
    const lines = String(step?.action || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    return `
      <div class="ck-book-rx-group">
        <span class="ck-book-rx-number">${index + 1}.</span>
        <div class="ck-book-rx-copy">
          ${step?.title ? `<strong>${richText(step.title)}</strong>` : ''}
          <div class="ck-book-rx-lines">
            ${lines.map(line => {
              const match = line.match(/^(OR|OSE)\b\s*(.*)$/i);
              if (match) {
                return `<div class="ck-book-rx-alternative"><span>OR</span><div>${richText(match[2] || '')}</div></div>`;
              }
              return `<div class="ck-book-rx-line">${richText(line)}</div>`;
            }).join('')}
          </div>
          ${step?.note ? `<small class="ck-book-rx-note">${richText(step.note)}</small>` : ''}
        </div>
      </div>`;
  }

  function sourceRxMarkup(item) {
    const steps = (item?.steps || []).filter(step => normalize(step?.priority) === 'rx-source');
    const title = clean(item?.sourceRxTitle || 'RECETA / SKEMA E PËRSHKRIMIT');
    return `
      <article class="ck-book-rx">
        <div class="ck-book-rx-head">
          <span>Rx</span>
          <strong>${esc(title)}</strong>
        </div>
        <div class="ck-book-rx-body">
          ${steps.map(sourceRxStepMarkup).join('')}
        </div>
      </article>`;
  }

  function hasContentOrder(item) {
    return Array.isArray(item?.contentOrder) && item.contentOrder.some(block => {
      const kind = normalize(block?.kind);
      return ['step','figure','sourcerx','source-rx','rx','prescriptions','heading','paragraph','warning','redflags'].includes(kind);
    });
  }

  function contentOrderBlockMarkup(item, block, index) {
    const kind = normalize(block?.kind);
    const refKey = clean(block?.refKey);

    if (kind === 'step') {
      const stepIndex = (item.steps || []).findIndex(step => clean(step?._key) === refKey);
      const step = stepIndex >= 0 ? item.steps[stepIndex] : null;
      return step ? stepMarkup(step, stepIndex) : '';
    }

    if (kind === 'figure') {
      const figureIndex = (item.figures || []).findIndex(figure => clean(figure?._key) === refKey);
      const figure = figureIndex >= 0 ? item.figures[figureIndex] : null;
      return figure ? `<div class="ck-ordered-figure">${figureMarkup(figure, figureIndex)}</div>` : '';
    }

    if (kind === 'sourcerx' || kind === 'source-rx') {
      return sourceRxMarkup(item);
    }

    if (kind === 'rx' || kind === 'prescriptions') {
      return rxGroupMarkup(item.prescriptions || []);
    }

    if (kind === 'heading') {
      const title = clean(block?.title || block?.text);
      return title ? `<div class="ck-source-heading"><h3>${esc(title)}</h3></div>` : '';
    }

    if (kind === 'paragraph') {
      const text = clean(block?.text);
      return text ? `<p class="ck-summary ck-source-paragraph">${richText(text)}</p>` : '';
    }

    if (kind === 'warning') {
      const title = clean(block?.title || 'Kujdes');
      const text = clean(block?.text);
      return `<div class="ck-source-warning"><strong>${esc(title)}</strong>${text ? `<p>${richText(text)}</p>` : ''}</div>`;
    }

    if (kind === 'redflags') {
      return item.redFlags?.length
        ? `<div class="ck-source-warning ck-source-danger"><strong>Red flags</strong>${bulletMarkup(item.redFlags)}</div>`
        : '';
    }

    return '';
  }

  function orderedClinicalContentMarkup(item) {
    const html = (item.contentOrder || [])
      .map((block, index) => contentOrderBlockMarkup(item, block, index))
      .filter(Boolean)
      .join('');
    return html ? `<div class="ck-ordered-content">${html}</div>` : '';
  }

  function lessonBodyLabel(item) {
    const title = normalize(item?.title);
    if (/trajtim|menaxhim/.test(title)) return 'Trajtimi hap pas hapi';
    if (/procedur|kanulim|venepunksion|intubim|kateteriz|punksion|paracentez|toracentez|transfuzion|injeksion|aspirim|artrocentez/.test(title)) return 'Procedura hap pas hapi';
    return 'Pikat dhe hapat kryesorë';
  }

  function bulletMarkup(items) {
    return `<ul class="ck-bullets">${(items || []).map(item => `<li>${esc(item)}</li>`).join('')}</ul>`;
  }

  function isSingleLessonChapter(item) {
    return /mësim(?:i)? i vetëm|1 mësim/i.test(clean(item?.question))
      || ((Number(item?.chapterNumber) === 1 || Number(item?.chapterNumber) === 2) && (item?.steps?.length || 0) > 10);
  }

  function splitSectionAction(action) {
    const value = clean(action);
    if (!value) return { lead:'', bullets:[] };
    const parts = value.split(' — ');
    if (parts.length === 1) return { lead:value, bullets:[] };
    const lead = parts.shift();
    const rest = parts.join(' — ');
    return { lead, bullets:rest.split(' • ').map(clean).filter(Boolean) };
  }

  function singleLessonSectionMarkup(step, index) {
    const parsed = splitSectionAction(step?.action);
    const title = clean(step?.title || `Seksioni ${index + 1}`);
    const codeMatch = title.match(/ICD[-‑–— ]?10\s*([A-Z]\d{2}(?:\.\d+)?)|ICD[-‑–— ]?10\s*([A-Z]\d{2})/i);
    const code = codeMatch ? (codeMatch[1] || codeMatch[2]) : '';
    return `
      <section class="ck-master-section" id="hub-master-${index + 1}">
        <div class="ck-master-section-head">
          <span class="ck-master-section-no">${String(index + 1).padStart(2, '0')}</span>
          <span class="ck-master-section-heading">
            <strong>${esc(title.replace(/^\d+\.\s*/, ''))}</strong>
            ${parsed.lead ? `<small>${esc(parsed.lead)}</small>` : ''}
          </span>
          <span class="ck-master-section-side">
            ${code ? icdChip(code) : ''}
          </span>
        </div>
        <div class="ck-master-section-body">
          ${parsed.bullets.length ? `
            <ul class="ck-master-bullets">
              ${parsed.bullets.map(item => {
                const cut = item.indexOf(':');
                if (cut > 0 && cut < 90) {
                  return `<li><strong>${esc(item.slice(0,cut))}</strong><span>${esc(item.slice(cut+1).trim())}</span></li>`;
                }
                return `<li><span>${esc(item)}</span></li>`;
              }).join('')}
            </ul>
          ` : (parsed.lead ? '' : `<p>${esc(step?.action || '')}</p>`)}
          ${step?.why ? `<div class="ck-step-why"><span>Pse</span><p>${esc(step.why)}</p></div>` : ''}
        </div>
      </section>`;
  }

  function stepMarkup(step, index) {
    const styleClass = stepStyleClass(step);
    const meta = [step.setting].filter(Boolean);
    return `
      <article class="ck-step ${styleClass}">
        <span class="ck-step-number">${String(index + 1).padStart(2, '0')}</span>
        <div class="ck-step-copy">
          <div class="ck-step-title">
            <strong>${richText(step.title || 'Hapi')}</strong>
            ${meta.length ? `<small>${esc(meta.join(' · '))}</small>` : ''}
          </div>
          <p>${richText(step.action || '')}</p>
          ${step.why ? `<div class="ck-step-why"><span>Pse</span><p>${richText(step.why)}</p></div>` : ''}
          ${step.note ? `<small class="ck-step-note">${richText(step.note)}</small>` : ''}
        </div>
      </article>`;
  }

  function activeSubstanceName(rx) {
    return clean(rx?.genericName || rx?.medicine || 'Substancë aktive');
  }

  function prescriptionFormLabel(form) {
    const raw = clean(form);
    const token = normalize(raw);
    if (!raw) return '';
    if (/^tablet|tabletë|tab\.?$/.test(token)) return 'Tab.';
    if (/^capsule|kapsul|cap\.?$/.test(token)) return 'Cap.';
    if (/^syrup|shurup|syp\.?$/.test(token)) return 'Syp.';
    if (/^injection|injeksion|inj\.?$/.test(token)) return 'Inj.';
    if (/^ampoule|ampul|amp\.?$/.test(token)) return 'Amp.';
    if (/^drops|pika|gtt\.?$/.test(token)) return 'Gtt.';
    if (/^cream|krem/.test(token)) return 'Crm.';
    return raw;
  }

  function rxRelation(rx) {
    const instruction = clean(rx?.instructions);
    return /^(OR|OSE)$/i.test(instruction) ? 'OR' : '';
  }

  function rxSignature(rx) {
    const instruction = clean(rx?.instructions);
    const extraInstruction = instruction && !/^(OR|OSE)$/i.test(instruction) ? instruction : '';
    const strength = clean(rx?.strength);
    const dose = clean(rx?.dose);
    const frequency = clean(rx?.frequency);
    const duration = clean(rx?.duration);
    const parts = [];

    if (dose && normalize(dose) !== normalize(strength)) parts.push(dose);
    if (frequency) parts.push(frequency);

    const durationAlreadyExpressed = duration && (
      normalize(frequency).includes(normalize(duration))
      || (/^\d+\s*(doza|dose|doses)$/i.test(duration) && /përsërit|perserit|repeat/i.test(frequency))
    );
    if (duration && !durationAlreadyExpressed) parts.push(`për ${duration}`);

    if (rx?.route && normalize(rx.route) !== 'po') parts.push(clean(rx.route));
    if (extraInstruction) parts.push(extraInstruction);
    return parts.join(' · ');
  }

  function rxLineMarkup(rx, index) {
    const form = prescriptionFormLabel(rx?.form);
    const name = activeSubstanceName(rx);
    const strength = clean(rx?.strength);
    const relation = rxRelation(rx);
    const signature = rxSignature(rx);
    return `
      ${relation ? '<div class="ck-rx-or" aria-label="alternativë">OR</div>' : ''}
      <div class="ck-rx-line">
        <span class="ck-rx-line-no">${index + 1}.</span>
        <div class="ck-rx-line-copy">
          <div class="ck-rx-drug-line">
            ${form ? `<span>${esc(form)}</span>` : ''}
            <strong>${esc(name)}</strong>
            ${strength ? `<span>à ${esc(strength)}</span>` : ''}
          </div>
          ${signature ? `<p class="ck-rx-signature"><strong>S.</strong> ${esc(signature)}</p>` : ''}
          ${rx?.quantity ? `<p class="ck-rx-quantity">No. ${esc(rx.quantity)}</p>` : ''}
          ${rx?.clinicalNote ? `<small class="ck-rx-note">${esc(rx.clinicalNote)}</small>` : ''}
        </div>
      </div>`;
  }

  function rxGroupMarkup(prescriptions) {
    const items = (prescriptions || []).filter(Boolean);
    if (!items.length) return '';
    return `
      <article class="ck-rx-sheet">
        <div class="ck-rx-sheet-head">
          <span>Rx</span>
          <div>
            <strong>Receta / skema e përshkrimit</strong>
          </div>
        </div>
        <div class="ck-rx-lines">
          ${items.map(rxLineMarkup).join('')}
        </div>
      </article>`;
  }

  function sectionEntries(item) {
    const entries = [];
    const ordered = hasContentOrder(item);
    if (item.redFlags?.length && !isSingleLessonChapter(item)) entries.push({ id:'hub-red-flags', label:'Red flags' });
    if (item.relatedTopics?.length) entries.push({ id:'hub-internal-sections', label:'Seksionet e mësimit' });
    if (ordered) entries.push({ id:'hub-content', label:'Përmbajtja' });
    else if (item.steps?.length) entries.push({ id:'hub-content', label:hasSourceRx(item) ? clean(item.sourceRxTitle || 'Receta') : (isSingleLessonChapter(item) ? `${item.steps.length} seksione` : lessonBodyLabel(item)) });
    if (!ordered && item.figures?.length) entries.push({ id:'hub-figures', label:'Figura dhe ilustrime' });
    if (!ordered && item.prescriptions?.length && !hasSourceRx(item)) entries.push({ id:'hub-prescriptions', label:'Receta' });
    if (item.whenToRefer) entries.push({ id:'hub-referral', label:'Referimi' });
    if (item.relatedProtocols?.length) entries.push({ id:'hub-protocols', label:'Protokolle të lidhura' });
    if (item.sources?.length) entries.push({ id:'hub-sources', label:'Burimet' });
    return entries;
  }

  function scrollReaderToTop() {
    const root = $('#learningDetail');
    if (!root) return;
    root.scrollIntoView({
      block:'start',
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }

  function bindFigureFallbacks(detail) {
    detail.querySelectorAll('[data-hub-figure-image]').forEach(image => {
      const fallback = image.parentElement?.querySelector('[data-hub-figure-fallback]');
      const fail = () => {
        image.hidden = true;
        if (fallback) fallback.hidden = false;
        image.parentElement?.classList.add('has-error');
      };
      image.addEventListener('error', fail, { once:true });
      if (image.complete && image.naturalWidth === 0) fail();
    });
  }

  /* Reading width and foldable sections -------------------------------------
     The two rails hold 450-520px of the desktop grid, which is right while the
     reader is choosing a lesson and wrong once they are reading one. A control
     in the page heading hands that column to the reader and hands it back.
     Sections fold on their own too, so a long chapter collapses to something
     closer to a table of contents. Both remember their state, so returning to
     a lesson returns to how it was left.

     Only the desktop grid is touched. Below 1100px the rails are already a
     drawer behind "Shfleto librin", which stays exactly as it is. */

  const RAILS_KEY = 'drx_hub_rails_hidden_v1';
  const FOLD_KEY = 'drx_hub_folded_sections_v1';

  function readStore(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  }
  function writeStore(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  }

  function applyRailsHidden(hidden) {
    document.documentElement.toggleAttribute('data-hub-rails-hidden', hidden);
    const toggle = $('#hubRailsToggle');
    if (!toggle) return;
    toggle.setAttribute('aria-pressed', hidden ? 'true' : 'false');
    const label = toggle.querySelector('[data-hub-rails-label]');
    if (label) label.textContent = hidden ? 'Shfaq panelet' : 'Fshih panelet';
  }

  function bindRailsToggle() {
    const toggle = $('#hubRailsToggle');
    if (!toggle || toggle.dataset.bound === '1') return;
    toggle.dataset.bound = '1';
    applyRailsHidden(readStore(RAILS_KEY, false) === true);
    toggle.addEventListener('click', () => {
      const hidden = !document.documentElement.hasAttribute('data-hub-rails-hidden');
      applyRailsHidden(hidden);
      writeStore(RAILS_KEY, hidden);
    });
  }

  /* Every `.ck-section` opens with `.ck-section-heading` and everything after
     it is the body. That one shape covers each branch of the reader without
     editing any of them. */
  function bindSectionFolding(detail) {
    const folded = new Set(readStore(FOLD_KEY, []) || []);
    let seq = 0;

    detail.querySelectorAll('.ck-section').forEach(section => {
      const heading = section.querySelector(':scope > .ck-section-heading');
      if (!heading || heading.querySelector('[data-hub-fold]')) return;

      const body = document.createElement('div');
      body.className = 'ck-section-body';
      body.id = `${section.id || `hub-section-${++seq}`}-body`;
      let node = heading.nextSibling;
      while (node) {
        const next = node.nextSibling;
        body.appendChild(node);
        node = next;
      }
      section.appendChild(body);

      const title = heading.querySelector('h3')?.textContent?.trim() || 'seksionin';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ck-section-fold';
      button.dataset.hubFold = '1';
      button.setAttribute('aria-controls', body.id);
      button.setAttribute('aria-label', `Palos ose hap ${title}`);
      button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
      heading.appendChild(button);

      const key = section.id || '';
      // `reveal` is false while restoring the remembered state on render: the
      // whole document is already animating in, and every open section
      // fading in on top of that reads as a stutter, not as an answer.
      const setOpen = (open, reveal) => {
        body.hidden = !open;
        section.classList.toggle('is-folded', !open);
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        body.classList.remove('is-revealing');
        if (open && reveal) {
          void body.offsetWidth;
          body.classList.add('is-revealing');
        }
        if (!key) return;
        if (open) folded.delete(key); else folded.add(key);
        writeStore(FOLD_KEY, [...folded]);
      };

      setOpen(!(key && folded.has(key)), false);
      button.addEventListener('click', () => setOpen(body.hidden, true));
      heading.addEventListener('click', event => {
        if (event.target.closest('a,button')) return;
        setOpen(body.hidden, true);
      });
    });
  }

  function bindDetailNavigation(detail) {
    bindFigureFallbacks(detail);
    bindRailsToggle();
    bindSectionFolding(detail);
    detail.querySelectorAll('[data-hub-section]').forEach(button => {
      button.addEventListener('click', () => {
        document.getElementById(button.dataset.hubSection)?.scrollIntoView({
          block:'start',
          behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
      });
    });

    detail.querySelectorAll('[data-master-section]').forEach(button => {
      button.addEventListener('click', () => {
        const sections = detail.querySelectorAll('.ck-master-section');
        const target = sections[Number(button.dataset.masterSection)];
        if (!target) return;
        target.scrollIntoView({
          block:'start',
          behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
      });
    });

    detail.querySelectorAll('[data-topic-jump]').forEach(button => {
      button.addEventListener('click', () => {
        const id = button.dataset.topicJump;
        if (!state.filtered.some(item => item._id === id)) {
          const target = state.items.find(item => item._id === id);
          if (target) {
            state.category = chapterKey(target);
            const category = $('#learningCategory');
            if (category) category.value = state.category;
            applyFilterState();
          }
        }
        selectTopic(id, { scroll:true });
      });
    });
  }

  function renderChapterDetail(item) {
    const detail = $('#learningDetail');
    if (!detail) return;
    updateBookChrome(item);
    const review = reviewMeta(item.reviewStatus);
    const children = (item.relatedTopics || []).slice().sort((a, b) => topicOrder(a) - topicOrder(b));
    const icdLessons = children.filter(child => child.icdCodes?.length).length;
    const procedureLessons = children.filter(child => procedureEntries(child).length).length;
    const populated = children.filter(child => clean(child.summary)).length;

    detail.innerHTML = `
      <div class="ck-document-inner ck-chapter-document">
        <header class="ck-detail-head">
          <div class="ck-detail-title-row">
            <div>
              <p class="ck-kicker">${esc(item.question || 'Kapitull')}</p>
              <h2>${esc(codedTitle(item))}</h2>
            </div>
            <span class="ck-review-badge ${review.className}">
              <span class="ck-review-dot" aria-hidden="true"></span>
              <strong>${esc(review.label)}</strong>
            </span>
          </div>
          <div class="ck-meta">
            ${chip(children.length === 1 ? '1 mësim' : `${children.length} mësime`)}
            ${icdLessons ? chip(`${icdLessons} me ICD‑10`, 'is-code-count') : ''}
            ${procedureLessons ? chip(`${procedureLessons} procedura`, 'is-procedure-count') : ''}
            ${item.version ? chip(item.version) : ''}
          </div>
          ${item.summary ? `<div class="ck-quick-summary"><span>Përmbledhja e kapitullit</span><p>${esc(item.summary)}</p></div>` : ''}
        </header>

        ${sourcePanelMarkup(item)}

        ${item.steps?.length ? `
          <section class="ck-section ck-chapter-overview">
            <div class="ck-section-heading"><span>Fokus</span><h3>Çfarë përfshin ky kapitull</h3></div>
            <div class="ck-chapter-focus-grid">
              ${item.steps.map((step, index) => `
                <article class="ck-chapter-focus-card">
                  <span>${String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>${esc(step.title || 'Pjesa')}</strong>
                    <p>${esc(step.action || '')}</p>
                  </div>
                </article>
              `).join('')}
            </div>
          </section>
        ` : ''}

        <section class="ck-section ck-chapter-section">
          <div class="ck-section-heading"><span>Indeks</span><h3>${children.length === 1 ? 'Mësimi i këtij kapitulli' : 'Mësimet e këtij kapitulli'}</h3></div>
          <div class="ck-chapter-progress">
            <span><strong>${populated}</strong> / ${children.length} me përmbajtje të plotësuar</span>
            <span>${icdLessons} të lidhur me ICD‑10</span>
          </div>
          <div class="ck-chapter-lessons">
            ${children.map((child, index) => {
              const childReview = reviewMeta(child.reviewStatus);
              return `
                <button type="button" class="ck-chapter-lesson" data-topic-jump="${esc(child._id)}">
                  <span class="ck-chapter-lesson-no">${String(index + 1).padStart(2, '0')}</span>
                  <span class="ck-chapter-lesson-copy">
                    <strong>${esc(codedTitle(child))}</strong>
                    ${child.summary ? `<small>${esc(child.summary)}</small>` : '<small>Përmbajtja do të plotësohet nga burimi.</small>'}
                    <span class="ck-chapter-lesson-meta">
                      ${(child.icdCodes || []).map(icdChip).join('')}
                      ${procedureEntries(child).map(procedureChip).join('')}
                      <span class="ck-mini-status ${childReview.className}"><i></i>${esc(childReview.label)}</span>
                    </span>
                  </span>
                  <span class="ck-chapter-lesson-arrow" aria-hidden="true">→</span>
                </button>`;
            }).join('') || '<p class="ck-status">Nuk ka mësime të lidhura.</p>'}
          </div>
        </section>
      </div>`;
    bindDetailNavigation(detail);
  }

  function nestedSectionMarkup(section, index) {
    const title = clean(section?.title || section?.question || `Seksioni ${index + 1}`).replace(/^\d+(?:\.\d+)?\s*[—-]\s*/, '');
    const review = reviewMeta(section?.reviewStatus);
    const procedures = procedureEntries(section);
    return `
      <section class="ck-internal-section" id="hub-internal-${index + 1}">
        <div class="ck-internal-section-head">
          <span class="ck-internal-section-no">${String(index + 1).padStart(2, '0')}</span>
          <span class="ck-internal-section-title">
            <strong>${esc(title)}</strong>
            <small>${esc(section?.summary || 'Seksion i brendshëm i këtij mësimi.')}</small>
          </span>
          <span class="ck-internal-section-meta">
            ${(section.icdCodes || []).map(icdChip).join('')}
            ${procedures.map(procedureChip).join('')}
            <span class="ck-mini-status ${review.className}"><i></i>${esc(review.label)}</span>
          </span>
        </div>
        <div class="ck-internal-section-body">
          ${section.redFlags?.length ? `
            <div class="ck-internal-alert">
              <strong>Red flags</strong>
              ${bulletMarkup(section.redFlags)}
            </div>
          ` : ''}
          ${section.steps?.length ? `<div class="ck-steps">${section.steps.map(stepMarkup).join('')}</div>` : ''}
          ${section.figures?.length ? `
            <div class="ck-figure-grid">${section.figures.slice().sort((a,b)=>(a.order||0)-(b.order||0)).map(figureMarkup).join('')}</div>
          ` : ''}
          ${section.prescriptions?.length ? `
            <div class="ck-rx-section ck-rx-section-nested">
              <div class="ck-section-heading"><span>Rx</span><h3>Receta / skema e përshkrimit</h3></div>
              ${rxGroupMarkup(section.prescriptions)}
            </div>
          ` : ''}
          ${section.whenToRefer ? `<div class="ck-internal-referral"><strong>Kur të referohet</strong><p>${esc(section.whenToRefer)}</p></div>` : ''}
        </div>
      </section>`;
  }

  function renderLessonDetail(item) {
    const detail = $('#learningDetail');
    if (!detail) return;
    updateBookChrome(item);
    const review = reviewMeta(item.reviewStatus);
    const sections = sectionEntries(item);
    const navigationItems = readerNavigationItems();
    const currentIndex = navigationItems.findIndex(candidate => candidate._id === item._id);
    const previous = currentIndex > 0 ? navigationItems[currentIndex - 1] : null;
    const next = currentIndex >= 0 && currentIndex < navigationItems.length - 1 ? navigationItems[currentIndex + 1] : null;
    const procedures = procedureEntries(item);

    detail.innerHTML = `
      <div class="ck-document-inner">
        <header class="ck-detail-head">
          <div class="ck-detail-title-row">
            <div>
              <p class="ck-kicker">${esc(item.question || 'Mësim klinik')}</p>
              <h2>${esc(codedTitle(item))}</h2>
            </div>
            <span class="ck-review-badge ${review.className}">
              <span class="ck-review-dot" aria-hidden="true"></span>
              <strong>${esc(review.label)}</strong>
            </span>
          </div>
          <div class="ck-meta">
            ${(item.icdCodes || []).map(icdChip).join('')}
            ${procedures.map(procedureChip).join('')}
            ${item.version ? chip(item.version) : ''}
            ${item.reviewedBy ? chip(item.reviewedBy) : ''}
          </div>
          ${item.summary ? `<div class="ck-quick-summary"><span>Në 20 sekonda</span><p>${esc(item.summary)}</p></div>` : ''}
        </header>

        ${sourcePanelMarkup(item)}

        ${sections.length > 1 ? `
          <nav class="ck-section-index" aria-label="Përmbajtja e këtij mësimi">
            <div class="ck-section-index-head"><span>Në këtë mësim</span><small>${sections.length} pjesë</small></div>
            <div class="ck-section-index-list">
              ${sections.map((section, index) => `
                <button type="button" data-hub-section="${section.id}">
                  <span>${String(index + 1).padStart(2, '0')}</span>
                  <strong>${esc(section.label)}</strong>
                </button>
              `).join('')}
            </div>
          </nav>
        ` : ''}

        <div class="ck-sections">
          ${item.relatedTopics?.length ? `
            <section class="ck-section" id="hub-internal-sections">
              <div class="ck-section-heading"><span>Struktura</span><h3>Seksionet e mësimit</h3></div>
              <div class="ck-internal-sections">
                ${item.relatedTopics
                  .slice()
                  .sort((a,b)=>(a.sectionNumber||0)-(b.sectionNumber||0))
                  .map(nestedSectionMarkup)
                  .join('')}
              </div>
            </section>
          ` : ''}

          ${item.redFlags?.length && !isSingleLessonChapter(item) ? `
            <section class="ck-section ck-referral" id="hub-red-flags">
              <div class="ck-section-heading"><span>Urgjencë</span><h3>Red flags — ndalo dhe vlerëso urgjent</h3></div>
              ${bulletMarkup(item.redFlags)}
            </section>
          ` : ''}

          ${hasContentOrder(item) || item.steps?.length ? `
            <section class="ck-section" id="hub-content">
              <div class="ck-section-heading">
                <span>${hasContentOrder(item) ? 'Burimi' : (hasSourceRx(item) ? 'Rx' : 'Përmbajtje')}</span>
                <h3>${esc(hasContentOrder(item) ? 'Përmbajtja sipas rendit të burimit' : (hasSourceRx(item) ? clean(item.sourceRxTitle || 'Receta / skema e përshkrimit') : (isSingleLessonChapter(item) ? `${item.steps.length} seksionet e mësimit` : lessonBodyLabel(item))))}</h3>
              </div>
              ${hasContentOrder(item)
                ? orderedClinicalContentMarkup(item)
                : (hasSourceRx(item) ? sourceRxMarkup(item) : (isSingleLessonChapter(item) ? `
                    <details class="ck-master-outline" open>
                      <summary><span>Përmbajtja e mësimit</span><strong>${item.steps.length} seksione</strong></summary>
                      <div class="ck-master-section-index">
                        ${item.steps.map((step,index)=>`<button type="button" data-master-section="${index}"><span>${String(index+1).padStart(2,'0')}</span><strong>${esc(clean(step.title).replace(/^\d+\.\s*/,''))}</strong></button>`).join('')}
                      </div>
                    </details>
                    <div class="ck-master-sections">${item.steps.map(singleLessonSectionMarkup).join('')}</div>
                  ` : `<div class="ck-steps">${item.steps.map(stepMarkup).join('')}</div>`))}
            </section>
          ` : ''}

          ${item.redFlags?.length && isSingleLessonChapter(item) ? `
            <section class="ck-section ck-referral" id="hub-red-flags">
              <div class="ck-section-heading"><span>Urgjencë</span><h3>Shenjat alarmuese në shembullin klinik</h3></div>
              ${bulletMarkup(item.redFlags)}
            </section>
          ` : ''}

          ${item.figures?.length && !hasContentOrder(item) ? `
            <section class="ck-section" id="hub-figures">
              <div class="ck-section-heading"><span>Figura</span><h3>Figura dhe ilustrime</h3></div>
              <div class="ck-figure-grid">${item.figures.slice().sort((a,b)=>(a.order||0)-(b.order||0)).map(figureMarkup).join('')}</div>
            </section>
          ` : ''}

          ${item.prescriptions?.length && !hasSourceRx(item) && !hasContentOrder(item) ? `
            <section class="ck-section ck-rx-section" id="hub-prescriptions">
              <div class="ck-section-heading"><span>Rx</span><h3>Receta / skema e përshkrimit</h3></div>
              ${rxGroupMarkup(item.prescriptions)}
            </section>
          ` : ''}

          ${item.whenToRefer ? `
            <section class="ck-section ck-referral ck-referral-neutral" id="hub-referral">
              <div class="ck-section-heading"><span>Referim</span><h3>Kur të referohet</h3></div>
              <p class="ck-summary">${esc(item.whenToRefer)}</p>
            </section>
          ` : ''}

          ${item.relatedProtocols?.length ? `
            <section class="ck-section" id="hub-protocols">
              <div class="ck-section-heading"><span>Burime</span><h3>Protokolle të lidhura</h3></div>
              <div class="ck-protocol-list">
                ${item.relatedProtocols.map(protocol => `
                  <a href="/protokollet.html" class="ck-protocol-link">
                    <span>${esc(protocol.title)}</span>
                    <small>${esc(protocol.summary || 'Hap protokollet klinike')}</small>
                    <strong>Hap →</strong>
                  </a>
                `).join('')}
              </div>
            </section>
          ` : ''}

          ${item.sources?.length ? `
            <section class="ck-section" id="hub-sources">
              <div class="ck-section-heading"><span>Burime</span><h3>Burimet dhe referencat</h3></div>
              <div class="ck-source-list">
                ${item.sources.map(source => `
                  <article class="ck-source-card">
                    <div>
                      <strong>${esc(source.title || source.organization || 'Burim')}</strong>
                      ${source.organization ? `<span>${esc(source.organization)}</span>` : ''}
                    </div>
                    ${source.note ? `<p>${esc(source.note)}</p>` : ''}
                    ${source.url ? `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">Hap burimin ↗</a>` : ''}
                  </article>
                `).join('')}
              </div>
            </section>
          ` : ''}
        </div>

        ${item.lastReviewedAt ? `
          <div class="ck-source-meta">
            <span>Rishikuar: ${esc(new Date(item.lastReviewedAt).toLocaleDateString('sq-AL'))}</span>
          </div>
        ` : ''}

        ${previous || next ? `
          <nav class="ck-document-pagination" aria-label="Navigimi mes mësimeve">
            ${previous ? `
              <button type="button" class="ck-document-page" data-topic-jump="${esc(previous._id)}">
                <span>← Mësimi i kaluar</span>
                <strong>${esc(codedTitle(previous))}</strong>
              </button>
            ` : '<span></span>'}
            ${next ? `
              <button type="button" class="ck-document-page ck-document-page-next" data-topic-jump="${esc(next._id)}">
                <span>Mësimi tjetër →</span>
                <strong>${esc(codedTitle(next))}</strong>
              </button>
            ` : '<span></span>'}
          </nav>
        ` : ''}
      </div>`;

    bindDetailNavigation(detail);
  }

  function medicalSectionLabel(section) {
    const labels = {
      overview:'Përmbledhje',
      assessment:'Vlerësim',
      diagnosis:'Diagnozë',
      treatment:'Trajtim',
      procedure:'Procedurë',
      prescription:'Recetë',
      emergency:'Urgjencë',
      referral:'Referim',
      followup:'Ndjekje',
      reference:'Referencë',
    };
    return labels[clean(section?.sectionType).toLowerCase()] || 'Seksion';
  }

  function renderMedicalTopicDetail(item) {
    const detail = $('#learningDetail');
    if (!detail) return;
    updateBookChrome(item);

    const review = reviewMeta(item.reviewStatus);
    const procedures = procedureEntries(item);
    const sections = (item.sections || []).filter(Boolean);
    const navigationItems = readerNavigationItems().filter(candidate => !isChapter(candidate));
    const currentIndex = navigationItems.findIndex(candidate => candidate._id === item._id);
    const previous = currentIndex > 0 ? navigationItems[currentIndex - 1] : null;
    const next = currentIndex >= 0 && currentIndex < navigationItems.length - 1 ? navigationItems[currentIndex + 1] : null;

    detail.innerHTML = `
      <div class="ck-document-inner ck-modern-document">
        <header class="ck-detail-head">
          <div class="ck-detail-title-row">
            <div>
              <p class="ck-kicker">${esc(item.chapter?.title || item.question || 'Temë klinike')}</p>
              <h2>${esc(codedTitle(item))}</h2>
            </div>
            <span class="ck-review-badge ${review.className}">
              <span class="ck-review-dot" aria-hidden="true"></span>
              <strong>${esc(review.label)}</strong>
            </span>
          </div>
          <div class="ck-meta">
            ${(item.icdCodes || []).map(icdChip).join('')}
            ${procedures.map(procedureChip).join('')}
            ${item.version ? chip(item.version) : ''}
            ${item.reviewedBy ? chip(item.reviewedBy) : ''}
          </div>
          ${item.summary ? `<div class="ck-quick-summary"><span>Në 20 sekonda</span><p>${esc(item.summary)}</p></div>` : ''}
        </header>

        ${sourcePanelMarkup(item)}

        ${sections.length > 1 ? `
          <nav class="ck-section-index" aria-label="Përmbajtja e kësaj teme">
            <div class="ck-section-index-head"><span>Në këtë temë</span><small>${sections.length} seksione</small></div>
            <div class="ck-section-index-list">
              ${sections.map((section, index) => `
                <button type="button" data-hub-section="medical-section-${safeAnchor(section._key || section.title, String(index + 1))}">
                  <span>${String(index + 1).padStart(2, '0')}</span>
                  <strong>${esc(section.title || medicalSectionLabel(section))}</strong>
                </button>
              `).join('')}
            </div>
          </nav>
        ` : ''}

        <div class="ck-sections ck-modern-sections">
          ${sections.map((section, index) => {
            const id = `medical-section-${safeAnchor(section._key || section.title, String(index + 1))}`;
            const content = medicalContentMarkup(section.content || []);
            return `
              <section class="ck-section ck-modern-section" id="${esc(id)}">
                <div class="ck-modern-section-heading">
                  <span class="ck-modern-section-number">${String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <small>${esc(medicalSectionLabel(section))}</small>
                    <h3>${esc(section.title || medicalSectionLabel(section))}</h3>
                  </div>
                </div>
                ${section.summary ? `<p class="ck-modern-section-summary">${esc(section.summary)}</p>` : ''}
                <div class="ck-modern-content">${content || '<p class="ck-status">Ky seksion është gati për t’u plotësuar në Studio.</p>'}</div>
                ${sourceLocatorMarkup(section.sourceLocator)}
              </section>`;
          }).join('') || `
            <section class="ck-section ck-modern-empty-section">
              <div class="ck-section-heading"><span>Autorim</span><h3>Tema është gati për përmbajtje</h3></div>
              <p class="ck-summary">Shto seksionet në Sanity Studio duke ndjekur rendin e librit burimor.</p>
            </section>`}

          ${item.sources?.length ? `
            <section class="ck-section" id="hub-sources">
              <div class="ck-section-heading"><span>Burime</span><h3>Referencat shtesë</h3></div>
              <div class="ck-source-list">
                ${item.sources.map(source => `
                  <article class="ck-source-card">
                    <div><strong>${esc(source.title || source.organization || 'Burim')}</strong>${source.organization ? `<span>${esc(source.organization)}</span>` : ''}</div>
                    ${source.note ? `<p>${esc(source.note)}</p>` : ''}
                    ${safeHref(source.url) ? `<a href="${esc(safeHref(source.url))}" target="_blank" rel="noopener noreferrer">Hap burimin ↗</a>` : ''}
                  </article>
                `).join('')}
              </div>
            </section>` : ''}
        </div>

        ${previous || next ? `
          <nav class="ck-document-pagination" aria-label="Navigimi mes temave">
            ${previous ? `<button type="button" class="ck-document-page" data-topic-jump="${esc(previous._id)}"><span>← Tema e kaluar</span><strong>${esc(codedTitle(previous))}</strong></button>` : '<span></span>'}
            ${next ? `<button type="button" class="ck-document-page ck-document-page-next" data-topic-jump="${esc(next._id)}"><span>Tema tjetër →</span><strong>${esc(codedTitle(next))}</strong></button>` : '<span></span>'}
          </nav>` : ''}
      </div>`;

    bindDetailNavigation(detail);
  }

  function renderTopicDetail(item) {
    if (isMedicalTopic(item)) renderMedicalTopicDetail(item);
    else if (isChapter(item)) renderChapterDetail(item);
    else renderLessonDetail(item);
  }

  function renderEmptyState() {
    const detail = $('#learningDetail');
    if (!detail) return;
    const term = clean(state.term);
    const hasFilter = Boolean(term || state.category);

    detail.innerHTML = `
      <div class="ck-empty">
        <strong>${hasFilter ? 'Asnjë temë nuk u gjet.' : 'Nuk ka tema të disponueshme.'}</strong>
        <span>${hasFilter ? 'Ndrysho filtrat ose pastro kërkimin.' : 'Përmbajtja e Medical Hub do të shfaqet këtu.'}</span>
        ${hasFilter ? '<button class="ck-retry" type="button" data-clear-hub-filters>Pastro filtrat</button>' : ''}
      </div>`;

    detail.querySelector('[data-clear-hub-filters]')?.addEventListener('click', () => clearFilters());
  }

  async function ensureTopicDetail(id) {
    if (!id) return null;
    if (detailCache.has(id)) return detailCache.get(id);
    if (detailRequests.has(id)) return detailRequests.get(id);

    const request = hubApi({ id }, { timeout:12000 })
      .then(payload => {
        const item = payload?.item || null;
        if (item) detailCache.set(id, item);
        return item;
      })
      .finally(() => detailRequests.delete(id));

    detailRequests.set(id, request);
    return request;
  }

  async function renderSelectedDetail() {
    const id = state.selectedId;
    const detail = $('#learningDetail');
    if (!detail) return;

    if (!id) {
      renderEmptyState();
      return;
    }

    if (detailCache.has(id)) {
      renderTopicDetail(detailCache.get(id));
      return;
    }

    const indexItem = state.items.find(item => item._id === id);
    detail.innerHTML = `
      <div class="ck-empty ck-loading">
        <span class="ck-loading-spinner" aria-hidden="true"></span>
        <strong>${esc(indexItem?.title || 'Po ngarkohet tema…')}</strong>
        <span>Po merret përmbajtja nga burimi i publikuar.</span>
      </div>`;

    try {
      const item = await ensureTopicDetail(id);
      if (state.selectedId !== id) return;
      if (!item) {
        renderEmptyState();
        return;
      }
      renderTopicDetail(item);
    } catch (error) {
      console.error('[Medical Hub v2] Detail:', error);
      if (state.selectedId !== id) return;
      detail.innerHTML = `
        <div class="ck-empty">
          <strong>Tema nuk u ngarkua.</strong>
          <span>Provo përsëri pa humbur filtrat.</span>
          <button class="ck-retry" type="button" data-topic-retry>Provo përsëri</button>
        </div>`;
      detail.querySelector('[data-topic-retry]')?.addEventListener('click', () => {
        detailCache.delete(id);
        void renderSelectedDetail();
      });
    }
  }

  function railChapterTitle(item) {
    return clean(item?.title || item?.question || 'Kapitull').replace(/^\s*kapitulli\s+\d+\s*[—:-]?\s*/i, '').replace(/^\d+\s*[—:-]\s*/, '');
  }

  function browseChapter(key) {
    const normalizedKey = /^\d{1,2}$/.test(String(key || '')) ? String(Number(key)).padStart(2, '0') : '';
    state.term = '';
    state.backendResults = null;
    state.searching = false;
    state.preSearchCategory = '';
    state.category = normalizedKey;
    const input = $('#learningSearch');
    const category = $('#learningCategory');
    if (input) input.value = '';
    if (category) category.value = normalizedKey;
    const preferred = normalizedKey
      ? preferredChapterItem(normalizedKey)
      : state.items.find(isChapter) || state.items[0];
    state.selectedId = preferred?._id || state.items.find(item => chapterKey(item) === normalizedKey)?._id || '';
    applyFilters({ push:true });
    closeNavigationDrawer({ restoreFocus:false });
    requestAnimationFrame(scrollReaderToTop);
  }

  function renderChapterRail() {
    const list = $('#learningChapterList');
    if (!list) return;
    const chapters = state.items.filter(isChapter).sort((a, b) => topicOrder(a) - topicOrder(b));
    const selected = currentItem() || state.filtered.find(item => item._id === state.selectedId);
    const activeKey = chapterKey(selected) || state.category;
    const count = $('#hubChapterRailCount');
    if (count) count.textContent = String(chapters.length);

    list.innerHTML = chapters.map(chapter => {
      const key = chapterKey(chapter);
      const lessonCount = Number(chapter.childCount) || chapterLessons(key).length;
      const active = key === activeKey;
      return `
        <button type="button" class="hub-rail-row hub-chapter-row${active ? ' is-active' : ''}" data-chapter-key="${esc(key)}"${active ? ' aria-current="true"' : ''}>
          <span class="hub-rail-number">${esc(key || '—')}</span>
          <span class="hub-rail-copy">
            <strong>${esc(railChapterTitle(chapter))}</strong>
            <small>${lessonCount === 1 ? '1 temë' : `${lessonCount} tema`}</small>
          </span>
          <span class="hub-rail-action" aria-hidden="true">Hap</span>
        </button>`;
    }).join('') || '<p class="hub-rail-empty">Nuk ka kapituj të publikuar.</p>';

    list.querySelectorAll('[data-chapter-key]').forEach(button => {
      button.addEventListener('click', () => browseChapter(button.dataset.chapterKey));
    });
  }

  function topicRailItems() {
    if (clean(state.term)) return state.filtered.filter(item => !isChapter(item));
    const key = state.category || chapterKey(currentItem());
    if (!key) return state.filtered;
    const chapter = state.items.find(item => isChapter(item) && chapterKey(item) === key);
    const lessons = chapterLessons(key);
    if (lessons.length === 1) return lessons;
    return [chapter, ...lessons].filter(Boolean);
  }

  function renderTopicRail() {
    const list = $('#learningTopicList');
    if (!list) return;
    const items = topicRailItems();
    const term = clean(state.term);
    const chapter = state.items.find(item => isChapter(item) && chapterKey(item) === state.category);
    const kicker = $('#hubTopicRailKicker');
    const heading = $('#hubTopicRailHeading');
    const count = $('#hubTopicRailCount');
    if (kicker) kicker.textContent = term ? 'Kërkim global' : `Kapitulli ${Number(state.category || 0) || '—'}`;
    if (heading) heading.textContent = term ? 'Rezultatet' : (chapter ? railChapterTitle(chapter) : 'Temat');
    if (count) count.textContent = String(items.length);

    list.innerHTML = items.map((item, index) => {
      const active = item._id === state.selectedId;
      const review = reviewMeta(item.reviewStatus);
      const isOverview = isChapter(item);
      const number = isOverview ? 'P' : String(Number(item.lessonNumber || item.order) || index + 1).padStart(2, '0');
      return `
        <button type="button" class="hub-rail-row hub-topic-row${active ? ' is-active' : ''}" data-rail-topic="${esc(item._id)}"${active ? ' aria-current="true"' : ''}>
          <span class="hub-rail-number">${esc(number)}</span>
          <span class="hub-rail-copy">
            <strong>${esc(isOverview ? 'Përmbledhja e kapitullit' : codedTitle(item))}</strong>
            <small>${esc(item.summary || (isOverview ? `${Number(item.childCount) || chapterLessons(chapterKey(item)).length} tema në këtë kapitull` : review.label))}</small>
          </span>
          <span class="hub-mini-review ${review.className}" title="${esc(review.label)}"><i aria-hidden="true"></i><span class="sr-only">${esc(review.label)}</span></span>
        </button>`;
    }).join('') || `<p class="hub-rail-empty">${term ? 'Nuk u gjet asnjë rezultat.' : 'Nuk ka tema të publikuara.'}</p>`;

    list.querySelectorAll('[data-rail-topic]').forEach(button => {
      button.addEventListener('click', () => {
        selectTopic(button.dataset.railTopic, { scroll:true });
        closeNavigationDrawer({ restoreFocus:false });
      });
    });
  }

  function renderNavigationRails() {
    renderChapterRail();
    renderTopicRail();
    const selected = currentItem() || state.filtered.find(item => item._id === state.selectedId);
    const selection = $('#hubNavigationSelection');
    if (selection) selection.textContent = selected ? codedTitle(selected) : 'Kapitujt dhe temat';
    updateBookChrome(selected || state.items[0]);
  }

  function renderList() {
    const select = $('#learningTopic');
    if (!select) {
      renderNavigationRails();
      return;
    }

    const term = clean(state.term);
    const chapter = state.items.find(item => isChapter(item) && chapterKey(item) === state.category);
    let options = '';

    if (!term && chapter) {
      const lessons = state.items
        .filter(item => !isChapter(item) && chapterKey(item) === state.category)
        .sort((a,b) => topicOrder(a) - topicOrder(b));
      if (lessons.length === 1) {
        options = lessons.map(item => `<option value="${esc(item._id)}">${esc(codedTitle(item))}</option>`).join('');
      } else {
        options = `<option value="${esc(chapter._id)}">Përmbledhja e kapitullit · ${esc(codedTitle(chapter))}</option>`
          + lessons.map(item => `<option value="${esc(item._id)}">${esc(codedTitle(item))}</option>`).join('');
      }
    } else {
      const grouped = new Map();
      state.filtered.forEach(item => {
        const key = chapterKey(item) || '00';
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(item);
      });
      options = Array.from(grouped.entries()).map(([key, items]) => {
        const chapterItem = state.items.find(item => isChapter(item) && chapterKey(item) === key);
        const label = chapterItem ? codedTitle(chapterItem) : `Kapitulli ${key}`;
        return `<optgroup label="${esc(label)}">${items.map(item => {
          const prefix = isChapter(item) ? 'Përmbledhja · ' : '';
          return `<option value="${esc(item._id)}">${prefix}${esc(codedTitle(item))}</option>`;
        }).join('')}</optgroup>`;
      }).join('');
    }

    select.innerHTML = options || '<option value="">Asnjë mësim</option>';
    select.value = state.selectedId;
    select.disabled = !options;
    renderNavigationRails();
  }

  function renderReaderNavigation() {
    const navigationItems = readerNavigationItems();
    const index = navigationItems.findIndex(item => item._id === state.selectedId);
    const searchField = $('#learningSearchField');
    const result = $('#learningResultStatus');
    const position = $('#learningTopicPosition');
    const previous = $('#previousTopicButton');
    const next = $('#nextTopicButton');
    const term = clean(state.term);
    const chapterCount = state.items.filter(isChapter).length;
    const lessonCount = state.items.length - chapterCount;

    searchField?.classList.toggle('has-value', Boolean(term));
    searchField?.classList.toggle('is-searching', state.searching);

    if (result) {
      if (state.searching) result.textContent = `Duke kërkuar në gjithë librin për “${term}”…`;
      else if (term) result.textContent = `${state.filtered.length} rezultate në gjithë librin për “${term}”`;
      else if (state.category) {
        const chapter = state.items.find(item => isChapter(item) && chapterKey(item) === state.category);
        const lessonTotal = state.items.filter(item => !isChapter(item) && chapterKey(item) === state.category).length;
        result.textContent = chapter ? `${lessonTotal} mësime në ${chapter.question || chapter.title}` : `${state.filtered.length} rezultate`;
      } else result.textContent = `${chapterCount} kapituj · ${lessonCount} mësime · burimi i publikuar`;
    }

    if (position) {
      if (isChapter(currentItem())) position.textContent = 'Përmbledhje';
      else position.textContent = index >= 0 ? `${index + 1} / ${navigationItems.length}` : `0 / ${navigationItems.length}`;
    }
    if (previous) previous.disabled = index <= 0;
    if (next) next.disabled = index < 0 || index >= navigationItems.length - 1;
  }

  function selectTopic(id, { scroll = false } = {}) {
    if (!id) return;
    const item = state.items.find(candidate => candidate._id === id)
      || state.filtered.find(candidate => candidate._id === id);
    if (!item) return;

    state.selectedId = id;
    const key = chapterKey(item);
    if (key) {
      state.category = key;
      const category = $('#learningCategory');
      if (category) category.value = key;
    }
    applyFilterState();
    renderList();
    renderReaderNavigation();
    syncUrl({ push:true });
    void renderSelectedDetail();
    if (scroll) requestAnimationFrame(scrollReaderToTop);
  }

  function selectAdjacentTopic(delta) {
    const items = readerNavigationItems();
    const index = items.findIndex(item => item._id === state.selectedId);
    const item = items[index + delta];
    if (item) selectTopic(item._id, { scroll:true });
  }

  function applyFilters({ push = false } = {}) {
    applyFilterState();
    renderList();
    renderReaderNavigation();
    syncUrl({ push });
    void renderSelectedDetail();
  }

  async function runBackendSearch(sequence) {
    const term = clean(state.term);
    if (!term) {
      state.backendResults = null;
      state.searching = false;
      applyFilters();
      return;
    }

    state.searching = true;
    renderReaderNavigation();
    try {
      const payload = await hubApi({
        mode:'search',
        q:term,
      }, { timeout:12000 });
      if (sequence !== state.searchSequence) return;
      state.backendResults = Array.isArray(payload.items) ? payload.items : [];
    } catch (error) {
      if (sequence !== state.searchSequence) return;
      console.error('[Medical Hub search]', error);
      state.backendResults = null;
    } finally {
      if (sequence !== state.searchSequence) return;
      state.searching = false;
      applyFilters();
    }
  }

  function scheduleSearch(value) {
    const wasSearching = Boolean(clean(state.term));
    state.term = value || '';
    if (!wasSearching && clean(state.term)) state.preSearchCategory = state.category;
    state.searchSequence += 1;
    const sequence = state.searchSequence;
    window.clearTimeout(searchTimer);
    searchTimer = 0;
    state.backendResults = null;
    state.searching = Boolean(clean(state.term));

    // Show immediate matches from the lightweight backend index while deep search runs.
    applyFilters();
    if (!state.searching) return;

    searchTimer = window.setTimeout(() => {
      searchTimer = 0;
      void runBackendSearch(sequence);
    }, 180);
  }

  function clearSearch({ focus = true } = {}) {
    window.clearTimeout(searchTimer);
    searchTimer = 0;
    state.searchSequence += 1;
    state.term = '';
    state.backendResults = null;
    state.searching = false;
    const selected = state.items.find(item => item._id === state.selectedId)
      || state.filtered.find(item => item._id === state.selectedId);
    state.category = chapterKey(selected) || state.preSearchCategory || state.category;
    state.preSearchCategory = '';
    const input = $('#learningSearch');
    const category = $('#learningCategory');
    if (input) input.value = '';
    if (category) category.value = state.category;
    applyFilters();
    if (focus) input?.focus();
  }

  function clearFilters() {
    window.clearTimeout(searchTimer);
    searchTimer = 0;
    state.searchSequence += 1;
    state.term = '';
    state.backendResults = null;
    state.searching = false;
    const firstChapter = state.items.find(isChapter) || null;
    state.category = '';
    state.selectedId = firstChapter?._id || state.items[0]?._id || '';
    const input = $('#learningSearch');
    const category = $('#learningCategory');
    if (input) input.value = '';
    if (category) category.value = '';
    applyFilters();
    input?.focus();
  }

  async function init() {
    loadSharedSidebarTaxonomy();
    bindShell();

    try {
      const authPayload = await ensureAuth();
      await syncProfileChrome(authPayload);

      const indexPayload = await hubApi({ mode:'index' }, { timeout:15000 });
      state.items = Array.isArray(indexPayload.items) ? indexPayload.items : [];
      state.items.sort((a, b) => topicOrder(a) - topicOrder(b) || clean(a.title).localeCompare(clean(b.title), 'sq'));

      const chapters = state.items.filter(isChapter);
      const category = $('#learningCategory');
      if (category) {
        category.innerHTML = '<option value="">Të gjithë kapitujt</option>'
          + chapters.map(chapter => {
            const number = chapterKey(chapter);
            const title = clean(chapter.title).replace(/^\d+\s*[—-]\s*/, '');
            return `<option value="${number}">Kapitulli ${Number(number)} — ${esc(title)}</option>`;
          }).join('');
      }

      state.category = chapters[0] ? chapterKey(chapters[0]) : '';
      state.selectedId = preferredChapterItem(state.category)?._id || chapters[0]?._id || state.items[0]?._id || '';
      restoreUrl();
      if (category) category.value = state.category;
      applyFilterState();

      $('#learningSearch')?.addEventListener('input', event => scheduleSearch(event.target.value));
      $('#learningSearchClear')?.addEventListener('click', () => clearSearch());
      category?.addEventListener('change', event => {
        browseChapter(event.target.value || '');
      });
      $('#learningTopic')?.addEventListener('change', event => selectTopic(event.target.value));
      $('#previousTopicButton')?.addEventListener('click', () => selectAdjacentTopic(-1));
      $('#nextTopicButton')?.addEventListener('click', () => selectAdjacentTopic(1));
      window.addEventListener('popstate', restoreHistoryState);

      if ($('#syncText')) $('#syncText').textContent = 'Burimi i publikuar';

      renderList();
      renderReaderNavigation();
      syncUrl();
      await renderSelectedDetail();
      $('#appShell')?.setAttribute('aria-busy','false');
    } catch (error) {
      console.error('[Medical Hub v2]', error);
      if ($('#learningResultStatus')) $('#learningResultStatus').textContent = 'Gabim në lidhjen me backend.';
      if ($('#learningTopic')) $('#learningTopic').innerHTML = '<option>Gabim në ngarkim</option>';
      if ($('#learningDetail')) {
        $('#learningDetail').innerHTML = `
          <div class="ck-empty">
            <strong>Medical Hub nuk u ngarkua.</strong>
            <span>Backend-i ose Sanity nuk u përgjigj. Provo përsëri pa humbur sesionin.</span>
            <button class="ck-retry" type="button" data-hub-retry>Provo përsëri</button>
          </div>`;
        $('#learningDetail').querySelector('[data-hub-retry]')?.addEventListener('click', () => window.location.reload());
      }
      $('#appShell')?.setAttribute('aria-busy','false');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
