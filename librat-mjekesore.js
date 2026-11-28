(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const collator = new Intl.Collator('sq', { numeric:true, sensitivity:'base', ignorePunctuation:true });
  const number = new Intl.NumberFormat('sq');
  const PAGE_SIZE = 24;
  const ASSET_CDN = 'https://cdn.sanity.io/';
  const PDF_BASE = ASSET_CDN + 'files/4wdtp8cz/production/';
  const COVER_BASE = ASSET_CDN + 'images/4wdtp8cz/production/';
  const filterParams = { collection:'koleksioni', subject:'lenda', year:'viti' };
  const state = { folder:null, query:'', collection:'', subject:'', year:'', sort:'asc', view:'grid', limit:PAGE_SIZE };
  const rootFolders = [
    ['Viti i parë', 'study'],
    ['Viti i dytë', 'study'],
    ['Viti i tretë', 'study'],
    ['Praktika klinike', 'stethoscope'],
    ['Diskutime klinike dhe referenca për repartin (SGD, CPC, CCP)', 'clinical'],
    ['Reanimimi (BLS, ACLS dhe PALS)', 'activity'],
    ['Provimet përmbledhëse dhe të licencimit (PLE, Revalida)', 'clipboard'],
    ['Teknika provimi dhe pyetje me alternativa', 'layers'],
  ];
  const folderStyles = new Map(rootFolders.map(([title, symbol], order) => [title, { symbol, order }]));
  const iconPaths = {
    filters:'<path d="M4 7h16M7 12h10m-7 5h4"/><circle cx="8" cy="7" r="1.5" fill="currentColor"/><circle cx="15" cy="12" r="1.5" fill="currentColor"/>',
    grid:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    list:'<path d="M9 6h11M9 12h11M9 18h11M4 6h1m-1 6h1m-1 6h1"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    external:'<path d="M13 5h6v6m0-6-9 9m7-1v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5"/>',
    folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    next:'<path d="m9 6 6 6-6 6"/>',
    book:'<path d="M6 4h12v16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm-2 13a2 2 0 0 1 2-2h12M8 8h6"/>',
    file:'<path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9Zm0 0v7h7M8 14h8m-8 3h5"/>',
    study:'<path d="m2 10 10-5 10 5-10 5-10-5Zm4 2v5c3 2.5 9 2.5 12 0v-5m4-2v5"/>',
    stethoscope:'<path d="M5 4H3v5a5 5 0 0 0 10 0V4h-2m-3 10v3a4 4 0 0 0 8 0v-2"/><circle cx="18.5" cy="12.5" r="2.5"/>',
    clinical:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3m-4 4v6m-3-3h6"/>',
    activity:'<path d="M2 12h5l3-6 4 12 3-6h5"/>',
    clipboard:'<path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2m-8 9 2.5 2.5L16 11"/><rect x="8" y="3" width="8" height="4" rx="1.5"/>',
    layers:'<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 4 9 5 9-5"/>',
  };
  const icon = name => '<svg class="books-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + iconPaths[name] + '</svg>';
  const normalize = value => value.normalize('NFD').replace(/\p{M}/gu, '')
    .toLocaleLowerCase('sq').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  let rootId;
  let items;
  let byId;
  let children;
  let collections;
  let years;
  let subjectScope;
  const scopes = new Map();

  function create(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function glyph(name, className) {
    const element = create('span', className);
    element.innerHTML = icon(name);
    return element;
  }

  function catalogUrl(folder, browsing) {
    const url = new URL(location.href);
    const settings = {
      dosja:folder, q:state.query.trim(),
      koleksioni:browsing ? state.collection : '', lenda:browsing ? state.subject : '',
      viti:state.year, renditja:state.sort === 'asc' ? '' : state.sort,
      pamja:state.view === 'grid' ? '' : state.view,
    };
    for (const [key, value] of Object.entries(settings)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    return url.pathname + url.search + url.hash;
  }

  function folderTrail(id) {
    const trail = [];
    let folder = byId.get(id);
    while (folder) {
      trail.unshift(folder);
      folder = byId.get(folder.parent);
    }
    return trail;
  }

  function readLocation() {
    const params = new URLSearchParams(location.search);
    const id = params.get('dosja');
    const kind = byId.get(id)?.kind;
    state.folder = kind === 'folder' || kind === 'folder-link' ? id : null;
    state.query = params.get('q') || '';
    const collection = params.get(filterParams.collection);
    state.collection = !state.folder && collections.some(folder => folder.id === collection) ? collection : '';
    state.subject = params.get(filterParams.subject) || '';
    const year = params.get(filterParams.year);
    state.year = year === 'unknown' || years.includes(year) ? year : '';
    const sort = params.get('renditja');
    state.sort = ['desc', 'newest', 'oldest'].includes(sort) ? sort : 'asc';
    state.view = params.get('pamja') === 'list' ? 'list' : 'grid';
    $('booksSearch').value = state.query;
    state.limit = PAGE_SIZE;
  }

  function folderAnchor(id, className) {
    const link = create('a', className);
    link.href = catalogUrl(id, false);
    link.dataset.booksFolder = id || '';
    return link;
  }

  function pdfAnchor(url, className) {
    const link = create('a', className);
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  }

  function countLabel(count, singular, plural) {
    return number.format(count) + ' ' + (count === 1 ? singular : plural);
  }

  function indexCatalog(data) {
    rootId = data.rootId;
    items = data.items;
    byId = new Map(items.map(entry => [entry.id, entry]));
    children = new Map([[rootId, []]]);
    scopes.clear();
    subjectScope = undefined;
    for (const entry of items) {
      if (!children.has(entry.parent)) children.set(entry.parent, []);
      children.get(entry.parent).push(entry);
      const trail = folderTrail(entry.parent);
      entry.folderLabel = trail.map(folder => folder.title).join(' / ');
      entry.search = normalize(entry.title + ' ' + entry.folderLabel);
      if (entry.kind === 'book') {
        entry.year = [...entry.title.matchAll(/\b(?:19|20)\d{2}\b/g)].at(-1)?.[0] || '';
      }
    }
    collections = (children.get(rootId) || []).filter(item => item.kind === 'folder').sort(compareRootFolders);
    years = [...new Set(items.filter(item => item.year).map(item => item.year))].sort().reverse();
    fillSelect('booksCollection', 'Të gjitha koleksionet', collections.map(folder => [folder.id, folder.title]));
    fillSelect('booksYear', 'Të gjitha vitet', [...years.map(year => [year, year]), ['unknown', 'Pa vit në titull']]);
  }

  function folderTarget(id) {
    return byId.get(id)?.targetFolder || id;
  }

  function getScope(id) {
    id = folderTarget(id);
    if (scopes.has(id)) return scopes.get(id);
    const folders = new Set();
    const books = new Set();
    function visit(folderId) {
      if (folders.has(folderId)) return;
      folders.add(folderId);
      for (const item of children.get(folderId) || []) {
        if (item.kind === 'book') books.add(item);
        else visit(item.targetFolder || item.id);
      }
    }
    visit(id);
    const scope = { folders, books:[...books] };
    scopes.set(id, scope);
    return scope;
  }

  function fillSelect(id, placeholder, options) {
    const select = $(id);
    const fragment = document.createDocumentFragment();
    for (const [value, label] of [['', placeholder], ...options]) {
      const option = create('option', '', label);
      option.value = value;
      fragment.append(option);
    }
    select.replaceChildren(fragment);
  }

  function renderFilters(context) {
    const subject = $('booksSubject');
    if (subjectScope !== context) {
      const subjects = [...getScope(context).folders].map(id => byId.get(id))
        .filter(folder => folder && folder.id !== context && (context !== rootId || folder.parent !== rootId))
        .sort((a, b) => collator.compare(a.title, b.title) || collator.compare(a.folderLabel, b.folderLabel));
      const duplicate = new Set(subjects.filter((folder, i) => subjects[i - 1]?.title === folder.title
        || subjects[i + 1]?.title === folder.title).map(folder => folder.title));
      fillSelect('booksSubject', 'Të gjitha lëndët', subjects.map(folder => [
        folder.id, duplicate.has(folder.title) ? folder.title + ' · ' + folder.folderLabel : folder.title,
      ]));
      subject.disabled = subjects.length === 0;
      subjectScope = context;
    }
    subject.value = state.subject;
    if (subject.selectedIndex < 0) subject.value = state.subject = '';
    const collection = $('booksCollection');
    $('booksCollectionField').hidden = Boolean(state.folder);
    collection.value = state.collection;
    $('booksYear').value = state.year;

    const fields = { collection, subject, year:$('booksYear') };
    const chips = Object.entries(fields).filter(([key]) => state[key]).map(([key, field]) => {
      const item = create('li');
      const label = field.selectedOptions[0].textContent;
      const button = create('button', '', label);
      button.type = 'button';
      button.dataset.clearFilter = key;
      button.setAttribute('aria-label', 'Hiq filtrin ' + label);
      button.append(glyph('close'));
      item.append(button);
      return item;
    });
    $('booksFilterChips').replaceChildren(...chips);
    $('booksFilterChips').hidden = chips.length === 0;
    $('booksFilterCount').textContent = number.format(chips.length);
    $('booksFilterCount').hidden = chips.length === 0;
    $('booksResetFilters').disabled = chips.length === 0;
  }

  function breadcrumb() {
    const nav = $('booksBreadcrumb');
    const list = nav.querySelector('ol');
    list.replaceChildren();
    nav.hidden = !state.folder;
    if (nav.hidden) return;

    const root = create('li');
    const rootLink = folderAnchor(null);
    rootLink.textContent = 'Të gjitha dosjet';
    root.append(rootLink);
    list.append(root);
    const trail = folderTrail(state.folder);
    trail.forEach((folder, index) => {
      const item = create('li');
      const current = index === trail.length - 1;
      const label = current ? create('span', '', folder.title) : folderAnchor(folder.id);
      label.textContent = folder.title;
      if (current) label.setAttribute('aria-current', 'page');
      item.append(glyph('next', 'books-crumb-divider'), label);
      list.append(item);
    });
  }

  function renderFolder(folder) {
    const card = folderAnchor(folder.id, 'books-folder-card');
    const style = folderStyles.get(folder.title);
    card.dataset.slot = 'card';

    const label = create('div', 'books-folder-label');
    label.dataset.slot = 'card-header';
    const title = create('strong', '', folder.title);
    title.dataset.slot = 'card-title';
    const count = getScope(folder.id).books.length;
    const description = create('span', '', countLabel(count, 'libër', 'libra'));
    description.dataset.slot = 'card-description';
    label.append(title, description);
    card.append(glyph(style?.symbol || 'folder', 'books-folder-icon'), label, glyph('next', 'books-folder-arrow'));
    const item = create('li');
    item.append(card);
    return item;
  }

  function renderBook(book, showPath) {
    const item = create('li');
    const link = pdfAnchor(PDF_BASE + book.pdf + '.pdf', 'books-book-row');
    const cover = glyph('file', 'books-book-cover');
    const image = create('img');
    image.alt = '';
    image.width = 160;
    image.height = 208;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.fetchPriority = 'low';
    image.addEventListener('error', () => image.remove(), { once:true });
    cover.append(image);
    image.src = COVER_BASE + book.cover + '?fm=webp';

    const text = create('span', 'books-book-copy');
    text.append(create('strong', 'books-book-title', book.title));
    const metadata = [showPath && book.folderLabel, book.year].filter(Boolean).join(' · ');
    if (metadata) text.append(create('small', 'books-book-path', metadata));
    link.title = book.title;

    const action = create('span', 'books-book-action');
    action.append(create('span', 'books-book-action-label', 'Hap PDF-në'), glyph('external'));
    action.setAttribute('aria-hidden', 'true');
    link.setAttribute('aria-label', book.title + ' (hap PDF-në në skedë të re)');
    link.append(cover, text, action);
    item.append(link);
    return item;
  }

  function compareRootFolders(a, b) {
    const aOrder = folderStyles.get(a.title)?.order ?? rootFolders.length;
    const bOrder = folderStyles.get(b.title)?.order ?? rootFolders.length;
    return aOrder - bOrder || collator.compare(a.title, b.title);
  }

  function renderFolders(folders, searchingFolders) {
    $('booksFolders').hidden = folders.length === 0;
    $('booksFolderHeading').textContent = searchingFolders ? 'Dosjet e gjetura' : state.folder ? 'Nëndosjet' : 'Dosjet';
    $('booksFolderCount').textContent = countLabel(folders.length, 'dosje', 'dosje');
    $('booksFolderGrid').replaceChildren(...folders.map(renderFolder));
  }

  function renderEmpty(searching, filtering, hasFolders) {
    $('booksEmptyTitle').textContent = 'Nuk u gjet asnjë libër';
    $('booksEmptyMessage').textContent = filtering ? 'Hiq një filtër për të zgjeruar rezultatet.'
      : searching && hasFolders ? 'Kontrollo edhe dosjet që përputhen me kërkimin.'
      : searching ? 'Provo një titull më të shkurtër ose një fjalë tjetër.'
      : 'Shfleto dosjet e tjera nga shtegu më sipër.';
  }

  function renderBooks(books, searching, filtering, hasFolders) {
    const scope = byId.get(state.subject || state.folder || state.collection);
    const heading = searching || state.year ? 'Rezultatet' : 'Të gjithë librat';
    $('booksResultsHeading').textContent = scope ? heading + ' · ' + scope.title : heading;
    const list = $('booksList');
    list.dataset.view = state.view;
    document.querySelectorAll('.books-views [data-view]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.view === state.view));
    });
    const visible = books.slice(0, state.limit);
    const currentFolder = folderTarget(state.folder);
    list.replaceChildren(...visible.map(book => renderBook(book, book.parent !== currentFolder)));
    list.hidden = visible.length === 0;
    $('booksResultsCount').textContent = visible.length < books.length
      ? number.format(visible.length) + ' nga ' + countLabel(books.length, 'libër', 'libra')
      : countLabel(books.length, 'libër', 'libra');
    $('booksEmpty').hidden = books.length > 0;
    if (!books.length) renderEmpty(searching, filtering, hasFolders);
    const remaining = books.length - visible.length;
    $('booksPagination').hidden = remaining === 0;
    $('booksMore').textContent = 'Shfaq edhe ' + countLabel(Math.min(remaining, PAGE_SIZE), 'libër', 'libra');
  }

  function compareBooks(a, b) {
    if (state.sort === 'oldest' || state.sort === 'newest') {
      if (!a.year || !b.year) {
        if (a.year !== b.year) return a.year ? -1 : 1;
      } else {
        const diff = Number(a.year) - Number(b.year);
        if (diff) return state.sort === 'oldest' ? diff : -diff;
      }
    }
    return (state.sort === 'desc' ? -1 : 1) * collator.compare(a.title, b.title);
  }

  function render() {
    const context = state.folder || state.collection || rootId;
    renderFilters(context);
    const tokens = normalize(state.query).split(' ').filter(Boolean);
    const searching = tokens.length > 0;
    const filtering = Boolean(state.collection || state.subject || state.year);
    const match = item => tokens.every(token => item.search.includes(token));
    const direct = children.get(folderTarget(state.folder || rootId)) || [];
    const searchingFolders = searching && !state.folder && !filtering;
    let folders = direct.filter(item => item.kind !== 'book');
    if (!state.folder && filtering) folders = [];
    else if (searchingFolders) folders = items.filter(item => item.kind !== 'book' && match(item));
    folders.sort(searchingFolders || state.folder ? (a, b) => collator.compare(a.title, b.title) : compareRootFolders);
    const candidates = getScope(state.subject || context).books;
    const books = candidates.filter(book => match(book)
      && (!state.year || (book.year || 'unknown') === state.year));
    books.sort(compareBooks);

    breadcrumb();
    const folder = byId.get(state.folder);
    $('booksSearch').placeholder = folder ? 'Kërko në këtë dosje…' : 'Kërko titull ose lëndë…';
    $('booksSearchLabel').textContent = folder ? 'Kërko në dosjen ' + folder.title : 'Kërko sipas titullit ose lëndës';
    $('booksSearchKey').hidden = Boolean(state.query);
    $('booksClear').hidden = !state.query;
    $('booksControls').hidden = books.length === 0;
    $('booksSort').value = state.sort;
    const firstSection = searching || filtering ? $('booksResults') : $('booksFolders');
    const nav = $('booksBreadcrumb');
    if (nav.nextElementSibling !== firstSection) nav.after(firstSection);
    renderFolders(folders, searchingFolders);
    renderBooks(books, searching, filtering, folders.length > 0);
  }

  function changeOptions() {
    state.limit = PAGE_SIZE;
    render();
    history.replaceState(null, '', catalogUrl(state.folder, true));
  }

  function changeQuery() {
    state.query = $('booksSearch').value;
    changeOptions();
  }

  function clearQuery() {
    $('booksSearch').value = '';
    changeQuery();
    $('booksSearch').focus();
  }

  function bindCatalog() {
    $('booksSearch').addEventListener('input', changeQuery);
    $('booksSearch').addEventListener('keydown', event => {
      if (event.key === 'Escape' && state.query) {
        event.preventDefault();
        clearQuery();
      }
    });
    $('booksClear').addEventListener('click', clearQuery);
    $('booksSort').addEventListener('change', event => {
      state.sort = event.target.value;
      changeOptions();
    });
    $('booksFilterToggle').addEventListener('click', event => {
      const panel = $('booksFilterPanel');
      panel.hidden = !panel.hidden;
      event.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
    });
    $('booksFilterPanel').addEventListener('change', event => {
      const key = event.target.dataset.filterKey;
      if (!Object.hasOwn(filterParams, key)) return;
      state[key] = event.target.value;
      if (key === 'collection') state.subject = '';
      changeOptions();
    });
    $('booksResetFilters').addEventListener('click', () => {
      for (const key of Object.keys(filterParams)) state[key] = '';
      changeOptions();
      $('booksFilterToggle').focus();
    });
    $('booksFilterChips').addEventListener('click', event => {
      const button = event.target.closest('[data-clear-filter]');
      if (!button) return;
      const key = button.dataset.clearFilter;
      state[key] = '';
      if (key === 'collection') state.subject = '';
      changeOptions();
      $('booksFilterToggle').focus();
    });
    $('booksControls').addEventListener('click', event => {
      const button = event.target.closest('[data-view]');
      if (!button) return;
      state.view = button.dataset.view;
      $('booksList').dataset.view = state.view;
      $('booksControls').querySelectorAll('[data-view]').forEach(option => {
        option.setAttribute('aria-pressed', String(option === button));
      });
      history.replaceState(null, '', catalogUrl(state.folder, true));
    });
    document.addEventListener('keydown', event => {
      if (event.key !== '/' || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || $('booksToolbar').hidden) return;
      if (event.target.closest?.('input, textarea, select, [contenteditable], [role="dialog"]') || document.querySelector('dialog[open], .sidebar.is-open')) return;
      event.preventDefault();
      $('booksSearch').focus();
    });
    $('booksMore').addEventListener('click', () => {
      const previousLimit = state.limit;
      state.limit += PAGE_SIZE;
      render();
      $('booksList').children[previousLimit]?.querySelector('a')?.focus();
    });
    $('booksCatalog').addEventListener('click', event => {
      const link = event.target.closest('[data-books-folder]');
      if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      history.pushState(null, '', link.href);
      readLocation();
      render();
      const heading = $('booksFolders').hidden || $('booksBreadcrumb').nextElementSibling === $('booksResults')
        ? $('booksResultsHeading') : $('booksFolderHeading');
      heading.focus();
    });
    window.addEventListener('popstate', () => {
      if (!byId) return;
      readLocation();
      render();
    });
  }

  async function loadCatalog() {
    $('booksRetry').hidden = true;
    $('booksStatus').textContent = 'Po ngarkohet katalogu…';
    try {
      const response = await fetch('/data/medical-books.json?v=20261127-sanity', { headers:{ Accept:'application/json' } });
      if (!response.ok) throw new Error('Katalogu nuk u ngarkua.');
      indexCatalog(await response.json());
      readLocation();
      render();
      $('booksTotal').textContent = number.format(items.filter(item => item.kind === 'book').length);
      $('booksFolderTotal').textContent = number.format(items.filter(item => item.kind === 'folder').length);
      $('booksToolbar').hidden = false;
      $('booksStats').hidden = false;
      $('booksCatalog').hidden = false;
      $('booksLoad').hidden = true;
    } catch {
      $('booksStatus').textContent = 'Katalogu nuk u ngarkua. Kontrollo lidhjen dhe provo përsëri.';
      $('booksRetry').hidden = false;
    }
  }

  function bindShell() {
    const sidebar = $('sidebar');
    const backdrop = $('sidebarBackdrop');
    $('menuButton').addEventListener('click', () => {
      sidebar.classList.add('is-open');
      backdrop.hidden = false;
    });
    function close() {
      sidebar.classList.remove('is-open');
      backdrop.hidden = true;
    }
    $('sidebarClose').addEventListener('click', close);
    backdrop.addEventListener('click', close);
  }

  async function init() {
    document.querySelectorAll('[data-books-icon]').forEach(element => {
      element.innerHTML = icon(element.dataset.booksIcon);
    });
    bindShell();
    const session = await window.MEDINDEX_AUTH_READY;
    if (!session?.authenticated) return;
    $('appShell').setAttribute('aria-busy', 'false');
    bindCatalog();
    $('booksRetry').addEventListener('click', loadCatalog);
    await loadCatalog();
  }

  void init();
})();
