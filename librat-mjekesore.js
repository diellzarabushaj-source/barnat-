(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const collator = new Intl.Collator('sq', { numeric:true, sensitivity:'base', ignorePunctuation:true });
  const number = new Intl.NumberFormat('sq');
  const PAGE_SIZE = 24;
  const state = { folder:null, query:'', limit:PAGE_SIZE };
  const iconPaths = {
    search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    external:'<path d="M13 5h6v6m0-6-9 9m7-1v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5"/>',
    folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    next:'<path d="m9 6 6 6-6 6"/>',
    book:'<path d="M6 4h12v16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm-2 13a2 2 0 0 1 2-2h12M8 8h6"/>',
  };
  const icon = name => '<svg class="books-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + iconPaths[name] + '</svg>';
  const normalize = value => value.normalize('NFD').replace(/\p{M}/gu, '')
    .toLocaleLowerCase('sq').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

  let source;
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

  function driveAnchor(url, className) {
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
    source = data.source;
    items = data.items;
    byId = new Map(items.map(entry => [entry.id, entry]));
    children = new Map([[source.id, []]]);
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
    const external = folder.kind === 'folder-link' && !folder.targetFolder;
    const card = external ? driveAnchor(folder.url, 'books-folder-card') : folderAnchor(targetId, 'books-folder-card');
    card.dataset.slot = 'card';

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
    const description = create('span', '', external ? 'Dosje në Google Drive' : contentsLabel || 'Dosje');
    description.dataset.slot = 'card-description';

    label.append(title, description);
    card.append(glyph('folder', 'books-folder-icon'), label, glyph(external ? 'external' : 'next', 'books-folder-arrow'));
    const item = create('li');
    item.append(card);
    return item;
  }

  function renderBook(book, showPath) {
    const item = create('li');
    const link = driveAnchor(book.url, 'books-book-row');
    const title = create('strong', 'books-book-title', book.title);
    const throughFolder = book.linkMode === 'source-folder';
    const text = create('span', 'books-book-copy');
    text.append(title);
    if (showPath && book.folderLabel) text.append(create('small', 'books-book-path', book.folderLabel));
    const status = book.availability === 'deleted' ? 'Origjinali është fshirë në Drive' : 'Origjinali është i paarritshëm në Drive';
    if (throughFolder) text.append(create('small', 'books-book-path books-link-note', status));

    const action = create('span', 'books-book-action');
    action.append(create('span', '', throughFolder ? 'Shiko burimin' : 'Hap në Drive'), glyph('external'));
    action.setAttribute('aria-hidden', 'true');
    link.setAttribute('aria-label', book.title + (throughFolder
      ? ' (' + status + '. Hap dosjen burimore në skedë të re)'
      : ' (hap librin në Google Drive në skedë të re)'));
    link.append(glyph(throughFolder ? 'folder' : 'book', 'books-book-icon'), text, action);
    item.append(link);
    return item;
  }

  function render() {
    const tokens = normalize(state.query).split(' ').filter(Boolean);
    const searching = tokens.length > 0;
    const parent = state.folder || source.id;
    const scoped = state.folder
      ? items.filter(item => item.folderIds.includes(state.folder))
      : items;
    const match = item => tokens.every(token => item.search.includes(token));
    const direct = (children.get(parent) || []).filter(item => item.kind !== 'book');
    const folders = (searching ? scoped.filter(item => item.kind !== 'book' && match(item)) : direct)
      .sort((a, b) => collator.compare(a.title, b.title));
    const sortDirection = $('booksSort').value === 'desc' ? -1 : 1;
    const books = scoped
      .filter(item => item.kind === 'book' && (searching ? match(item) : !state.folder || item.parent === state.folder))
      .sort((a, b) => sortDirection * collator.compare(a.title, b.title));

    breadcrumb();
    $('booksSource').href = byId.get(state.folder)?.url || source.url;
    $('booksClear').hidden = !state.query;
    $('booksFolders').hidden = folders.length === 0;
    $('booksFolderHeading').textContent = searching ? 'Dosjet e gjetura' : 'Dosjet';
    $('booksFolderGrid').replaceChildren(...folders.map(renderFolder));
    $('booksResultsHeading').textContent = searching ? 'Rezultatet për libra' : state.folder ? 'Librat në këtë dosje' : 'Të gjithë librat';

    const list = $('booksList');
    const visible = books.slice(0, state.limit);
    list.replaceChildren(...visible.map(book => renderBook(book, searching || !state.folder)));
    list.hidden = visible.length === 0;
    $('booksResultsCount').textContent = visible.length < books.length
      ? number.format(visible.length) + ' nga ' + countLabel(books.length, 'libër', 'libra')
      : countLabel(books.length, 'libër', 'libra');
    $('booksEmpty').hidden = books.length > 0;
    $('booksEmpty').textContent = searching
      ? 'Nuk u gjet asnjë libër. Provo një titull ose fjalë tjetër.'
      : 'Shfleto nëndosjet për të parë librat e kësaj lënde.';
    $('booksMore').hidden = visible.length >= books.length;
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
    $('booksSort').addEventListener('change', () => {
      state.limit = PAGE_SIZE;
      render();
    });
    $('booksMore').addEventListener('click', () => {
      const previousLimit = state.limit;
      state.limit += PAGE_SIZE;
      render();
      $('booksList').children[previousLimit]?.querySelector('a').focus();
    });
    $('booksCatalog').addEventListener('click', event => {
      const link = event.target.closest('[data-books-folder]');
      if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      history.pushState(null, '', link.href);
      setFolderFromUrl();
      render();
      $('booksResultsHeading').focus({preventScroll:true});
    });
    window.addEventListener('popstate', () => {
      setFolderFromUrl();
      render();
    });
  }

  async function loadCatalog() {
    $('booksRetry').hidden = true;
    $('booksStatus').textContent = 'Po ngarkohet katalogu…';
    try {
      const response = await fetch('/data/medical-books.json?v=20261125-drive-audit', { headers:{ Accept:'application/json' } });
      if (!response.ok) throw new Error('Katalogu nuk u ngarkua.');
      indexCatalog(await response.json());
      setFolderFromUrl();
      render();
      $('booksTotal').textContent = number.format(items.filter(item => item.kind === 'book').length);
      $('booksFolderTotal').textContent = number.format(items.filter(item => item.kind === 'folder').length);
      $('booksToolbar').hidden = false;
      $('booksStats').hidden = false;
      $('booksCatalog').hidden = false;
      $('booksStatus').hidden = true;
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
