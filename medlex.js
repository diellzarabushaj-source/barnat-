/* DRX MedLex — searchable, image-backed terminology cards. No remote AI calls. */
(() => {
  'use strict';

  const DATA_URL = '/data/medlex-terms.json';
  const ANATOMY_ARTWORK_VERSION = '20261104-clinical-v2';
  const ANATOMY_DATA_URL = '/data/medlex-anatomy.json?v=' + ANATOMY_ARTWORK_VERSION;
  const CHAPTER_ARTWORK_VERSION = '20261105-content-03-10-v1';
  const CHAPTERS_URL = '/data/medlex-chapters.json?v=' + CHAPTER_ARTWORK_VERSION;
  const IMAGE_BASE = '/assets/medlex/';
  const ANATOMY_IMAGE_BASE = '/assets/medlex-anatomy/';
  const TOPICS = [
    { id:'all', label:'Të gjitha', ids:[] },
    { id:'time', label:'Kohëzgjatja', ids:[1,2,3] },
    { id:'origin', label:'Origjina', ids:[4,5,6,7,10,11] },
    { id:'nature', label:'Natyra', ids:[8,9] },
    { id:'treatment', label:'Përgjigjja ndaj trajtimit', ids:[12,13] },
    { id:'course', label:'Ecuria', ids:[14,15,16,17] },
    { id:'distribution', label:'Shpërndarja', ids:[18,19,20] }
  ];
  const ALIASES = {
    1:['acute','acutus','i menjëhershëm'],
    2:['subacute','subacutus','nënakut'],
    3:['chronic','chronicus','afatgjatë'],
    4:['idiopathic','idiopathicus','shkak i panjohur'],
    5:['iatrogenic','iatrogenicus','nga trajtimi mjekësor'],
    6:['congenital','congenitus','i lindur'],
    7:['acquired','acquisitus','pas lindjes'],
    8:['benign','benignus','jo kanceroz'],
    9:['malignant','malignus','kanceroz'],
    10:['primary','primarius'],
    11:['secondary','secundarius'],
    12:['refractory','refractarius','i vështirë për trajtim'],
    13:['resistant','resistens','rezistencë'],
    14:['recurrence','recurrent','rikthim'],
    15:['relapse','relapsing','rikthim i aktivitetit'],
    16:['remission','remissio','qetësim i sëmundjes'],
    17:['progressive','progressivus','përkeqësim gradual'],
    18:['localized','localisatus','i kufizuar'],
    19:['diffuse','diffusus','i përhapur'],
    20:['multifocal','multifocalis','shumë vatra']
  };

  const $ = id => document.getElementById(id);
  const state = { terms:[], groups:[], categories:[], category:'01', searchFrom:null, topic:'all', query:'', view:'grid', selected:null, authenticated:false };

  function normalize(value) {
    return String(value || '').toLocaleLowerCase('sq')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/ë/g,'e').replace(/ç/g,'c')
      .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
  }

  function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let previous = Array.from({ length:b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
      const next = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        next[j] = Math.min(next[j-1] + 1, previous[j] + 1, previous[j-1] + (a[i-1] === b[j-1] ? 0 : 1));
        rowMin = Math.min(rowMin, next[j]);
      }
      if (rowMin > max) return max + 1;
      previous = next;
    }
    return previous[b.length];
  }

  function rank(term, query) {
    if (!query) return 1;
    const synonyms = [term.latin, term.english, ...(term.aliases || '').split(','), ...(ALIASES[term.id] || [])].filter(Boolean);
    const names = [term.term, ...synonyms].map(normalize);
    if (names.some(name => name === query)) return 120;
    if (names.some(name => name.startsWith(query))) return 100;
    if (names.some(name => name.includes(query))) return 85;

    const haystack = normalize([term.term, term.definition, term.example, ...synonyms].join(' '));
    const parts = query.split(' ').filter(Boolean);
    if (parts.every(part => haystack.includes(part))) return 60;
    // Typo tolerance applies to actual names, not arbitrary clinical text.
    if (query.length >= 5 && !query.includes(' ')) {
      const allowance = query.length >= 8 ? 2 : 1;
      if (names.some(name => editDistance(name, query, allowance) <= allowance)) return 38;
    }
    return 0;
  }

  function imagePath(term) {
    if (term.status === 'planned') return '';
    if (/^https:\/\/cdn\.sanity\.io\/images\/4wdtp8cz\/production\/[a-z0-9]+-\d+x\d+\.(?:webp|png|jpg|jpeg)$/.test(term.imageUrl || '')) return term.imageUrl + '?auto=format&w=1254&q=95';
    const name = String(term.image || '').replace(/\.png$/i,'.webp');
    if (term.category === '02') return /^(?:or|ab|th|up|lo|he|ne|ba|pe)\d{2}\.webp$/.test(name) ? ANATOMY_IMAGE_BASE + name + '?v=' + ANATOMY_ARTWORK_VERSION : '';
    if (/^(?:0[3-9]|1[0-8])$/.test(term.category)) return new RegExp('^c' + term.category + '-\\d{3}\\.webp$').test(name) ? '/assets/medlex-chapters/' + name + '?v=' + CHAPTER_ARTWORK_VERSION : '';
    return /^\d{2}-[a-z-]+\.webp$/.test(name) ? IMAGE_BASE + name : '';
  }

  function topicsForCategory() {
    if (state.category === '02') return [{id:'all',label:'Të gjitha',ids:[]},...state.groups.map(group => ({id:group.id,label:group.label,ids:[]}))];
    if (state.category === '01') return TOPICS;
    return [{id:'all',label:'Të gjitha',ids:[]},...(state.categories.find(item => item.id === state.category)?.groups || [])];
  }

  function updateCategoryHeading() {
    const chapter = state.categories.find(item => item.id === state.category);
    $('medlexCollectionEyebrow').textContent = chapter ? chapter.id + ' / ' + chapter.title.toLocaleUpperCase('sq') : 'DRX MEDLEX / 18 KAPITUJ';
    $('medlexCollectionTitle').textContent = state.query.trim() ? 'Rezultatet e kërkimit' : chapter?.heading || 'Fjalori i përbashkët';
    $('medlexCollectionDescription').textContent = chapter?.description || 'Kartelat e plotësuara dhe termat e planifikuar nga të 18 kapitujt, në një kërkim të vetëm.';
    const number = state.category === 'all' ? state.terms.length : state.terms.filter(term => term.category === state.category).length;
    $('medlexTotal').textContent = String(number);
    $('medlexCountLabel').textContent = chapter?.status === 'planned' || state.category === 'all' ? 'terma' : 'kartela';
    $('medlexSelectedChapter').textContent = chapter ? chapter.id + ' · ' + chapter.title : 'Të gjithë kapitujt';
    document.querySelectorAll('.medlex-category').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.category === state.category)));
    if (!$('medlexChapterFilter').value) revealSelectedChapter();
  }

  function drawCategories() {
    const host = $('medlexCategories');
    const fragment = document.createDocumentFragment();
    const all = create('button', 'medlex-category medlex-category-all');
    all.type = 'button';
    all.dataset.category = 'all';
    all.append(create('span','medlex-category-number','⌕'),create('span','medlex-category-title','Të gjithë kapitujt'));
    fragment.append(all);
    for (const chapter of state.categories) {
      const count = state.terms.filter(term => term.category === chapter.id).length;
      const button = create('button', 'medlex-category');
      button.type = 'button';
      button.dataset.category = chapter.id;
      button.setAttribute('aria-pressed', String(chapter.id === state.category));
      const copy = create('span', 'medlex-category-title', chapter.title);
      copy.append(create('small', '', count + (chapter.status === 'planned' ? ' terma · Në përgatitje' : ' kartela')));
      button.append(create('span', 'medlex-category-number', chapter.id), copy);
      fragment.append(button);
    }
    host.replaceChildren(fragment);
    filterChapters();
  }

  function filterChapters() {
    const query = normalize($('medlexChapterFilter').value);
    const words = query ? query.split(' ') : [];
    const host = $('medlexCategories');
    let visible = 0;
    for (const button of host.children) {
      const number = button.dataset.category;
      const title = button.lastElementChild.firstChild.textContent;
      const key = normalize(number + ' ' + title);
      button.hidden = !words.every(word => key.includes(word));
      if (!button.hidden) visible++;
    }
    $('medlexChapterEmpty').hidden = visible !== 0;
    host.scrollTop = 0;
    if (!query) revealSelectedChapter();
  }

  function revealSelectedChapter() {
    const host = $('medlexCategories');
    const selected = host.querySelector('[aria-pressed="true"]:not([hidden])');
    if (!selected || !host.clientHeight) return;
    const bounds = host.getBoundingClientRect();
    const row = selected.getBoundingClientRect();
    if (row.bottom > bounds.bottom) host.scrollTop += row.bottom - bounds.bottom + 8;
    else if (row.top < bounds.top) host.scrollTop -= bounds.top - row.top + 8;
  }

  function setStatus(message) { $('medlexStatus').textContent = message; }

  function create(tag, className, textValue) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (textValue !== undefined) element.textContent = textValue;
    return element;
  }

  function card(term, index) {
    const article = create('article', 'medlex-card');
    const open = create('button', 'medlex-card-open');
    open.type = 'button';
    open.setAttribute('aria-label', `Hap kartelën ${term.term}`);
    open.addEventListener('click', () => {
      open.focus({preventScroll:true});
      openTerm(term);
    });

    const art = create('span', 'medlex-art');
    const img = document.createElement('img');
    img.src = imagePath(term);
    img.alt = '';
    img.width = 1254;
    img.height = 1254;
    img.decoding = 'async';
    img.loading = index < 4 ? 'eager' : 'lazy';
    art.append(img);

    const body = create('span', 'medlex-card-body');
    body.append(create('span', 'medlex-card-index', `Kapitulli ${term.category}`));
    body.append(create('span', 'medlex-card-title', term.term));
    body.append(create('span', 'medlex-card-description', term.definition));
    const footer = create('span', 'medlex-card-footer');
    footer.append(create('span', 'medlex-card-translation', term.latin || term.english || ALIASES[term.id]?.[0] || 'Hap kartelën'));
    const arrow = create('span', 'medlex-card-arrow', '↗');
    arrow.setAttribute('aria-hidden','true');
    footer.append(arrow);
    open.append(art, body, footer);
    article.append(open);
    return article;
  }

  function plannedCard(term) {
    const article = create('article', 'medlex-card medlex-planned-card');
    article.dataset.status = 'planned';
    const open = create('button', 'medlex-card-open');
    open.type = 'button';
    open.setAttribute('aria-label', 'Hap vendin e përgatitur për ' + term.term);
    open.addEventListener('click', () => {
      open.focus({preventScroll:true});
      openTerm(term);
    });
    const preview = create('span','medlex-planned-preview');
    preview.append(create('span','medlex-planned-badge','Në përgatitje'),create('span','medlex-card-title',term.term));
    const body = create('span','medlex-card-body');
    const chapter = state.categories.find(item => item.id === term.category);
    body.append(create('span','medlex-card-index',chapter?.groups.find(item => item.id === term.group)?.label || chapter?.title));
    open.append(preview,body);
    article.append(open);
    return article;
  }

  function render() {
    const topic = topicsForCategory().find(item => item.id === state.topic) || {id:'all',ids:[]};
    const query = normalize(state.query);
    const matches = state.terms
      .filter(term => (state.category === 'all' || term.category === state.category) &&
        (topic.id === 'all' || (term.category === '01' ? topic.ids.includes(term.id) : term.group === topic.id)))
      .map(term => ({ term, score:rank(term, query) }))
      .filter(item => item.score > 0)
      .sort((a,b) => query ? b.score - a.score || String(a.term.id).localeCompare(String(b.term.id)) :
        a.term.category.localeCompare(b.term.category) || String(a.term.id).localeCompare(String(b.term.id),undefined,{numeric:true}));

    const grid = $('medlexGridItems');
    grid.dataset.view = state.view;
    const fragment = document.createDocumentFragment();
    const grouped = !query && /^(?:0[3-9]|1[0-8])$/.test(state.category);
    grid.dataset.grouped = String(grouped);
    if (grouped) {
      const groups = topicsForCategory().filter(item => item.id !== 'all' && (state.topic === 'all' || item.id === state.topic));
      let cardIndex = 0;
      for (const group of groups) {
        const terms = matches.filter(item => item.term.group === group.id);
        if (!terms.length) continue;
        const section = create('section','medlex-subchapter');
        section.dataset.subchapter = group.id;
        const heading = create('h3','medlex-subchapter-heading',group.label);
        heading.id = 'medlex-subchapter-' + group.id;
        section.setAttribute('aria-labelledby',heading.id);
        heading.append(create('span','',terms.length + ' kartela'));
        const cards = create('div','medlex-grid medlex-subchapter-cards');
        cards.dataset.view = state.view;
        for (const {term} of terms) cards.append(term.status === 'planned' ? plannedCard(term) : card(term,cardIndex++));
        section.append(heading,cards);
        fragment.append(section);
      }
    } else {
      matches.forEach(({term}, index) => fragment.append(term.status === 'planned' ? plannedCard(term) : card(term, index)));
    }
    grid.replaceChildren(fragment);
    $('medlexEmpty').hidden = matches.length !== 0 || !state.terms.length;
    const available = state.terms.filter(term => state.category === 'all' || term.category === state.category).length;
    const pending = matches.filter(item => item.term.status === 'planned').length;
    setStatus(`${matches.length} nga ${available} terma${pending ? ` · ${pending} në përgatitje` : ''}${query ? ` · Kërkim: “${state.query.trim()}”` : ''}`);
    $('medlexClear').hidden = !state.query;
    $('medlexReset').hidden = state.topic === 'all' && !state.query;
    document.querySelectorAll('.medlex-topic').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.topic === state.topic)));
    $('medlexGrid').setAttribute('aria-pressed', String(state.view === 'grid'));
    $('medlexList').setAttribute('aria-pressed', String(state.view === 'list'));
  }

  function setQuery(value) {
    state.query = value;
    if (value.trim() && state.category !== 'all') {
      state.searchFrom = state.category;
      state.category = 'all';
      state.topic = 'all';
      drawTopics();
    } else if (!value.trim() && state.searchFrom) {
      state.category = state.searchFrom;
      state.searchFrom = null;
      drawTopics();
    }
    updateCategoryHeading();
    render();
  }

  function reset() {
    state.topic = 'all';
    $('medlexSearch').value = '';
    setQuery('');
    $('medlexSearch').focus();
  }

  function drawTopics() {
    const host = $('medlexTopics');
    const fragment = document.createDocumentFragment();
    for (const topic of topicsForCategory()) {
      const button = create('button', 'medlex-topic', topic.label);
      button.type = 'button';
      button.dataset.topic = topic.id;
      button.setAttribute('aria-pressed', String(topic.id === 'all'));
      button.addEventListener('click', () => { state.topic = topic.id; render(); });
      fragment.append(button);
    }
    host.replaceChildren(fragment);
  }

  function openTerm(term) {
    const dialog = $('medlexDialog');
    const planned = term.status === 'planned';
    state.selected = term;
    $('medlexDialogTitle').textContent = term.term;
    $('medlexDialogCategory').textContent = `DRx MedLex · Kapitulli ${term.category}`;
    $('medlexDialogLatin').textContent = term.latin ? `Latinisht: ${term.latin}` : '';
    const english = term.english || ALIASES[term.id]?.[0];
    $('medlexDialogEnglish').textContent = english ? `Anglisht: ${english}` : '';
    $('medlexDialogDefinition').textContent = term.definition || 'Përkufizimi do të plotësohet.';
    $('medlexDialogExample').textContent = term.example || 'Shembulli klinik do të plotësohet.';
    $('medlexDialogImage').hidden = planned;
    $('medlexDialogPlaceholder').hidden = !planned;
    $('medlexDialogPlaceholderTerm').textContent = term.term;
    if (planned) $('medlexDialogImage').removeAttribute('src');
    else $('medlexDialogImage').src = imagePath(term);
    $('medlexDialogImage').alt = `Kartela DRX MedLex për termin ${term.term}`;
    $('medlexDownload').href = imagePath(term);
    $('medlexDownload').hidden = planned;
    $('medlexDownload').download = `DRX-MedLex-${term.category}-${String(term.id).padStart(2,'0')}-${normalize(term.term).replace(/ /g,'-')}.webp`;
    if (imagePath(term).startsWith('https://cdn.sanity.io/')) {
      $('medlexDownload').href = term.imageUrl + '?fm=webp&q=95&dl=' + encodeURIComponent($('medlexDownload').download);
    }
    $('medlexCopy').textContent = 'Kopjo termin';
    if (!dialog.open) {
      dialog.showModal();
      dialog.scrollTop = 0;
    }
  }

  function configureActions() {
    const chapterPicker = $('medlexChapterPicker');
    const wideLayout = window.matchMedia('(min-width:1120px)');
    const chapterFilter = $('medlexChapterFilter');
    const syncPicker = () => { chapterPicker.open = wideLayout.matches; };
    syncPicker();
    wideLayout.addEventListener('change', syncPicker);
    chapterPicker.addEventListener('toggle', () => {
      if (chapterPicker.open) revealSelectedChapter();
    });
    chapterFilter.addEventListener('input', filterChapters);
    chapterFilter.addEventListener('keydown', event => {
      if (event.key === 'Escape' && chapterFilter.value) {
        event.preventDefault();
        chapterFilter.value = '';
        filterChapters();
      }
    });
    $('medlexCategories').addEventListener('click', event => {
      const button = event.target.closest('.medlex-category');
      if (!button || !$('medlexCategories').contains(button)) return;
      state.category = button.dataset.category;
      state.searchFrom = null;
      state.topic = 'all';
      state.query = '';
      $('medlexSearch').value = '';
      drawTopics();
      updateCategoryHeading();
      render();
      if (chapterFilter.value) {
        chapterFilter.value = '';
        filterChapters();
      }
      if (!wideLayout.matches) {
        chapterPicker.open = false;
        chapterPicker.querySelector('summary').focus({preventScroll:true});
      }
      try { history.replaceState(null,'',`/medlex.html?category=${state.category}`); } catch {}
    });
    $('medlexSearch').addEventListener('input', event => setQuery(event.target.value));
    $('medlexSearch').addEventListener('keydown', event => {
      if (event.key === 'Escape' && event.target.value) { event.stopPropagation(); reset(); }
    });
    $('medlexClear').addEventListener('click', reset);
    $('medlexReset').addEventListener('click', reset);
    $('medlexEmptyReset').addEventListener('click', reset);
    for (const view of ['grid','list']) {
      const button = $(view === 'grid' ? 'medlexGrid' : 'medlexList');
      button.addEventListener('click', () => {
        state.view = view;
        try { localStorage.setItem('drx_medlex_view_v1', view); } catch {}
        render();
      });
    }
    $('medlexClose').addEventListener('click', () => $('medlexDialog').close());
    $('medlexDialog').addEventListener('click', event => {
      if (event.target === $('medlexDialog')) event.target.close();
    });
    $('medlexCopy').addEventListener('click', async () => {
      if (!state.selected) return;
      try {
        await navigator.clipboard.writeText(`${state.selected.term}${state.selected.latin ? ` (${state.selected.latin})` : ''}${state.selected.definition ? ' — ' + state.selected.definition : ''}`);
        $('medlexCopy').textContent = 'U kopjua ✓';
      } catch { $('medlexCopy').textContent = 'Kopjimi nuk u lejua'; }
    });
    window.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if ($('medlexDialog').open) $('medlexDialog').close();
        $('medlexSearch').focus();
      }
    });
    try { state.view = localStorage.getItem('drx_medlex_view_v1') === 'list' ? 'list' : 'grid'; }
    catch {}
  }

  async function ensureAuth() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    let response;
    try {
      response = await fetch('/api/auth', { credentials:'same-origin', cache:'no-store', headers:{Accept:'application/json'}, signal:controller.signal });
    } finally { clearTimeout(timeout); }
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403 || (response.ok && payload.authenticated === false)) {
      const destination = new URL('/landing.html', location.origin);
      destination.searchParams.set('return', location.pathname + location.search + location.hash);
      location.replace(destination.pathname + destination.search);
      return null;
    }
    if (!response.ok || payload.authenticated !== true) throw new Error('Sesioni nuk u verifikua. Rifresko faqen dhe provo përsëri.');
    state.authenticated = true;
    return payload;
  }

  async function syncProfile(payload) {
    try {
      const script = document.createElement('script');
      script.src = '/medindex-brand-runtime.js?v=drx-brand-v8-profileguard1';
      await new Promise((resolve,reject) => {
        script.addEventListener('load', resolve, { once:true });
        script.addEventListener('error', reject, { once:true });
        document.head.appendChild(script);
      });
      window.MedIndexProfile?.adoptAccount?.(payload);
      window.dispatchEvent(new CustomEvent('medindex:auth-ready', {detail:payload}));
    } catch { /* A profile enhancement must not block dictionary reading. */ }
  }

  async function logout() {
    const button = $('logoutButton');
    button.disabled = true;
    try {
      const response = await fetch('/api/auth', { method:'DELETE', credentials:'same-origin' });
      if (!response.ok) throw new Error('Dalja nuk u krye.');
      location.replace('/landing.html');
    } catch { button.disabled = false; }
  }

  function sidebarControls() {
    // As on the other workspaces, the page toggles the drawer and the shared
    // controller syncs focus, inert state and Escape.
    const sidebar = $('sidebar');
    const backdrop = $('sidebarBackdrop');
    const close = () => {
      sidebar.classList.remove('is-open');
      backdrop.hidden = true;
    };
    $('menuButton').addEventListener('click', event => {
      if (!$('drxMobileNav')?.contains(document.activeElement)) event.currentTarget.focus({preventScroll:true});
      sidebar.classList.add('is-open');
      backdrop.hidden = false;
    });
    $('sidebarClose').addEventListener('click', close);
    backdrop.addEventListener('click', close);
    $('logoutButton')?.addEventListener('click', logout);
  }

  async function loadTerms() {
    const cms = fetch('/api/medical-hub?_route=medlex', {credentials:'same-origin', cache:'no-store', signal:AbortSignal.timeout(3500)})
      .then(response => response.ok ? response.json() : null).catch(() => null);
    const [response, anatomyResponse, chaptersResponse] = await Promise.all([DATA_URL,ANATOMY_DATA_URL,CHAPTERS_URL].map(url => fetch(url, {credentials:'same-origin',cache:'force-cache'})));
    if (!response.ok || !anatomyResponse.ok || !chaptersResponse.ok) throw new Error('Fjalori nuk u ngarkua. Provo përsëri.');
    const [data,anatomy,localChapters,remote] = await Promise.all([response.json(),anatomyResponse.json(),chaptersResponse.json(),cms]);
    const chapters = remote?.ok && remote.catalog?.categories?.length === 18 ? remote.catalog : localChapters;
    if (!Array.isArray(data.terms)) throw new Error('Struktura e fjalorit nuk është e vlefshme.');
    const terms = data.terms.map(term => ({...term,category:'01'})).filter(term => Number.isInteger(term.id) && term.id >= 1 &&
      typeof term.term === 'string' && typeof term.definition === 'string' &&
      typeof term.example === 'string' && imagePath(term));
    if (terms.length !== data.terms.length || new Set(terms.map(term => term.id)).size !== terms.length) {
      throw new Error('Disa kartela të fjalorit kanë të dhëna të pavlefshme.');
    }
    if (!Array.isArray(anatomy.schema) || !Array.isArray(anatomy.terms) || !Array.isArray(anatomy.groups)) throw new Error('Anatomia nuk ka strukturën e duhur.');
    const anatomyTerms = anatomy.terms.map(values => {
      const term = Object.fromEntries(anatomy.schema.map((field,index) => [field,values[index]]));
      return {...term, category:'02',image:`${term.id}.webp`};
    });
    const unique = new Set();
    for (const term of anatomyTerms) {
      if (typeof term.id !== 'string' || unique.has(term.id) || !anatomy.groups.some(group => group.id === term.group) ||
          !term.term || !term.latin || !term.english || !term.definition || !term.example || !imagePath(term)) {
        throw new Error(`Kartelë anatomike e pavlefshme: ${term.id}`);
      }
      unique.add(term.id);
    }
    state.groups = anatomy.groups;
    if (!Array.isArray(chapters.categories) || chapters.categories.length !== 18 || new Set(chapters.categories.map(item => item.id)).size !== 18) throw new Error('Struktura e kapitujve nuk është e vlefshme.');
    const plannedTerms = chapters.categories.flatMap(chapter => (chapter.terms || []).map(term => ({...term,category:chapter.id})));
    const plannedIds = new Set();
    for (const term of plannedTerms) {
      const chapter = chapters.categories.find(item => item.id === term.category);
      if (!term.term || !chapter.groups.some(group => group.id === term.group) || plannedIds.has(term.id) ||
          !['planned','available'].includes(term.status) || (term.status === 'available' && (!term.definition || !term.example || !imagePath(term)))) throw new Error('Term i paplotë në kapitujt e rinj.');
      plannedIds.add(term.id);
    }
    state.categories = chapters.categories;
    state.terms = [...terms,...anatomyTerms,...plannedTerms];
    $('medlexHeroCount').textContent = String(state.terms.filter(term => term.status !== 'planned').length);
    const selected = new URLSearchParams(location.search).get('category');
    state.category = selected === 'all' || state.categories.some(item => item.id === selected) ? selected : '01';
    state.searchFrom = null;
    drawCategories();
    drawTopics();
    setQuery($('medlexSearch').value);
  }

  async function init() {
    configureActions();
    drawTopics();
    sidebarControls();
    try {
      const account = await ensureAuth();
      if (!account) return;
      $('appShell').setAttribute('aria-busy','false');
      void syncProfile(account);
      await loadTerms();
    } catch (error) {
      $('appShell').setAttribute('aria-busy','false');
      setStatus(error?.message || 'Fjalori nuk mund të ngarkohet.');
      $('medlexEmpty').hidden = false;
      $('medlexEmpty').querySelector('h3').textContent = 'Ngarkimi nuk u krye';
      $('medlexEmpty').querySelector('p').textContent = 'Kontrollo lidhjen dhe rifresko faqen.';
      $('medlexEmptyReset').textContent = 'Riprovo';
      $('medlexEmptyReset').onclick = () => location.reload();
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
    else void init();
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { normalize, editDistance, rank, imagePath, TOPICS, ALIASES };
})();
