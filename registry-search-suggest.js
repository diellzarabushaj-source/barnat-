(() => {
  'use strict';

  // Fast, whole-registry autocomplete for the shared drug search box.
  // Local rows give an almost-immediate first paint; the existing bounded
  // /api/drug-search endpoint then enriches the same panel from the full
  // registry. Fuzzy rescue is identity-only and runs only after an exact remote
  // search returns nothing, so clinical prose is never guessed.

  const ROOT = document.documentElement;
  if (ROOT.dataset.miPage !== 'barnat') return;

  const INSTANCE = '__medindexRegistrySuggest';
  if (window[INSTANCE]) return;
  window[INSTANCE] = { version:'registry-search-suggest-v2' };

  const FIELD = Object.freeze({
    name:'Emri tregtar',
    substance:'Substanca aktive',
    atc:'ATC Code',
    use:'Përdorimi (fjalë kyçe)',
    form:'Forma farmaceutike',
    strength:'Fortësia',
  });

  const GROUPS = Object.freeze([
    { key:'name', label:'BARNA' },
    { key:'substance', label:'SUBSTANCA' },
    { key:'atc', label:'ATC' },
    { key:'use', label:'INDIKACIONE' },
  ]);

  const PER_GROUP = 4;
  const MAX_ITEMS = 12;
  const MIN_CHARS = 2;
  const DEBOUNCE_MS = 36;
  const REMOTE_CACHE_LIMIT = 64;
  const API = '/api/drug-search';
  const NON_ASCII = /[^\x00-\x7F]/;
  const ATC_LIKE = /^[a-z]\d{1,2}[a-z0-9]{0,5}$/i;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  })[character]);

  const normalize = value => {
    const text = String(value ?? '');
    if (!text) return '';
    const folded = NON_ASCII.test(text)
      ? text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sq')
      : text.toLowerCase();
    return folded.replace(/[^a-z0-9%+./-]+/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const rows = () => (Array.isArray(window.MEDINDEX_REGISTRY_ROWS) ? window.MEDINDEX_REGISTRY_ROWS : []);

  const state = {
    terms:null, prose:null, open:false, active:-1, items:[], query:'',
    remoteCache:new Map(), requestSeq:0, controller:null,
  };
  let elements = null;
  let timer = 0;

  function rememberRemote(key, value) {
    state.remoteCache.delete(key);
    state.remoteCache.set(key, value);
    while (state.remoteCache.size > REMOTE_CACHE_LIMIT) {
      const oldest = state.remoteCache.keys().next().value;
      if (oldest == null) break;
      state.remoteCache.delete(oldest);
    }
    return value;
  }

  function readRemote(key) {
    if (!state.remoteCache.has(key)) return null;
    const value = state.remoteCache.get(key);
    state.remoteCache.delete(key);
    state.remoteCache.set(key, value);
    return value;
  }

  function abortRemote() {
    state.controller?.abort?.();
    state.controller = null;
    state.requestSeq += 1;
  }

  function buildTerms() {
    if (state.terms) return state.terms;
    const collect = field => {
      const seen = new Map();
      rows().forEach(row => {
        const value = clean(row[field]);
        if (!value) return;
        const key = normalize(value);
        if (key && !seen.has(key)) seen.set(key, value);
      });
      return [...seen].map(([folded, value]) => ({ folded, value }));
    };
    state.terms = {
      name:collect(FIELD.name),
      substance:collect(FIELD.substance),
      atc:atcTerms(),
    };
    return state.terms;
  }

  function atcTerms() {
    const groups = window.MEDINDEX_ATC_GROUPS || {};
    const subgroups = window.MEDINDEX_ATC_SUBGROUPS || {};
    const present = new Set();
    rows().forEach(row => {
      const code = clean(row[FIELD.atc]).toUpperCase().replace(/\s+/g, '');
      if (!/^[A-Z]\d{2}/.test(code)) return;
      present.add(code.slice(0, 1));
      present.add(code.slice(0, 3));
    });
    return [...present].sort().map(code => {
      const label = clean(code.length === 1 ? groups[code] : subgroups[code]);
      return { folded:normalize(`${code} ${label}`), value:code, label };
    });
  }

  function buildProse() {
    if (state.prose) return state.prose;
    state.prose = rows().map(row => ({
      row,
      name:clean(row[FIELD.name]),
      folded:normalize(row[FIELD.use]),
      source:clean(row[FIELD.use]),
    })).filter(item => item.folded);
    return state.prose;
  }

  function pick(list, needle) {
    const starts = [];
    const contains = [];
    for (const item of list) {
      if (item.folded.startsWith(needle)) starts.push(item);
      else if (item.folded.includes(needle)) contains.push(item);
      if (starts.length >= PER_GROUP) break;
    }
    return [...starts, ...contains].slice(0, PER_GROUP);
  }

  function snippet(source, folded, needle) {
    const at = folded.indexOf(needle);
    if (at < 0) return '';
    const from = Math.max(0, at - 34);
    const slice = source.slice(from, from + 132);
    const offset = at - from;
    const hit = slice.slice(offset, offset + needle.length);
    const lead = from > 0 ? '…' : '';
    const tail = from + 132 < source.length ? '…' : '';
    if (normalize(hit) !== needle) return `${lead}${escapeHtml(slice.trim())}${tail}`;
    return lead
      + escapeHtml(slice.slice(0, offset).trimStart())
      + `<mark>${escapeHtml(hit)}</mark>`
      + escapeHtml(slice.slice(offset + needle.length))
      + tail;
  }

  function suggest(query) {
    const needle = normalize(query);
    if (needle.length < MIN_CHARS) return [];
    const terms = buildTerms();
    const out = [];

    pick(terms.name, needle).forEach(item => out.push({ group:'name', term:item.value, primary:item.value }));
    pick(terms.substance, needle).forEach(item => out.push({ group:'substance', term:item.value, primary:item.value }));
    pick(terms.atc, needle).forEach(item => out.push({
      group:'atc', term:item.value, primary:item.value, secondary:item.label,
    }));

    const seen = new Set();
    for (const item of buildProse()) {
      if (out.filter(entry => entry.group === 'use').length >= PER_GROUP) break;
      if (!item.folded.includes(needle) || seen.has(item.name)) continue;
      if (normalize(item.name).includes(needle)) continue;
      seen.add(item.name);
      out.push({
        group:'use', term:item.name, primary:item.name,
        snippet:snippet(item.source, item.folded, needle),
      });
    }
    return out;
  }

  function itemKey(item) {
    return `${item.group}|${normalize(item.term || item.primary)}`;
  }

  function mergeSuggestions(localItems, remoteItems) {
    const grouped = new Map(GROUPS.map(group => [group.key, []]));
    const seen = new Set();
    for (const item of [...localItems, ...remoteItems]) {
      if (!grouped.has(item.group)) continue;
      const key = itemKey(item);
      const bucket = grouped.get(item.group);
      if (!key || seen.has(key) || bucket.length >= PER_GROUP) continue;
      seen.add(key);
      bucket.push(item);
    }
    return GROUPS.flatMap(group => grouped.get(group.key)).slice(0, MAX_ITEMS);
  }

  function directSuggestionFromResult(result, query) {
    const needle = normalize(query);
    const name = clean(result?.tradeName);
    const substance = clean(result?.substance);
    const atc = clean(result?.atc).toUpperCase();
    const use = clean(result?.use);
    const form = clean(result?.form);
    const strength = clean(result?.strength);
    const foldedName = normalize(name);
    const foldedSubstance = normalize(substance);
    const foldedAtc = normalize(atc);
    const foldedUse = normalize(use);

    if (name && foldedName.includes(needle)) {
      return {
        group:'name', term:name, primary:name,
        secondary:[substance, strength, form].filter(Boolean).join(' · '),
      };
    }
    if (substance && foldedSubstance.includes(needle)) {
      return {
        group:'substance', term:substance, primary:substance,
        secondary:name && normalize(name) !== foldedSubstance ? name : '',
      };
    }
    if (atc && foldedAtc.includes(needle)) {
      return { group:'atc', term:atc, primary:atc, secondary:[substance, name].filter(Boolean).join(' · ') };
    }
    if (use && foldedUse.includes(needle)) {
      return {
        group:'use', term:name || substance, primary:name || substance,
        secondary:substance && name ? substance : '',
        snippet:snippet(use, foldedUse, needle),
      };
    }
    return null;
  }

  function editDistance(left, right, ceiling = 3) {
    const a = normalize(left);
    const b = normalize(right);
    if (a === b) return 0;
    if (!a || !b) return Math.max(a.length, b.length);
    if (Math.abs(a.length - b.length) > ceiling) return ceiling + 1;

    let prevPrev = null;
    let prev = Array.from({ length:b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      const row = [i];
      let rowMin = row[0];
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let value = Math.min(
          prev[j] + 1,
          row[j - 1] + 1,
          prev[j - 1] + cost,
        );
        if (prevPrev && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          value = Math.min(value, prevPrev[j - 2] + 1);
        }
        row[j] = value;
        rowMin = Math.min(rowMin, value);
      }
      if (rowMin > ceiling) return ceiling + 1;
      prevPrev = prev;
      prev = row;
    }
    return prev[b.length];
  }

  function fuzzyThreshold(query) {
    const length = normalize(query).replace(/\s+/g, '').length;
    if (length < 4) return 0;
    if (length <= 6) return 1;
    return 2;
  }

  function fuzzyAnchor(query) {
    const token = normalize(query).split(' ').find(part => part.length >= 2) || '';
    if (token.length < 2) return '';
    return token.slice(0, token.length >= 7 ? 3 : 2);
  }

  function fuzzySuggestions(results, query) {
    const needle = normalize(query);
    const threshold = fuzzyThreshold(needle);
    if (!threshold || ATC_LIKE.test(needle.replace(/\s+/g, ''))) return [];
    const scored = [];
    for (const result of Array.isArray(results) ? results : []) {
      const name = clean(result?.tradeName);
      const substance = clean(result?.substance);
      const nameDistance = name ? editDistance(needle, name, threshold) : threshold + 1;
      const substanceDistance = substance ? editDistance(needle, substance, threshold) : threshold + 1;
      const distance = Math.min(nameDistance, substanceDistance);
      if (distance > threshold) continue;
      const substanceWins = substanceDistance < nameDistance;
      const primary = substanceWins ? substance : name;
      const term = primary;
      if (!term) continue;
      scored.push({
        distance,
        item:{
          group:substanceWins ? 'substance' : 'name',
          term,
          primary,
          secondary:`Përputhje e përafërt${substanceWins && name ? ` · ${name}` : substance ? ` · ${substance}` : ''}`,
          fuzzy:true,
        },
      });
    }
    return scored
      .sort((a, b) => a.distance - b.distance || a.item.primary.localeCompare(b.item.primary, 'sq'))
      .slice(0, PER_GROUP)
      .map(entry => entry.item);
  }

  async function apiResults(query, signal) {
    const key = normalize(query);
    const cached = readRemote(key);
    if (cached) return cached;
    const response = await fetch(`${API}?q=${encodeURIComponent(clean(query))}`, {
      credentials:'same-origin', cache:'no-store', signal,
      headers:{ Accept:'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const results = payload?.ok && Array.isArray(payload.results) ? payload.results : [];
    return rememberRemote(key, results);
  }

  async function fetchRemoteSuggestions(query, signal) {
    const directResults = await apiResults(query, signal);
    const direct = directResults.map(result => directSuggestionFromResult(result, query)).filter(Boolean);
    if (direct.length || normalize(query).length < 4 || ATC_LIKE.test(normalize(query).replace(/\s+/g, ''))) {
      return direct;
    }

    const anchor = fuzzyAnchor(query);
    if (!anchor || normalize(anchor) === normalize(query)) return [];
    const rescueResults = await apiResults(anchor, signal);
    return fuzzySuggestions(rescueResults, query);
  }

  async function enrichFromRemote(query, localItems, seq, signal) {
    try {
      const remoteItems = await fetchRemoteSuggestions(query, signal);
      if (seq !== state.requestSeq || signal.aborted || normalize(state.query) !== normalize(query)) return;
      const merged = mergeSuggestions(localItems, remoteItems);
      if (merged.length) render(merged, query);
      else close();
    } catch (error) {
      if (error?.name === 'AbortError' || seq !== state.requestSeq) return;
      if (!localItems.length) close();
    }
  }

  function render(items, query) {
    if (!items.length) return close();
    state.items = items;
    state.active = -1;

    let html = '';
    let current = '';
    items.forEach((item, index) => {
      if (item.group !== current) {
        current = item.group;
        const label = GROUPS.find(group => group.key === current)?.label || '';
        html += `<li class="rss-head" role="presentation">${escapeHtml(label)}</li>`;
      }
      html += `<li role="option" id="rss-opt-${index}" aria-selected="false" class="rss-item" data-rss-index="${index}">
        <span class="rss-primary">${item.fuzzy ? escapeHtml(item.primary) : mark(item.primary, query)}</span>
        ${item.secondary ? `<span class="rss-secondary">${escapeHtml(item.secondary)}</span>` : ''}
        ${item.snippet ? `<span class="rss-snippet">${item.snippet}</span>` : ''}
      </li>`;
    });

    elements.list.innerHTML = html;
    place();
    elements.panel.hidden = false;
    state.open = true;
    elements.input.setAttribute('aria-expanded', 'true');
    window.addEventListener('scroll', close, { once:true, passive:true });
    window.addEventListener('resize', close, { once:true, passive:true });
  }

  function mark(value, query) {
    const needle = normalize(query);
    const folded = normalize(value);
    const at = folded.indexOf(needle);
    if (at < 0 || !needle) return escapeHtml(value);
    const hit = value.slice(at, at + needle.length);
    if (normalize(hit) !== needle) return escapeHtml(value);
    return escapeHtml(value.slice(0, at))
      + `<mark>${escapeHtml(hit)}</mark>`
      + escapeHtml(value.slice(at + needle.length));
  }

  function place() {
    const box = elements.input.getBoundingClientRect();
    const panel = elements.panel.style;
    panel.top = `${Math.round(box.bottom + 6)}px`;
    panel.left = `${Math.round(box.left)}px`;
    panel.width = `${Math.round(box.width)}px`;
  }

  function close() {
    if (!elements) return;
    elements.panel.hidden = true;
    state.open = false;
    state.items = [];
    state.active = -1;
    elements.input.setAttribute('aria-expanded', 'false');
    elements.input.removeAttribute('aria-activedescendant');
  }

  function highlight(next) {
    const options = [...elements.list.querySelectorAll('[data-rss-index]')];
    if (!options.length) return;
    state.active = (next + options.length) % options.length;
    options.forEach(option => option.setAttribute('aria-selected', 'false'));
    const active = options[state.active];
    active.setAttribute('aria-selected', 'true');
    active.scrollIntoView({ block:'nearest' });
    elements.input.setAttribute('aria-activedescendant', active.id);
  }

  function choose(index) {
    const item = state.items[index];
    if (!item) return;
    elements.input.value = item.term;
    abortRemote();
    close();
    elements.input.dispatchEvent(new Event('input', { bubbles:true }));
    elements.input.dispatchEvent(new Event('change', { bubbles:true }));
    elements.input.focus();
  }

  function mount() {
    const input = document.getElementById('search');
    if (!input || elements) return false;

    const panel = document.createElement('div');
    panel.className = 'rss-panel';
    panel.id = 'registrySearchSuggest';
    panel.hidden = true;
    panel.innerHTML = '<ul class="rss-list" role="listbox" aria-label="Sugjerime kërkimi"></ul>';
    document.body.appendChild(panel);

    elements = { input, panel, list:panel.querySelector('.rss-list') };
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', 'registrySearchSuggest');

    input.addEventListener('input', () => {
      state.query = input.value;
      clearTimeout(timer);
      abortRemote();
      const queuedSeq = state.requestSeq;
      timer = setTimeout(() => {
        const query = state.query;
        if (normalize(query).length < MIN_CHARS) return close();

        const localItems = suggest(query);
        if (localItems.length) render(localItems, query);
        else close();

        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const signal = controller?.signal || { aborted:false };
        state.controller = controller;
        const seq = queuedSeq;
        void enrichFromRemote(query, localItems, seq, signal);
      }, DEBOUNCE_MS);
    });

    input.addEventListener('keydown', event => {
      if (!state.open) return;
      if (event.key === 'ArrowDown') { event.preventDefault(); highlight(state.active + 1); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); highlight(state.active - 1); }
      else if (event.key === 'Enter' && state.active >= 0) { event.preventDefault(); choose(state.active); }
      else if (event.key === 'Escape') { abortRemote(); close(); }
    });

    input.addEventListener('blur', () => setTimeout(close, 140));

    panel.addEventListener('mousedown', event => {
      const option = event.target.closest('[data-rss-index]');
      if (!option) return;
      event.preventDefault();
      choose(Number(option.dataset.rssIndex));
    });

    window.addEventListener('medindex:registry-rendered', () => {
      state.terms = null;
      state.prose = null;
    });
    window.addEventListener('medindex:registry-ready', () => {
      state.terms = null;
      state.prose = null;
    });

    return true;
  }

  let attemptsLeft = 40;
  function start() {
    if (!mount() && attemptsLeft-- > 0) setTimeout(start, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();

  window.MedIndexRegistrySuggest = Object.freeze({
    close,
    clearRemoteCache() { state.remoteCache.clear(); },
    _test:{
      normalize, suggest:query => suggest(query), snippet, buildTerms, atcTerms,
      mergeSuggestions, directSuggestionFromResult, editDistance, fuzzyThreshold,
      fuzzyAnchor, fuzzySuggestions, remoteCacheSize:() => state.remoteCache.size,
    },
  });
})();
