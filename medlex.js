/* DRX MedLex — searchable, image-backed terminology cards. No remote AI calls. */
(() => {
  'use strict';

  const DATA_URL = '/data/medlex-terms.json';
  const ANATOMY_ARTWORK_VERSION = '20261104-clinical-v2';
  const ANATOMY_DATA_URL = '/data/medlex-anatomy.json?v=' + ANATOMY_ARTWORK_VERSION;
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
  const state = { terms:[], groups:[], category:'01', topic:'all', query:'', view:'grid', selected:null, authenticated:false };

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
    const name = String(term.image || '').replace(/\.png$/i,'.webp');
    if (term.category === '02') return /^(?:or|ab|th|up|lo|he|ne|ba|pe)\d{2}\.webp$/.test(name) ? ANATOMY_IMAGE_BASE + name + '?v=' + ANATOMY_ARTWORK_VERSION : '';
    return /^\d{2}-[a-z-]+\.webp$/.test(name) ? IMAGE_BASE + name : '';
  }

  function topicsForCategory() {
    if (state.category === '02') return [{id:'all',label:'Të gjitha',ids:[]},...state.groups.map(group => ({id:group.id,label:group.label,ids:[]}))];
    return state.category === '01' ? TOPICS : [{id:'all',label:'Të gjitha',ids:[]}];
  }

  function updateCategoryHeading() {
    const details = {
      '01':['01 / TERMINOLOGJI KLINIKE','Konceptet themelore','Fillimi, origjina, natyra, përgjigjja ndaj trajtimit dhe përhapja e sëmundjes.'],
      '02':['02 / ANATOMI DHE ORIENTIM','Regjionet e trupit','Orientimi anatomik, 9 regjionet e abdomenit, kuadrantet klinike, toraksi, gjymtyrët, koka, qafa dhe pelvisi.'],
      'all':['DRX MEDLEX / 01 + 02','Fjalori i përbashkët','Të gjithë termat klinikë dhe anatomikë në një kërkim të vetëm.']
    }[state.category];
    $('medlexCollectionEyebrow').textContent = details[0];
    $('medlexCollectionTitle').textContent = details[1];
    $('medlexCollectionDescription').textContent = details[2];
    const number = state.category === 'all' ? state.terms.length : state.terms.filter(term => term.category === state.category).length;
    $('medlexTotal').textContent = String(number);
    document.querySelectorAll('.medlex-category').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.category === state.category)));
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
    open.addEventListener('click', () => openTerm(term));

    const art = create('span', 'medlex-art');
    const img = document.createElement('img');
    img.src = imagePath(term);
    img.alt = `Ilustrim edukativ: ${term.term}`;
    img.width = 1254;
    img.height = 1254;
    img.decoding = 'async';
    img.loading = index < 4 ? 'eager' : 'lazy';
    art.append(img);

    const body = create('span', 'medlex-card-body');
    const marker = create('span', 'medlex-card-index');
    marker.append(create('span', '', `TERM / ${String(term.id).padStart(2,'0')}`));
    marker.append(create('span', '', term.category));
    body.append(marker);
    body.append(create('span', 'medlex-card-title', term.term));
    body.append(create('span', 'medlex-card-description', term.definition));
    open.append(art, body);

    const footer = create('div', 'medlex-card-footer');
    footer.append(create('span', '', term.latin || term.english || ALIASES[term.id]?.[0] || 'Termin klinik'));
    const action = create('button', '', 'Shiko ↗');
    action.type = 'button';
    action.setAttribute('aria-label', `Shiko ${term.term} në madhësi të plotë`);
    action.addEventListener('click', () => openTerm(term));
    footer.append(action);
    article.append(open, footer);
    return article;
  }

  function render() {
    const topic = topicsForCategory().find(item => item.id === state.topic) || {id:'all',ids:[]};
    const query = normalize(state.query);
    const matches = state.terms
      .filter(term => (state.category === 'all' || term.category === state.category) &&
        (topic.id === 'all' || (term.category === '02' ? term.group === topic.id : topic.ids.includes(term.id))))
      .map(term => ({ term, score:rank(term, query) }))
      .filter(item => item.score > 0)
      .sort((a,b) => query ? b.score - a.score || String(a.term.id).localeCompare(String(b.term.id)) :
        a.term.category.localeCompare(b.term.category) || String(a.term.id).localeCompare(String(b.term.id),undefined,{numeric:true}));

    const grid = $('medlexGridItems');
    grid.dataset.view = state.view;
    const fragment = document.createDocumentFragment();
    matches.forEach(({term}, index) => fragment.append(card(term, index)));
    grid.replaceChildren(fragment);
    $('medlexEmpty').hidden = matches.length !== 0 || !state.terms.length;
    const available = state.terms.filter(term => state.category === 'all' || term.category === state.category).length;
    setStatus(`${matches.length} nga ${available} terma${query ? ` · Kërkim: “${state.query.trim()}”` : ''}`);
    $('medlexClear').hidden = !state.query;
    $('medlexReset').hidden = state.topic === 'all' && !state.query;
    document.querySelectorAll('.medlex-topic').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.topic === state.topic)));
    $('medlexGrid').setAttribute('aria-pressed', String(state.view === 'grid'));
    $('medlexList').setAttribute('aria-pressed', String(state.view === 'list'));
    $('medlexGrid').classList.toggle('is-selected', state.view === 'grid');
    $('medlexList').classList.toggle('is-selected', state.view === 'list');
  }

  function reset() {
    state.query = '';
    state.topic = 'all';
    $('medlexSearch').value = '';
    render();
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
    state.selected = term;
    $('medlexDialogTitle').textContent = term.term;
    $('medlexDialogCategory').textContent = `DRX MEDLEX · KATEGORIA ${term.category}`;
    $('medlexDialogLatin').textContent = term.latin ? `Latinisht: ${term.latin}` : '';
    $('medlexDialogEnglish').textContent = term.english ? `Anglisht: ${term.english}` : (ALIASES[term.id]?.[0] || '');
    $('medlexDialogDefinition').textContent = term.definition;
    $('medlexDialogExample').textContent = term.example;
    $('medlexDialogImage').src = imagePath(term);
    $('medlexDialogImage').alt = `Kartela DRX MedLex për termin ${term.term}`;
    $('medlexDownload').href = imagePath(term);
    $('medlexDownload').download = `DRX-MedLex-${term.category}-${String(term.id).padStart(2,'0')}-${normalize(term.term).replace(/ /g,'-')}.webp`;
    $('medlexCopy').textContent = 'Kopjo termin';
    if (!dialog.open) dialog.showModal();
  }

  function configureActions() {
    document.querySelectorAll('.medlex-category').forEach(button => button.addEventListener('click', () => {
      state.category = button.dataset.category;
      state.topic = 'all';
      drawTopics();
      updateCategoryHeading();
      render();
      try { history.replaceState(null,'',state.category === 'all' ? '/medlex.html' : `/medlex.html?category=${state.category}`); } catch {}
    }));
    $('medlexSearch').addEventListener('input', event => {
      state.query = event.target.value;
      // The search field covers all categories; topic chips remain category-scoped.
      if (state.query.trim() && state.category !== 'all') {
        state.category = 'all';
        state.topic = 'all';
        drawTopics();
        updateCategoryHeading();
      }
      render();
    });
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
        await navigator.clipboard.writeText(`${state.selected.term}${state.selected.latin ? ` (${state.selected.latin})` : ''} — ${state.selected.definition}`);
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
    // The shared sidebar controller owns mobile opening/closing and focus trapping.
    $('logoutButton')?.addEventListener('click', logout);
  }

  async function loadTerms() {
    const [response, anatomyResponse] = await Promise.all([DATA_URL,ANATOMY_DATA_URL].map(url => fetch(url, {credentials:'same-origin',cache:'force-cache'})));
    if (!response.ok || !anatomyResponse.ok) throw new Error(`Fjalori nuk u ngarkua (${response.status}/${anatomyResponse.status}).`);
    const [data,anatomy] = await Promise.all([response.json(),anatomyResponse.json()]);
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
    state.terms = [...terms,...anatomyTerms];
    $('medlexHeroCount').textContent = String(state.terms.length);
    const selected = new URLSearchParams(location.search).get('category');
    state.category = ['01','02','all'].includes(selected) ? selected : '01';
    drawTopics();
    updateCategoryHeading();
    render();
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
