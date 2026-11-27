(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const collator = new Intl.Collator('sq', { numeric:true, sensitivity:'base', ignorePunctuation:true });
  const number = new Intl.NumberFormat('sq');
  const PAGE_SIZE = 24;
  const ASSET_CDN = 'https://cdn.sanity.io/';
  const PDF_BASE = ASSET_CDN + 'files/4wdtp8cz/production/';
  const COVER_BASE = ASSET_CDN + 'images/4wdtp8cz/production/';
  const state = { folder:null, query:'', limit:PAGE_SIZE };
  const rootFolders = [
    ['Viti i parë', 'study'],
    ['Viti i dytë', 'study'],
    ['Viti i tretë', 'study'],
    ['Praktika klinike', 'stethoscope', 'teal'],
    ['Diskutime klinike dhe referenca për repartin (SGD, CPC, CCP)', 'clinical', 'blue'],
    ['Reanimimi (BLS, ACLS dhe PALS)', 'activity', 'rose'],
    ['Provimet përmbledhëse dhe të licencimit (PLE, Revalida)', 'clipboard', 'amber'],
    ['Teknika provimi dhe pyetje me alternativa', 'layers', 'amber'],
  ];
  const folderStyles = new Map(rootFolders.map(([title, symbol, tone], order) => [title, { symbol, tone, order }]));
  const iconPaths = {
    search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    external:'<path d="M13 5h6v6m0-6-9 9m7-1v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5"/>',
    folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    next:'<path d="m9 6 6 6-6 6"/>',
    down:'<path d="m6 9 6 6 6-6"/>',
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

  function folderHistory(folder) {
    const url = new URL(location.href);
    if (folder) url.searchParams.set('dosja', folder);
    else url.searchParams.delete('dosja');
    return url.pathname + url.search;
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

  function setFolderFromUrl() {
    const id = new URLSearchParams(location.search).get('dosja');
    state.folder = byId.get(id)?.kind === 'folder' ? id : null;
    state.query = '';
    $('booksSearch').value = '';
    state.limit = PAGE_SIZE;
  }

  function folderAnchor(id, className) {
    const link = create('a', className);
    link.href = folderHistory(id);
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
    for (const entry of items) {
      if (!children.has(entry.parent)) children.set(entry.parent, []);
      children.get(entry.parent).push(entry);
      const trail = folderTrail(entry.parent);
      entry.folderIds = trail.map(folder => folder.id);
      entry.folderLabel = trail.map(folder => folder.title).join(' / ');
      entry.search = normalize(entry.title + ' ' + entry.folderLabel);
    }
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
    const targetId = folder.targetFolder || folder.id;
    const card = folderAnchor(targetId, 'books-folder-card');
    const style = folderStyles.get(folder.title);
    card.dataset.slot = 'card';
    if (style?.tone) card.dataset.tone = style.tone;

    const label = create('div', 'books-folder-label');
    label.dataset.slot = 'card-header';
    const title = create('strong', '', folder.title);
    title.dataset.slot = 'card-title';
    const contents = children.get(targetId) || [];
    const internalBooks = contents.filter(item => item.kind === 'book').length;
    const subfolders = contents.length - internalBooks;
    const contentsLabel = [
      subfolders && countLabel(subfolders, 'nëndosje', 'nëndosje'),
      internalBooks && countLabel(internalBooks, 'libër', 'libra'),
    ].filter(Boolean).join(' · ');
    const description = create('span', '', contentsLabel || 'Dosje');
    description.dataset.slot = 'card-description';

    label.append(title, description);
    const top = create('div', 'books-folder-top');
    top.append(glyph(style?.symbol || 'folder', 'books-folder-icon'), glyph('next', 'books-folder-arrow'));
    card.append(top, label);
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
    image.width = 42;
    image.height = 56;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.fetchPriority = 'low';
    image.addEventListener('error', () => image.remove(), { once:true });
    cover.append(image);
    image.src = COVER_BASE + book.cover + '?fm=webp';

    const text = create('span', 'books-book-copy');
    text.append(create('strong', 'books-book-title', book.title));
    if (showPath && book.folderLabel) text.append(create('small', 'books-book-path', book.folderLabel));

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

  function renderFolders(folders, searching) {
    $('booksFolders').hidden = folders.length === 0;
    $('booksFolderHeading').textContent = searching ? 'Dosjet e gjetura' : state.folder ? 'Nëndosjet' : 'Dosjet';
    $('booksFolderCount').textContent = countLabel(folders.length, 'dosje', 'dosje');
    $('booksFolderGrid').replaceChildren(...folders.map(renderFolder));
  }

  function renderEmpty(searching, hasFolders) {
    let title = hasFolders ? 'Librat janë në nëndosje' : 'Kjo dosje nuk ka libra';
    let message = hasFolders ? 'Zgjidh një nëndosje më sipër.' : 'Mund të kthehesh te dosjet e tjera nga shtegu më sipër.';
    if (searching) {
      title = 'Nuk u gjet asnjë libër';
      message = hasFolders ? 'Shfleto dosjet që përputhen me kërkimin më poshtë.' : 'Provo një titull më të shkurtër ose një fjalë tjetër.';
    }
    $('booksEmptyTitle').textContent = title;
    $('booksEmptyMessage').textContent = message;
  }

  function renderBooks(books, searching, hasFolders) {
    $('booksResultsHeading').textContent = searching ? 'Rezultatet për libra' : state.folder ? 'Librat në këtë dosje' : 'Të gjithë librat';
    const list = $('booksList');
    const visible = books.slice(0, state.limit);
    list.replaceChildren(...visible.map(book => renderBook(book, searching || !state.folder)));
    list.hidden = visible.length === 0;
    $('booksResultsCount').textContent = visible.length < books.length
      ? number.format(visible.length) + ' nga ' + countLabel(books.length, 'libër', 'libra')
      : countLabel(books.length, 'libër', 'libra');
    $('booksEmpty').hidden = books.length > 0;
    if (!books.length) renderEmpty(searching, hasFolders);
    const remaining = books.length - visible.length;
    $('booksPagination').hidden = remaining === 0;
    $('booksMore').textContent = 'Shfaq edhe ' + countLabel(Math.min(remaining, PAGE_SIZE), 'libër', 'libra');
  }

  function render() {
    const tokens = normalize(state.query).split(' ').filter(Boolean);
    const searching = tokens.length > 0;
    const parent = state.folder || rootId;
    const scoped = state.folder
      ? items.filter(item => item.folderIds.includes(state.folder))
      : items;
    const match = item => tokens.every(token => item.search.includes(token));
    const direct = (children.get(parent) || []).filter(item => item.kind !== 'book');
    const folders = searching ? scoped.filter(item => item.kind !== 'book' && match(item)) : direct;
    folders.sort(searching || state.folder ? (a, b) => collator.compare(a.title, b.title) : compareRootFolders);
    const sortDirection = $('booksSort').value === 'desc' ? -1 : 1;
    const books = scoped.filter(item => item.kind === 'book'
      && (searching ? match(item) : !state.folder || item.parent === state.folder));
    books.sort((a, b) => sortDirection * collator.compare(a.title, b.title));

    breadcrumb();
    const folder = byId.get(state.folder);
    $('booksSearch').placeholder = folder ? 'Kërko në këtë dosje…' : 'Kërko titull ose lëndë…';
    $('booksSearchLabel').textContent = folder ? 'Kërko në dosjen ' + folder.title : 'Kërko sipas titullit ose lëndës';
    $('booksSearchKey').hidden = Boolean(state.query);
    $('booksClear').hidden = !state.query;
    $('booksControls').hidden = books.length === 0;
    const firstSection = searching ? $('booksResults') : $('booksFolders');
    const nav = $('booksBreadcrumb');
    if (nav.nextElementSibling !== firstSection) nav.after(firstSection);
    renderFolders(folders, searching);
    renderBooks(books, searching, folders.length > 0);
  }

  function changeQuery() {
    state.query = $('booksSearch').value;
    state.limit = PAGE_SIZE;
    render();
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
    function changeOptions() {
      state.limit = PAGE_SIZE;
      render();
    }
    $('booksSort').addEventListener('change', changeOptions);
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
      setFolderFromUrl();
      render();
      const heading = $('booksFolders').hidden ? $('booksResultsHeading') : $('booksFolderHeading');
      heading.focus();
    });
    window.addEventListener('popstate', () => {
      if (!byId) return;
      setFolderFromUrl();
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
      setFolderFromUrl();
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
