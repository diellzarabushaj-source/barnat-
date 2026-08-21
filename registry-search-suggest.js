(() => {
  'use strict';

  // Categorised autocomplete for the registry search box.
  //
  // One search box drives both the table and the list, so the suggestions live
  // beside the input rather than inside either view. Four kinds, in the order a
  // doctor thinks: a trade name, a substance, an ATC category, or — the case the
  // plain table could never answer — an indication.
  //
  // Every suggestion is a value that already exists in the register. Nothing is
  // generated, summarised or reworded: an indication suggestion carries a
  // verbatim slice of the stored text with the matched run marked.

  const ROOT = document.documentElement;
  if (ROOT.dataset.miPage !== 'barnat') return;

  const INSTANCE = '__medindexRegistrySuggest';
  if (window[INSTANCE]) return;
  window[INSTANCE] = { version:'registry-search-suggest-v1' };

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
  const MIN_CHARS = 2;
  const DEBOUNCE_MS = 130;

  const NON_ASCII = /[^\x00-\x7F]/;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  })[character]);

  // The same folding the list view and the search API use, so all three agree
  // about what "kolle" and "kollë" mean.
  const normalize = value => {
    const text = String(value ?? '');
    if (!text) return '';
    const folded = NON_ASCII.test(text)
      ? text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('sq')
      : text.toLowerCase();
    return folded.replace(/\s+/g, ' ').trim();
  };

  const rows = () => (Array.isArray(window.MEDINDEX_REGISTRY_ROWS) ? window.MEDINDEX_REGISTRY_ROWS : []);

  const state = { terms:null, prose:null, open:false, active:-1, items:[], query:'' };
  let elements = null;
  let timer = 0;

  // --- indexes ---------------------------------------------------------------

  // Distinct values, each remembered with the spelling the register uses so a
  // suggestion is always something that is really in there.
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

  // ATC suggestions are the categories the dataset actually names — the one and
  // three character levels. Deeper codes exist but carry no name here, so they
  // are offered only as the codes the drugs themselves hold.
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

  // The indication text is the longest field in the register; folding it for
  // every row is deferred until someone actually searches.
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

  // --- matching ---------------------------------------------------------------

  // Prefix first, then anything containing it: a doctor typing the start of a
  // name should not have to scroll past a coincidental mid-word match.
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

  // A verbatim slice of the stored sentence, with the matched run marked. The
  // offsets come from the folded copy and are applied to the original, so the
  // extracted run is folded back and checked: if it does not match what was
  // searched for, the highlight is dropped rather than placed on the wrong words.
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

    pick(terms.name, needle).forEach(item => out.push({
      group:'name', term:item.value, primary:item.value,
    }));
    pick(terms.substance, needle).forEach(item => out.push({
      group:'substance', term:item.value, primary:item.value,
    }));
    pick(terms.atc, needle).forEach(item => out.push({
      group:'atc', term:item.value, primary:item.value, secondary:item.label,
    }));

    // Indications: the drugs whose stored indication mentions it, each shown
    // with the sentence that caused the match.
    const seen = new Set();
    for (const item of buildProse()) {
      if (out.filter(entry => entry.group === 'use').length >= PER_GROUP) break;
      if (!item.folded.includes(needle) || seen.has(item.name)) continue;
      // A drug already offered by name is not repeated as an indication.
      if (normalize(item.name).includes(needle)) continue;
      seen.add(item.name);
      out.push({
        group:'use', term:item.name, primary:item.name,
        snippet:snippet(item.source, item.folded, needle),
      });
    }
    return out;
  }

  // --- rendering ---------------------------------------------------------------

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
        <span class="rss-primary">${mark(item.primary, query)}</span>
        ${item.secondary ? `<span class="rss-secondary">${escapeHtml(item.secondary)}</span>` : ''}
        ${item.snippet ? `<span class="rss-snippet">${item.snippet}</span>` : ''}
      </li>`;
    });

    elements.list.innerHTML = html;
    place();
    elements.panel.hidden = false;
    state.open = true;
    elements.input.setAttribute('aria-expanded', 'true');

    // Closing on scroll or resize costs nothing while the panel is shut: the
    // listeners exist only for as long as it is open.
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

  // Choosing a suggestion writes it into the shared search box and lets the page
  // react exactly as it does to typing — the table and the list both already
  // listen for this, so neither needs to know the suggestions exist.
  function choose(index) {
    const item = state.items[index];
    if (!item) return;
    elements.input.value = item.term;
    close();
    elements.input.dispatchEvent(new Event('input', { bubbles:true }));
    elements.input.dispatchEvent(new Event('change', { bubbles:true }));
    elements.input.focus();
  }

  // --- mounting ------------------------------------------------------------------

  function mount() {
    const input = document.getElementById('search');
    if (!input || elements) return false;

    const panel = document.createElement('div');
    panel.className = 'rss-panel';
    panel.id = 'registrySearchSuggest';
    panel.hidden = true;
    panel.innerHTML = '<ul class="rss-list" role="listbox" aria-label="Sugjerime kërkimi"></ul>';
    // The panel is fixed and lives on the body, so it adds nothing to the
    // toolbar's height — which two mobile gates hold to a strict budget.
    document.body.appendChild(panel);

    elements = { input, panel, list:panel.querySelector('.rss-list') };

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', 'registrySearchSuggest');

    // The keystroke handler stays trivial — a timer, nothing more. The work
    // happens after the doctor stops typing, so typing itself is never charged
    // for it.
    input.addEventListener('input', () => {
      state.query = input.value;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const query = state.query;
        if (normalize(query).length < MIN_CHARS) return close();
        render(suggest(query), query);
      }, DEBOUNCE_MS);
    });

    input.addEventListener('keydown', event => {
      if (!state.open) return;
      if (event.key === 'ArrowDown') { event.preventDefault(); highlight(state.active + 1); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); highlight(state.active - 1); }
      else if (event.key === 'Enter' && state.active >= 0) { event.preventDefault(); choose(state.active); }
      else if (event.key === 'Escape') { close(); }
    });

    input.addEventListener('blur', () => setTimeout(close, 140));

    panel.addEventListener('mousedown', event => {
      // Before blur, so the click is not lost to the input losing focus.
      const option = event.target.closest('[data-rss-index]');
      if (!option) return;
      event.preventDefault();
      choose(Number(option.dataset.rssIndex));
    });

    // The register arrives after the page does; drop the indexes so the next
    // search rebuilds them from whatever is now loaded.
    window.addEventListener('medindex:registry-rendered', () => {
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
    _test:{ normalize, suggest:query => suggest(query), snippet, buildTerms, atcTerms },
  });
})();
