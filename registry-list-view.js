(() => {
  'use strict';

  // Registry list view — a second way to read the same registry.
  //
  // The table stays exactly as it is: this adds a sibling surface and a toggle
  // between them. Both read `window.MEDINDEX_REGISTRY_ROWS`, the rows the table
  // already loaded, so nothing is fetched twice and no dataset is duplicated.
  //
  // Two modes, decided by whether the doctor has typed anything:
  //   - empty search → browse the ATC tree, one level at a time;
  //   - any search   → global results across every category, ranked.
  //
  // Clinical text is never rewritten. A snippet is a verbatim slice of the
  // stored indication text with the matched words marked — nothing is generated.

  const ROOT = document.documentElement;
  if (ROOT.dataset.miPage !== 'barnat') return;

  const VIEW_KEY = 'medindex_registry_view_v1';
  const INSTANCE = '__medindexRegistryListView';
  if (window[INSTANCE]) return;
  window[INSTANCE] = { version:'registry-list-view-v1' };

  const FIELD = Object.freeze({
    number:'Nr rendor',
    name:'Emri tregtar',
    substance:'Substanca aktive',
    atc:'ATC Code',
    drugClass:'Klasa / Çka është',
    use:'Përdorimi (fjalë kyçe)',
    strength:'Fortësia',
    form:'Forma farmaceutike',
    manufacturer:'Prodhuesi',
  });

  // Ranked highest first. The order is the answer to "why is this row above that
  // one" — an identity match always outranks a mention inside prose.
  const MATCH_ORDER = Object.freeze([
    { key:'name', field:FIELD.name, exact:1000, prefix:800, contains:600 },
    { key:'substance', field:FIELD.substance, exact:900, prefix:700, contains:520 },
    { key:'atc', field:FIELD.atc, exact:860, prefix:640, contains:300 },
    { key:'form', field:FIELD.form, exact:240, prefix:200, contains:160 },
    { key:'strength', field:FIELD.strength, exact:220, prefix:180, contains:140 },
    { key:'manufacturer', field:FIELD.manufacturer, exact:200, prefix:150, contains:120 },
    // Prose fields. A hit here is a real reason to show the drug, and the only
    // case where the doctor is shown the sentence that caused it.
    { key:'use', field:FIELD.use, exact:120, prefix:100, contains:90, prose:true },
    { key:'drugClass', field:FIELD.drugClass, exact:110, prefix:95, contains:80, prose:true },
  ]);

  const IDENTITY_RULES = MATCH_ORDER.filter(rule => !rule.prose);
  const PROSE_RULES = MATCH_ORDER.filter(rule => rule.prose);

  const MAX_RESULTS = 60;
  // Browsing may legitimately show a lot at once; this only stops a filtered
  // view of the whole register from putting thousands of rows on the page.
  const BROWSE_MAX = 250;
  // A select copes with a long list — the browser gives it type-ahead — so this
  // is generous enough that a real value is never out of reach.
  const OPTION_MAX = 400;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  })[character]);

  const NON_ASCII = /[^\x00-\x7F]/;

  // Same folding the search API uses, so the list and the server agree about
  // what "kolle" and "kollë" mean.
  //
  // Decomposing and re-folding is the most expensive thing done per row, and
  // much of the register - ATC codes, strengths, manufacturers - is plain ASCII
  // with no accent to strip and no locale casing to apply. Those take the cheap
  // path; anything carrying an accent takes the full one.
  const normalize = value => {
    const text = String(value ?? '');
    if (!text) return '';
    const folded = NON_ASCII.test(text)
      ? text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sq')
      : text.toLowerCase();
    return folded.replace(/\s+/g, ' ').trim();
  };

  const state = {
    ready:false,
    index:null,
    proseReady:false,
    tree:null,
    path:[],
    query:'',
    filters:{},
    mounted:false,
  };

  let elements = null;

  // --- data ----------------------------------------------------------------

  const sourceRows = () => (Array.isArray(window.MEDINDEX_REGISTRY_ROWS) ? window.MEDINDEX_REGISTRY_ROWS : []);

  const atcOf = row => clean(row?.[FIELD.atc]).toUpperCase().replace(/\s+/g, '');

  // A code carries its own hierarchy: A / A10 / A10B / A10BJ. Only the first and
  // third levels have names in the dataset, so the deeper ones are shown by code
  // alone rather than given a label the registry never stated.
  function levelsOf(code) {
    const value = atcOf({ [FIELD.atc]:code });
    // A real ATC code opens with a letter and two digits. Anything else — "N/A"
    // and the other placeholders the register carries — is left out of the tree
    // rather than filed under an invented branch.
    if (!/^[A-Z]\d{2}/.test(value)) return [];
    return [1, 3, 4, 5]
      .filter(length => value.length >= length)
      .map(length => value.slice(0, length));
  }

  function labelFor(code) {
    const groups = window.MEDINDEX_ATC_GROUPS || {};
    const subgroups = window.MEDINDEX_ATC_SUBGROUPS || {};
    const named = code.length === 1 ? groups[code] : subgroups[code];
    return clean(named);
  }

  // Built once. 4006 rows folded on every keystroke would show up in the
  // interaction budget, so each row is normalized here and reused.
  function buildIndex() {
    const rows = sourceRows();
    // Keyed on the array itself, not on its length. The desktop registry swaps
    // this array wholesale — a page, then the full register — and there is a
    // moment during that handoff when it is empty. Caching by length meant an
    // index built in that moment stayed cached forever, because 0 === 0 always
    // looked unchanged, and the tree reported an empty register.
    if (state.index && state.indexSource === rows) return state.index;
    state.indexSource = rows;
    state.tree = null;
    state.proseReady = false;
    state.index = rows.map((row, uid) => {
      // The index position is the handle. The register's own "Nr rendor" repeats
      // across the sheet, so it cannot address a row on its own.
      const entry = { row, uid, atc:atcOf(row), fields:{} };
      IDENTITY_RULES.forEach(rule => { entry.fields[rule.key] = normalize(row[rule.field]); });
      return entry;
    });
    return state.index;
  }

  // The indication text is by far the longest field in the register, and folding
  // it for every row costs more than everything else put together. Browsing the
  // tree never reads it, so that cost is deferred until a search is actually run
  // — once, and then reused.
  function ensureProseIndex() {
    if (state.proseReady) return;
    buildIndex().forEach(entry => {
      PROSE_RULES.forEach(rule => { entry.fields[rule.key] = normalize(entry.row[rule.field]); });
    });
    state.proseReady = true;
  }

  function buildTree() {
    if (state.tree) return state.tree;
    const root = new Map();
    buildIndex().forEach(entry => {
      const levels = levelsOf(entry.atc);
      if (!levels.length) return;
      let node = root;
      levels.forEach(code => {
        if (!node.has(code)) node.set(code, { code, count:0, children:new Map(), entries:[] });
        const next = node.get(code);
        next.count += 1;
        node = next.children;
      });
      // The row is filed at its deepest level, so a category lists only the
      // drugs that actually stop there.
      let cursor = root;
      let leaf = null;
      levels.forEach(code => { leaf = cursor.get(code); cursor = leaf.children; });
      if (leaf) leaf.entries.push(entry);
    });
    state.tree = root;
    return root;
  }

  function nodeAt(path) {
    let level = buildTree();
    let node = null;
    for (const code of path) {
      node = level.get(code);
      if (!node) return null;
      level = node.children;
    }
    return node;
  }

  function childrenAt(path) {
    const node = path.length ? nodeAt(path) : null;
    const level = path.length ? node?.children : buildTree();
    return level ? [...level.values()].sort((a, b) => a.code.localeCompare(b.code, 'sq')) : [];
  }

  // Every drug at or beneath a node, in reading order.
  function collectEntries(node) {
    if (!node) return [];
    const out = [...node.entries];
    node.children.forEach(child => out.push(...collectEntries(child)));
    return out.sort((a, b) => clean(a.row[FIELD.name]).localeCompare(clean(b.row[FIELD.name]), 'sq'));
  }

  // Only the first and third ATC levels are named in this dataset; levels four
  // and five exist as codes alone. Drilling through an unlabelled code is a poor
  // way to find a drug, so a named category opens straight to its drugs — unless
  // it holds so many that a flat list stops being readable, in which case the
  // level-4 codes earn their place as a way to cut it down.
  const FLATTEN_MAX = 150;

  function shouldFlatten(node) {
    if (!node) return false;
    if (!node.children.size) return true;
    return node.count <= FLATTEN_MAX;
  }

  // --- search ---------------------------------------------------------------

  function scoreEntry(entry, query) {
    let best = null;
    let score = 0;
    for (const rule of MATCH_ORDER) {
      const value = entry.fields[rule.key];
      if (!value) continue;
      let points = 0;
      if (value === query) points = rule.exact;
      else if (value.startsWith(query)) points = rule.prefix;
      else if (value.includes(query)) points = rule.contains;
      if (!points) continue;
      score += points;
      if (!best) best = rule;
    }
    return score ? { score, rule:best } : null;
  }

  // Every match, best first. The cap is applied by the caller, after filtering —
  // capping first would let a filter search only the top of the list.
  function ranked(query) {
    const needle = normalize(query);
    if (needle.length < 2) return [];
    ensureProseIndex();
    return buildIndex()
      .map(entry => {
        const hit = scoreEntry(entry, needle);
        return hit ? { entry, ...hit } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score
        || clean(a.entry.row[FIELD.name]).localeCompare(clean(b.entry.row[FIELD.name]), 'sq'));
  }

  function search(query) {
    return ranked(query).slice(0, MAX_RESULTS);
  }

  // The sentence around the hit, lifted verbatim. Only the matched run is
  // wrapped; everything else is escaped exactly as stored.
  function snippet(text, needle) {
    const source = clean(text);
    if (!source) return '';
    const folded = normalize(source);
    const at = folded.indexOf(needle);
    if (at < 0) return '';

    const before = source.lastIndexOf('.', at) + 1;
    const afterDot = source.indexOf('.', at + needle.length);
    const start = Math.max(0, before);
    const end = afterDot < 0 ? source.length : afterDot + 1;
    let slice = source.slice(start, end);
    let offset = at - start;
    let trimmedLeft = start > 0;
    let trimmedRight = end < source.length;

    if (slice.length > 190) {
      const from = Math.max(0, offset - 70);
      if (from > 0) trimmedLeft = true;
      if (from + 190 < slice.length) trimmedRight = true;
      slice = slice.slice(from, from + 190);
      offset -= from;
    }

    const head = slice.slice(0, offset);
    const hit = slice.slice(offset, offset + needle.length);
    const tail = slice.slice(offset + needle.length);

    // The offsets above come from the folded copy and are applied to the
    // original. That holds for every precomposed character in the register, but
    // it is an assumption about Unicode rather than a guarantee. If it ever
    // fails, the run under the offsets will not fold back to what was searched
    // for — so check, and drop the highlight rather than mark the wrong words.
    if (normalize(hit) !== needle) {
      return [
        trimmedLeft ? '…' : '',
        escapeHtml(slice.trim()),
        trimmedRight ? '…' : '',
      ].join('');
    }

    return [
      trimmedLeft ? '…' : '',
      escapeHtml(head.trimStart()),
      `<mark>${escapeHtml(hit)}</mark>`,
      escapeHtml(tail.trimEnd()),
      trimmedRight ? '…' : '',
    ].join('');
  }

  function categoryTrail(code) {
    return levelsOf(code)
      .map(level => labelFor(level))
      .filter(Boolean)
      .join(' › ');
  }

  // --- filters -----------------------------------------------------------------

  // The compact filter row. Each one narrows what is already on screen, and its
  // options are read from those very rows — so a filter never offers a value
  // that would empty the list, and the counts stay honest.
  const FILTERS = Object.freeze([
    { key:'substance', field:FIELD.substance, label:'Substanca' },
    { key:'form', field:FIELD.form, label:'Forma' },
    { key:'strength', field:FIELD.strength, label:'Doza' },
    { key:'atc', field:FIELD.atc, label:'ATC' },
    { key:'manufacturer', field:FIELD.manufacturer, label:'Prodhuesi' },
  ]);

  function matchesFilters(entry) {
    return FILTERS.every(filter => {
      const chosen = state.filters[filter.key];
      return !chosen || clean(entry.row[filter.field]) === chosen;
    });
  }

  // Options come from the rows that would show if this one filter were cleared,
  // so opening a filter always shows what is still reachable given the others.
  function optionsFor(filter, pool) {
    const others = FILTERS.filter(other => other.key !== filter.key);
    const counts = new Map();
    pool.forEach(entry => {
      const allowed = others.every(other => {
        const chosen = state.filters[other.key];
        return !chosen || clean(entry.row[other.field]) === chosen;
      });
      if (!allowed) return;
      const value = clean(entry.row[filter.field]);
      if (!value) return;
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    const sorted = [...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'sq'));
    const shown = sorted.slice(0, OPTION_MAX);
    // Whatever is currently chosen always stays in its own list. Without this a
    // value past the cap would keep filtering while appearing unset.
    const chosen = state.filters[filter.key];
    if (chosen && !shown.some(([value]) => value === chosen)) {
      // It may be past the cap, or excluded outright by the other filters. Either
      // way it keeps filtering, so it is shown — with a count of zero when the
      // combination really does match nothing, which is the honest number.
      shown.unshift(sorted.find(([value]) => value === chosen) || [chosen, 0]);
    }
    return shown;
  }

  function renderFilters(pool) {
    if (!elements.filters) return;
    const active = FILTERS.filter(filter => state.filters[filter.key]).length;
    elements.filters.innerHTML = FILTERS.map(filter => {
      const chosen = state.filters[filter.key] || '';
      const options = optionsFor(filter, pool);
      // A filter with nothing to choose between is not a choice; it is noise.
      if (!options.length && !chosen) return '';
      return `<label class="rlv-filter${chosen ? ' is-set' : ''}">
        <span class="rlv-filter-label">${escapeHtml(filter.label)}</span>
        <select data-rlv-filter="${filter.key}" aria-label="${escapeHtml(filter.label)}">
          <option value="">Të gjitha</option>
          ${options.map(([value, count]) => `<option value="${escapeHtml(value)}"${
            value === chosen ? ' selected' : ''
          }>${escapeHtml(value)} (${count})</option>`).join('')}
        </select>
      </label>`;
    }).join('') + (active
      ? '<button type="button" class="rlv-filter-clear" data-rlv-clear-filters>Pastro filtrat</button>'
      : '');
  }

  // --- rendering -------------------------------------------------------------

  // The stored record, in full and unedited. Fields the registry knows about
  // lead, in reading order; anything else the sheet carries follows, so a column
  // added upstream still shows up here instead of being silently dropped.
  const DETAIL_LEAD = Object.freeze([
    FIELD.substance, FIELD.strength, FIELD.form, FIELD.drugClass,
    FIELD.use, FIELD.manufacturer, FIELD.atc,
  ]);

  function detailFields(row) {
    const seen = new Set();
    const ordered = [];
    const push = key => {
      if (seen.has(key) || key.startsWith('__')) return;
      seen.add(key);
      const value = clean(row[key]);
      if (value) ordered.push([key, value]);
    };
    DETAIL_LEAD.forEach(push);
    Object.keys(row || {}).forEach(push);
    return ordered;
  }

  function drugRow(entry, needle, rule) {
    const row = entry.row;
    const meta = [row[FIELD.substance], row[FIELD.strength], row[FIELD.form]]
      .map(clean).filter(Boolean);
    const form = clean(row[FIELD.form]);
    const trail = needle ? categoryTrail(entry.atc) : '';
    const prose = needle && rule?.prose ? snippet(row[rule.field], needle) : '';
    const id = `rlv-drug-${entry.uid}`;

    return `<li class="rlv-drug">
      <button type="button" class="rlv-drug-open" data-rlv-open="${entry.uid}"
              aria-expanded="false" aria-controls="${id}">
        <span class="rlv-drug-name">${escapeHtml(clean(row[FIELD.name]) || '—')}</span>
        <span class="rlv-drug-meta">${meta.map((part, index) => (
          part === form && index === meta.length - 1
            ? `<strong>${escapeHtml(part)}</strong>`
            : escapeHtml(part)
        )).join(' · ')}</span>
        ${entry.atc ? `<code class="rlv-drug-atc">${escapeHtml(entry.atc)}</code>` : ''}
        ${trail ? `<span class="rlv-drug-trail">${escapeHtml(trail)}</span>` : ''}
        ${prose ? `<span class="rlv-drug-snippet">${prose}</span>` : ''}
      </button>
      <dl class="rlv-drug-detail" id="${id}" hidden></dl>
    </li>`;
  }

  function categoryRow(node) {
    const label = labelFor(node.code);
    return `<li class="rlv-category">
      <button type="button" class="rlv-category-open" data-rlv-enter="${escapeHtml(node.code)}">
        <span class="rlv-category-code">${escapeHtml(node.code)}</span>
        <span class="rlv-category-name">${label ? escapeHtml(label) : '<em>Nënndarje ATC</em>'}</span>
        <span class="rlv-category-count">${node.count}</span>
      </button>
    </li>`;
  }

  function renderBreadcrumb() {
    if (!state.path.length) {
      elements.crumb.innerHTML = '<span class="rlv-crumb-current">Të gjitha kategoritë</span>';
      return;
    }
    const parts = state.path.map((code, index) => {
      const label = labelFor(code);
      const text = label ? `${code} — ${label}` : code;
      return index === state.path.length - 1
        ? `<span class="rlv-crumb-current">${escapeHtml(text)}</span>`
        : `<button type="button" data-rlv-crumb="${index}">${escapeHtml(code)}</button>`;
    });
    elements.crumb.innerHTML = `<button type="button" data-rlv-crumb="-1">Të gjitha</button>${parts.join('')}`;
  }

  // Everything filed at or beneath the current place in the tree — what the
  // filters describe, and what they narrow.
  function browseScope(node) {
    return node ? collectEntries(node) : buildIndex().filter(entry => levelsOf(entry.atc).length);
  }

  function anyFilter() {
    return FILTERS.some(filter => state.filters[filter.key]);
  }

  function renderBrowse() {
    renderBreadcrumb();
    const node = state.path.length ? nodeAt(state.path) : null;
    const scope = browseScope(node);
    renderFilters(scope);

    // A filter makes the category counts wrong — they count everything beneath,
    // filter or no filter. So while one is set the tree gives way to the drugs
    // that actually match, and the number shown is the number of those.
    const filtering = anyFilter();
    const flatten = filtering || (Boolean(node) && shouldFlatten(node));
    const children = flatten ? [] : childrenAt(state.path);
    const entries = (flatten ? scope : (node ? node.entries : [])).filter(matchesFilters);

    if (!children.length && !entries.length) {
      // An empty register is not an empty category. On desktop the rows arrive
      // after the page does, so saying "this category has no drugs" before they
      // land tells the doctor something untrue about the register.
      const waiting = !sourceRows().length;
      elements.list.innerHTML = `<li class="rlv-empty">${waiting
        ? 'Regjistri po ngarkohet…'
        : filtering
          ? 'Asnjë bar nuk i plotëson filtrat e zgjedhur.'
          : 'Kjo kategori nuk ka barna në regjistër.'}</li>`;
      elements.count.textContent = '';
      return;
    }

    const shown = entries.slice(0, BROWSE_MAX);
    elements.count.textContent = filtering
      ? `${entries.length} ${entries.length === 1 ? 'bar' : 'barna'}`
      : (node ? `${node.count} ${node.count === 1 ? 'bar' : 'barna'}` : `${sourceRows().length} barna`);

    elements.list.innerHTML = [
      ...children.map(categoryRow),
      ...shown.map(entry => drugRow(entry, '', null)),
      entries.length > shown.length
        ? `<li class="rlv-more">Shfaqen ${shown.length} nga ${entries.length}. Ngushtoni me filtra ose me kërkim.</li>`
        : '',
    ].join('');
  }

  function renderResults() {
    const needle = normalize(state.query);
    const matches = ranked(state.query);
    const all = matches.filter(hit => matchesFilters(hit.entry));
    const hits = all.slice(0, MAX_RESULTS);
    elements.crumb.innerHTML = `<span class="rlv-crumb-current">Rezultatet për “${escapeHtml(clean(state.query))}”</span>`;
    // The filters describe everything the search found, not just the page of it
    // that is shown, so narrowing by one never hides what the others could reach.
    renderFilters(matches.map(hit => hit.entry));

    if (!hits.length) {
      elements.list.innerHTML = `<li class="rlv-empty">${anyFilter()
        ? 'Asnjë bar nuk i plotëson filtrat për këtë kërkim.'
        : 'Asnjë bar nuk përputhet me këtë kërkim.'}</li>`;
      elements.count.textContent = '';
      return;
    }

    elements.count.textContent = all.length > hits.length
      ? `${hits.length} nga ${all.length} rezultate`
      : `${hits.length} ${hits.length === 1 ? 'rezultat' : 'rezultate'}`;
    elements.list.innerHTML = hits.map(hit => drugRow(hit.entry, needle, hit.rule)).join('');
  }

  function render() {
    if (!state.mounted) return;
    buildIndex();
    if (normalize(state.query).length >= 2) renderResults();
    else renderBrowse();
  }

  // --- view switching ---------------------------------------------------------

  function activeView() {
    return ROOT.dataset.miRegistryView === 'list' ? 'list' : 'table';
  }

  function setView(view, persist = true) {
    const next = view === 'list' ? 'list' : 'table';
    ROOT.dataset.miRegistryView = next;
    if (elements) {
      elements.panel.hidden = next !== 'list';
      elements.toggle.querySelectorAll('[data-rlv-view]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.rlvView === next));
      });
    }
    if (persist) {
      try { localStorage.setItem(VIEW_KEY, next); } catch {}
    }
    if (next === 'list') {
      // Browsing and searching answer over the whole register, not the page the
      // table happens to be showing. On desktop the registry arrives one page at
      // a time, so announce that this surface needs all of it; whoever owns the
      // data decides how to satisfy that, and the rebuild happens on the
      // registry-rendered event as it does for any other dataset change.
      if (window.MEDINDEX_REGISTRY_PARTIAL) {
        window.dispatchEvent(new CustomEvent('medindex:registry-full-dataset-needed', {
          detail:{ reason:'registry-list-view' },
        }));
      }
      render();
    }
  }

  function storedView() {
    try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'table'; } catch { return 'table'; }
  }

  // --- mounting ----------------------------------------------------------------

  function mount() {
    const registry = document.getElementById('registryContent');
    const toolbar = document.querySelector('.toolbar');
    if (!registry || !toolbar || state.mounted) return;

    // The toggle sits above the registry rather than inside the search toolbar.
    // On a phone it would take a row of its own there, and the toolbar has a
    // height budget it must stay inside — a switch belongs next to the thing it
    // switches, not among the filters.
    const bar = document.createElement('div');
    bar.className = 'rlv-bar';
    const toggle = document.createElement('div');
    toggle.className = 'rlv-toggle';
    toggle.setAttribute('role', 'group');
    toggle.setAttribute('aria-label', 'Mënyra e shfaqjes së regjistrit');
    toggle.innerHTML = `
      <button type="button" data-rlv-view="list" aria-pressed="false"><span aria-hidden="true">☷</span>Listë</button>
      <button type="button" data-rlv-view="table" aria-pressed="true"><span aria-hidden="true">▦</span>Tabelë</button>`;
    bar.appendChild(toggle);
    registry.insertAdjacentElement('beforebegin', bar);

    const panel = document.createElement('section');
    panel.className = 'rlv-panel';
    panel.id = 'registryListView';
    panel.setAttribute('aria-label', 'Regjistri si listë');
    panel.hidden = true;
    panel.innerHTML = `
      <div class="rlv-head">
        <nav class="rlv-crumb" id="registryListCrumb" aria-label="Rruga e kategorive"></nav>
        <span class="rlv-count" id="registryListCount"></span>
      </div>
      <div class="rlv-filters" id="registryListFilters" role="group" aria-label="Filtrat e listës"></div>
      <ul class="rlv-list" id="registryListRows"></ul>`;
    registry.insertAdjacentElement('afterend', panel);

    elements = {
      panel,
      toggle,
      crumb:panel.querySelector('#registryListCrumb'),
      count:panel.querySelector('#registryListCount'),
      filters:panel.querySelector('#registryListFilters'),
      list:panel.querySelector('#registryListRows'),
    };
    state.mounted = true;

    toggle.addEventListener('click', event => {
      const button = event.target.closest('[data-rlv-view]');
      if (button) setView(button.dataset.rlvView);
    });

    panel.addEventListener('change', event => {
      const select = event.target.closest('[data-rlv-filter]');
      if (!select) return;
      const value = select.value;
      if (value) state.filters[select.dataset.rlvFilter] = value;
      else delete state.filters[select.dataset.rlvFilter];
      render();
    });

    panel.addEventListener('click', event => {
      if (event.target.closest('[data-rlv-clear-filters]')) {
        state.filters = {};
        render();
        return;
      }
      const enter = event.target.closest('[data-rlv-enter]');
      if (enter) {
        state.path = [...state.path, enter.dataset.rlvEnter];
        render();
        return;
      }
      const crumb = event.target.closest('[data-rlv-crumb]');
      if (crumb) {
        const index = Number(crumb.dataset.rlvCrumb);
        state.path = index < 0 ? [] : state.path.slice(0, index + 1);
        render();
        return;
      }
      // A drug opens where it stands. Handing back to the table cannot work:
      // the table is paginated, so the drug the doctor just found is usually not
      // on the page it is showing.
      const open = event.target.closest('[data-rlv-open]');
      if (open) {
        const detail = document.getElementById(open.getAttribute('aria-controls'));
        if (!detail) return;
        // Filled the first time it is opened. A category can hold a hundred and
        // more drugs, and building every record up front would put tens of
        // thousands of nodes on the page to show one.
        if (!detail.dataset.rlvFilled) {
          const entry = buildIndex()[Number(open.dataset.rlvOpen)];
          detail.innerHTML = entry ? detailFields(entry.row).map(([key, value]) =>
            `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join('') : '';
          detail.dataset.rlvFilled = '1';
        }
        const expanded = open.getAttribute('aria-expanded') === 'true';
        open.setAttribute('aria-expanded', String(!expanded));
        detail.hidden = expanded;
      }
    });

    // One search box drives both views, so switching never loses the query.
    const searchInput = document.getElementById('search');
    if (searchInput) {
      let timer = 0;
      const sync = () => {
        state.query = searchInput.value;
        if (activeView() === 'list') {
          clearTimeout(timer);
          timer = setTimeout(render, 120);
        }
      };
      searchInput.addEventListener('input', sync);
      state.query = searchInput.value;
    }

    // The table publishes this whenever its rows change; the tree is rebuilt
    // only when the underlying dataset actually changed identity.
    // The registry publishes these as its rows change: a page at a time first,
    // then the whole register once an advanced surface asks for it. buildIndex
    // notices the swap by identity, so re-rendering is enough here.
    ['medindex:registry-rendered', 'medindex:registry-page-ready', 'medindex:registry-ready']
      .forEach(name => window.addEventListener(name, () => {
        if (activeView() === 'list') render();
      }));

    setView(storedView(), false);
  }

  // The table builds itself from a deferred runtime, so the toolbar may not be
  // there yet. Retry for a few seconds, then give up quietly: an endless timer
  // would keep waking the phone long after the page has settled.
  let attemptsLeft = 40;
  function start() {
    mount();
    if (!state.mounted && attemptsLeft-- > 0) setTimeout(start, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();

  window.MedIndexRegistryListView = Object.freeze({
    setView,
    activeView,
    _test:{
      levelsOf, normalize, snippet, detailFields,
      search:query => search(query),
      // Filters are state, so a test drives them the way the panel does.
      setFilter(key, value) {
        if (value) state.filters[key] = value;
        else delete state.filters[key];
      },
      clearFilters() { state.filters = {}; },
      filtered(query) {
        return ranked(query).filter(hit => matchesFilters(hit.entry))
          .map(hit => clean(hit.entry.row[FIELD.name]));
      },
      optionsFor(key, query) {
        const filter = FILTERS.find(item => item.key === key);
        const pool = query ? ranked(query).map(hit => hit.entry) : buildIndex();
        return optionsFor(filter, pool).map(([value, count]) => `${value}:${count}`);
      },
      // What a given breadcrumb path would show: the categories offered next and
      // the drugs listed outright.
      browseAt(path) {
        const node = path.length ? nodeAt(path) : null;
        const flatten = Boolean(node) && shouldFlatten(node);
        return {
          children:(flatten ? [] : childrenAt(path)).map(child => child.code),
          entries:(flatten ? collectEntries(node) : (node ? node.entries : [])).length,
          count:node ? node.count : sourceRows().length,
        };
      },
    },
  });
})();
