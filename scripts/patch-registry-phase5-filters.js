'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Phase 5 registry filter patch could not find ${label}.`);
  return source.replace(before, after);
}

function replaceBlock(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement)) return source;
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start) : -1;
  if (start < 0 || end < 0) throw new Error(`Phase 5 registry filter patch could not find ${label}.`);
  return source.slice(0, start) + replacement + source.slice(end);
}

function patchApi() {
  let source = read('api/drug-search.js');
  const block = `const REGISTRY_POPULATIONS = new Set(['adult_only', 'pediatric_only', 'both']);

function registryPageTextFilter(value, maximum = 120) {
  return registrySearchTerm(value).slice(0, maximum);
}

function registryPageAtcFilter(value) {
  return exactFilter(value, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function registryPagePopulation(value) {
  const population = clean(value).toLowerCase();
  return REGISTRY_POPULATIONS.has(population) ? population : '';
}

function registryListSelectWithPopulation(population) {
  if (population === 'both') {
    return \`\${REGISTRY_LIST_SELECT},adult:dosage_regimens!inner(),pediatric:dosage_regimens!inner()\`;
  }
  if (population === 'adult_only') {
    return \`\${REGISTRY_LIST_SELECT},adult:dosage_regimens!inner(),pediatric:dosage_regimens()\`;
  }
  if (population === 'pediatric_only') {
    return \`\${REGISTRY_LIST_SELECT},pediatric:dosage_regimens!inner(),adult:dosage_regimens()\`;
  }
  return REGISTRY_LIST_SELECT;
}

function applyRegistryPopulationFilters(params, population) {
  const adult = () => {
    params.set('adult.population', 'eq.adult');
    params.set('adult.editorial_status', 'eq.published');
  };
  const pediatric = () => {
    params.set('pediatric.population', 'eq.pediatric');
    params.set('pediatric.editorial_status', 'eq.published');
  };

  if (population === 'both') {
    adult();
    pediatric();
  } else if (population === 'adult_only') {
    adult();
    pediatric();
    params.set('pediatric', 'is.null');
  } else if (population === 'pediatric_only') {
    pediatric();
    adult();
    params.set('adult', 'is.null');
  }
}

function buildRegistryPagePath(query = {}) {
  const page = integerInRange(query.page, 1, 1, 100000);
  const pageSize = integerInRange(query.pageSize, REGISTRY_DEFAULT_PAGE_SIZE, 1, REGISTRY_MAX_PAGE_SIZE);
  const includeTotal = ['1', 'true', 'yes'].includes(clean(query.includeTotal).toLowerCase());
  const offset = (page - 1) * pageSize;
  const q = registrySearchTerm(query.q);
  const status = exactFilter(query.status);
  const atc = registryPageAtcFilter(query.atc);
  const form = registryPageTextFilter(query.form, 80);
  const substance = registryPageTextFilter(query.substance, 100);
  const indication = registryPageTextFilter(query.indication, 100);
  const population = registryPagePopulation(query.population);
  const sortKey = clean(query.sort).toLowerCase();
  const sortColumn = REGISTRY_SORTS[sortKey] || REGISTRY_SORTS.registry;
  const direction = clean(query.direction).toLowerCase() === 'desc' ? 'desc' : 'asc';
  const fetchLimit = includeTotal ? pageSize : Math.min(REGISTRY_MAX_PAGE_SIZE + 1, pageSize + 1);

  const params = new URLSearchParams();
  params.set('select', registryListSelectWithPopulation(population));
  params.set('is_published', 'eq.true');
  params.set('editorial_status', 'eq.published');
  params.set('order', \`\${sortColumn}.\${direction},registry_number.asc\`);
  params.set('limit', String(fetchLimit));
  params.set('offset', String(offset));
  if (status) params.set('product_status', \`eq.\${status}\`);
  if (atc) params.set('atc_code', \`ilike.\${atc}*\`);
  if (form) params.set('pharmaceutical_form', \`ilike.*\${form}*\`);
  if (substance) params.set('active_substance', \`ilike.*\${substance}*\`);
  if (indication) params.set('use_text', \`ilike.*\${indication}*\`);
  applyRegistryPopulationFilters(params, population);

  if (q.length >= 2) {
    const pattern = \`*\${q}*\`;
    params.set('or', \`(\${[
      \`trade_name.ilike.\${pattern}\`,
      \`active_substance.ilike.\${pattern}\`,
      \`atc_code.ilike.\${pattern}\`,
      \`drug_class.ilike.\${pattern}\`,
      \`use_text.ilike.\${pattern}\`,
      \`strength.ilike.\${pattern}\`,
      \`pharmaceutical_form.ilike.\${pattern}\`,
      \`pdid.ilike.\${pattern}\`,
      \`protocol_no.ilike.\${pattern}\`,
    ].join(',')})\`);
  }

  return {
    path:\`drugs?\${params.toString()}\`,
    page,
    pageSize,
    includeTotal,
    q,
    status,
    atc,
    form,
    substance,
    indication,
    population,
    sort:sortKey || 'registry',
    direction,
  };
}

`;
  source = replaceBlock(
    source,
    'function buildRegistryPagePath(query = {}) {',
    'async function sendRegistryPage',
    block,
    'registry-page query builder',
  );
  source = replaceOnce(
    source,
    `    query:{\n      q:request.q,\n      status:request.status,\n      form:request.form,\n      sort:request.sort,\n      direction:request.direction,\n      includeTotal:request.includeTotal,\n    },`,
    `    query:{\n      q:request.q,\n      status:request.status,\n      atc:request.atc,\n      form:request.form,\n      substance:request.substance,\n      indication:request.indication,\n      population:request.population,\n      sort:request.sort,\n      direction:request.direction,\n      includeTotal:request.includeTotal,\n    },`,
    'registry-page response filters',
  );
  if (!source.includes("params.set('pediatric', 'is.null')") || !source.includes("params.set('adult', 'is.null')")) {
    throw new Error('Phase 5 exclusive population anti-join contract is missing.');
  }
  if (/select['"],\s*['"]\*/.test(source)) throw new Error('Phase 5 must not introduce SELECT *.');
  write('api/drug-search.js', source);
}

function patchMobileLite() {
  let source = read('registry-mobile-lite.js');
  source = replaceOnce(source, "const VERSION = 'registry-mobile-lite-v1';", "const VERSION = 'registry-mobile-lite-v2';", 'mobile-lite version');
  source = replaceOnce(
    source,
    `    q:'',\n    status:'',\n    total:null,`,
    `    q:'',\n    status:'',\n    atc:'',\n    form:'',\n    substance:'',\n    indication:'',\n    population:'',\n    total:null,`,
    'advanced mobile filter state',
  );

  const buildUrl = `function buildPageUrl({ includeTotal = false } = {}) {
    const params = new URLSearchParams({
      view:'registry-page',
      page:String(state.page),
      pageSize:String(state.pageSize),
      sort:'registry',
      direction:'asc',
    });
    if (state.q.length >= 2) params.set('q', state.q);
    if (state.status) params.set('status', state.status);
    if (state.atc) params.set('atc', state.atc);
    if (state.form) params.set('form', state.form);
    if (state.substance) params.set('substance', state.substance);
    if (state.indication) params.set('indication', state.indication);
    if (state.population) params.set('population', state.population);
    if (includeTotal) params.set('includeTotal', '1');
    return \`\${API}?\${params.toString()}\`;
  }

`;
  source = replaceBlock(source, 'function buildPageUrl({ includeTotal = false } = {}) {', 'function setBusy', buildUrl, 'mobile page URL builder');

  const filterApi = `function setFilters(next = {}, options = {}) {
    const has = key => Object.prototype.hasOwnProperty.call(next, key);
    if (has('q')) state.q = clean(next.q).slice(0, 80);
    if (has('status')) state.status = clean(next.status).slice(0, 40);
    if (has('atc')) state.atc = clean(next.atc).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
    if (has('form')) state.form = clean(next.form).slice(0, 80);
    if (has('substance')) state.substance = clean(next.substance).slice(0, 100);
    if (has('indication')) state.indication = clean(next.indication).slice(0, 100);
    if (has('population')) {
      const population = clean(next.population).toLowerCase();
      state.population = ['adult_only', 'pediatric_only', 'both'].includes(population) ? population : '';
    }
    if (has('pageSize')) state.pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(next.pageSize) || DEFAULT_PAGE_SIZE));
    state.page = 1;

    const search = document.getElementById('search');
    const status = document.getElementById('statusFilter');
    const pageSize = document.getElementById('pageSize');
    if (search && has('q')) search.value = state.q;
    if (status && has('status')) status.value = state.status;
    if (pageSize && has('pageSize')) pageSize.value = String(state.pageSize);

    window.dispatchEvent(new CustomEvent('medindex:mobile-lite-filters-changed', {
      detail:{ q:state.q, status:state.status, atc:state.atc, form:state.form, substance:state.substance, indication:state.indication, population:state.population }
    }));
    if (options.load === false) return Promise.resolve();
    return loadPage({ includeTotal:true, scroll:Boolean(options.scroll) });
  }

  function getFilters() {
    return {
      q:state.q,
      status:state.status,
      atc:state.atc,
      form:state.form,
      substance:state.substance,
      indication:state.indication,
      population:state.population,
      pageSize:state.pageSize,
    };
  }

`;
  if (!source.includes('function setFilters(next = {}, options = {})')) {
    const anchor = '  window.MEDINDEX_MOBILE_LITE = {';
    const index = source.indexOf(anchor);
    if (index < 0) throw new Error('Phase 5 could not find mobile-lite public API anchor.');
    source = source.slice(0, index) + '  ' + filterApi.replace(/\n/g, '\n  ').trimEnd() + '\n\n' + source.slice(index);
  }
  source = replaceOnce(
    source,
    `    version:VERSION,\n    reload:() => loadPage({ includeTotal:true, scroll:false }),\n    handoff:requestFullRegistry,\n    getState:() => ({ ...state }),`,
    `    version:VERSION,\n    reload:() => loadPage({ includeTotal:true, scroll:false }),\n    setFilters,\n    getFilters,\n    handoff:requestFullRegistry,\n    getState:() => ({ ...state }),`,
    'mobile-lite filter API export',
  );
  if (!source.includes("params.set('population', state.population)")) throw new Error('Mobile registry population query is missing.');
  write('registry-mobile-lite.js', source);
}

function patchMobilePhase3() {
  let source = read('registry-mobile-phase3.js');
  source = replaceOnce(source, "const VERSION = 'registry-mobile-phase3-v1';", "const VERSION = 'registry-mobile-phase3-v2';", 'Phase 3/5 runtime version');

  const activeCount = `function activeFilterCount() {
    const lite = window.MEDINDEX_MOBILE_LITE?.getFilters?.() || {};
    const search = Boolean(clean(document.getElementById('search')?.value || lite.q));
    const status = Boolean(clean(document.getElementById('statusFilter')?.value || lite.status));
    const pageSize = clean(document.getElementById('pageSize')?.value || lite.pageSize);
    return [
      search,
      status,
      pageSize && pageSize !== '25',
      Boolean(clean(lite.atc)),
      Boolean(clean(lite.form)),
      Boolean(clean(lite.substance)),
      Boolean(clean(lite.indication)),
      Boolean(clean(lite.population)),
    ].filter(Boolean).length;
  }

`;
  source = replaceBlock(source, 'function activeFilterCount() {', 'function syncFilterBadge', activeCount, 'advanced active-filter counter');

  const sheetBlock = `function ensureSheet() {
    if (sheet?.isConnected) {
      if (sheet.parentElement !== document.body) document.body.appendChild(sheet);
      return sheet;
    }
    sheet = document.createElement('div');
    sheet.id = 'miRegistryFilterSheet';
    sheet.className = 'mi-registry-filter-sheet';
    sheet.hidden = true;
    sheet.innerHTML = \`
      <button type="button" class="mi-registry-filter-backdrop" data-mi-phase3-filter-close aria-label="Mbyll filtrat"></button>
      <section class="mi-registry-filter-panel" role="dialog" aria-modal="true" aria-labelledby="miRegistryFilterTitle">
        <div class="mi-registry-filter-head">
          <div><strong id="miRegistryFilterTitle">Filtrat</strong><span>Filtrim server-side · vetëm rezultatet e nevojshme nga Neon.</span></div>
          <button type="button" data-mi-phase3-filter-close aria-label="Mbyll">×</button>
        </div>
        <div class="mi-registry-filter-body">
          <label>Popullata e aprovuar
            <select id="miPhase3Population">
              <option value="">Të rritur dhe fëmijë · të gjitha</option>
              <option value="both">Të rritur + pediatrik</option>
              <option value="adult_only">Vetëm të rritur</option>
              <option value="pediatric_only">Vetëm pediatrik</option>
            </select>
          </label>
          <div class="mi-registry-filter-grid">
            <label>ATC
              <input id="miPhase3Atc" type="search" inputmode="search" autocomplete="off" placeholder="p.sh. N02, A06AB02">
            </label>
            <label>Substanca aktive
              <input id="miPhase3Substance" type="search" autocomplete="off" placeholder="p.sh. bisacodyl">
            </label>
          </div>
          <label>Forma farmaceutike
            <input id="miPhase3Form" type="search" autocomplete="off" placeholder="p.sh. tablet, syrup, suppository">
          </label>
          <label>Indikacioni / përdorimi
            <input id="miPhase3Indication" type="search" autocomplete="off" placeholder="p.sh. migrenë, hipertension, kapsllëk">
          </label>
          <div class="mi-registry-filter-grid">
            <label>Statusi
              <select id="miPhase3Status">
                <option value="">Të gjitha statuset</option>
                <option value="Gjenerik">Gjenerik</option>
                <option value="Origjinator">Origjinator</option>
              </select>
            </label>
            <label>Rezultate për faqe
              <select id="miPhase3PageSize">
                <option value="25">25 / faqe</option>
                <option value="50">50 / faqe</option>
              </select>
            </label>
          </div>
          <p class="mi-registry-filter-hint">Kërkimi kryesor vazhdon të kërkojë sipas emrit, substancës, ATC-së, klasës dhe përdorimit. Këta filtra e ngushtojnë rezultatin pa shkarkuar regjistrin e plotë.</p>
        </div>
        <div class="mi-registry-filter-actions">
          <button type="button" class="mi-registry-filter-reset" data-mi-phase3-filter-reset>Pastro</button>
          <button type="button" class="mi-registry-filter-apply" data-mi-phase3-filter-apply>Shfaq rezultatet</button>
        </div>
      </section>\`;
    document.body.appendChild(sheet);
    sheet.querySelectorAll('[data-mi-phase3-filter-close]').forEach(node => node.addEventListener('click', closeFilters));
    sheet.querySelector('[data-mi-phase3-filter-reset]')?.addEventListener('click', clearFilters);
    sheet.querySelector('[data-mi-phase3-filter-apply]')?.addEventListener('click', applyFilters);
    return sheet;
  }

`;
  source = replaceBlock(source, 'function ensureSheet() {', 'function syncSheetValues()', sheetBlock, 'advanced filter sheet');

  const syncBlock = `function syncSheetValues() {
    const dialog = ensureSheet();
    if (!dialog) return;
    const filters = window.MEDINDEX_MOBILE_LITE?.getFilters?.() || {};
    const values = {
      '#miPhase3Status':clean(document.getElementById('statusFilter')?.value || filters.status),
      '#miPhase3PageSize':clean(document.getElementById('pageSize')?.value || filters.pageSize || '25'),
      '#miPhase3Population':clean(filters.population),
      '#miPhase3Atc':clean(filters.atc),
      '#miPhase3Substance':clean(filters.substance),
      '#miPhase3Form':clean(filters.form),
      '#miPhase3Indication':clean(filters.indication),
    };
    Object.entries(values).forEach(([selector, value]) => {
      const control = dialog.querySelector(selector);
      if (!control) return;
      if (selector === '#miPhase3PageSize') control.value = ['25','50'].includes(value) ? value : '25';
      else control.value = value;
    });
  }

`;
  source = replaceBlock(source, 'function syncSheetValues() {', 'function openFilters', syncBlock, 'advanced filter sheet state sync');

  const applyBlock = `function applyFilters() {
    const api = window.MEDINDEX_MOBILE_LITE;
    if (!api?.setFilters) return;
    const status = clean(sheet?.querySelector('#miPhase3Status')?.value);
    const pageSize = clean(sheet?.querySelector('#miPhase3PageSize')?.value) || '25';
    const filters = {
      status,
      pageSize,
      population:clean(sheet?.querySelector('#miPhase3Population')?.value),
      atc:clean(sheet?.querySelector('#miPhase3Atc')?.value),
      substance:clean(sheet?.querySelector('#miPhase3Substance')?.value),
      form:clean(sheet?.querySelector('#miPhase3Form')?.value),
      indication:clean(sheet?.querySelector('#miPhase3Indication')?.value),
    };
    const nativeStatus = document.getElementById('statusFilter');
    const nativePageSize = document.getElementById('pageSize');
    if (nativeStatus) nativeStatus.value = status;
    if (nativePageSize) nativePageSize.value = pageSize;
    closeFilters();
    syncFilterBadge();
    void api.setFilters(filters, { load:true, scroll:false });
  }

  function clearFilters() {
    const api = window.MEDINDEX_MOBILE_LITE;
    const search = document.getElementById('search');
    const status = document.getElementById('statusFilter');
    const pageSize = document.getElementById('pageSize');
    if (search) search.value = '';
    if (status) status.value = '';
    if (pageSize) pageSize.value = '25';
    closeFilters();
    syncFilterBadge();
    if (api?.setFilters) {
      void api.setFilters({ q:'', status:'', pageSize:'25', population:'', atc:'', substance:'', form:'', indication:'' }, { load:true, scroll:false });
    }
  }

`;
  source = replaceBlock(source, 'function applyFilters() {', 'function bindStateSync', applyBlock, 'advanced filter apply/reset');
  source = replaceOnce(
    source,
    `    window.addEventListener('medindex:mobile-lite-ready', syncFilterBadge);`,
    `    window.addEventListener('medindex:mobile-lite-ready', syncFilterBadge);\n    window.addEventListener('medindex:mobile-lite-filters-changed', syncFilterBadge);`,
    'advanced filter badge state event',
  );
  if (!source.includes('miPhase3Population') || !source.includes('api.setFilters(filters')) throw new Error('Phase 5 mobile filter controls are incomplete.');
  if (/\bfetch\s*\(/.test(source)) throw new Error('Phase 5 filter UI must reuse mobile-lite networking.');
  write('registry-mobile-phase3.js', source);
}

function patchMobilePhase3Css() {
  let source = read('registry-mobile-phase3.css');
  source = replaceOnce(source, 'max-height:min(74dvh,650px);', 'max-height:min(84dvh,760px);', 'larger filter panel viewport');
  source = replaceOnce(source, 'max-height:calc(min(74dvh,650px) - 132px);', 'max-height:calc(min(84dvh,760px) - 132px);', 'larger filter body viewport');
  source = replaceOnce(
    source,
    `  .mi-registry-filter-body select{\n    width:100%;\n    min-height:48px;\n    padding:0 12px;\n    border:1px solid #d0d5dd;\n    border-radius:12px;\n    background:#fff;\n    color:#101828;\n    font-size:16px;\n  }`,
    `  .mi-registry-filter-body :is(select,input){\n    width:100%;\n    min-height:48px;\n    padding:0 12px;\n    border:1px solid #d0d5dd;\n    border-radius:12px;\n    background:#fff;\n    color:#101828;\n    font-size:16px;\n  }\n\n  .mi-registry-filter-body input::placeholder{color:#98a2b3}\n\n  .mi-registry-filter-grid{\n    display:grid;\n    grid-template-columns:repeat(2,minmax(0,1fr));\n    gap:10px;\n  }\n\n  .mi-registry-filter-hint{\n    margin:0;\n    padding:11px 12px;\n    border:1px solid #e4e7ec;\n    border-radius:12px;\n    background:#f8fafc;\n    color:#667085;\n    font-size:11px;\n    line-height:1.45;\n  }`,
    'advanced filter inputs and grid',
  );
  source = replaceOnce(
    source,
    `  html[data-theme="dark"][data-registry-mobile-lite][data-registry-mobile-phase3] .mi-registry-filter-body select,`,
    `  html[data-theme="dark"][data-registry-mobile-lite][data-registry-mobile-phase3] .mi-registry-filter-body :is(select,input),`,
    'dark advanced filter controls',
  );
  if (!source.includes('.mi-registry-filter-grid')) throw new Error('Phase 5 advanced filter grid styles are missing.');
  write('registry-mobile-phase3.css', source);
}

function patchIndexVersions() {
  let source = read('index.html');
  source = replaceOnce(source, 'registry-mobile-lite.css?v=20260812-1', 'registry-mobile-lite.css?v=20260812-2', 'mobile-lite stylesheet cache key');
  source = replaceOnce(source, 'registry-mobile-phase3.css?v=20260812-1', 'registry-mobile-phase3.css?v=20260812-2', 'Phase 3/5 stylesheet cache key');
  source = replaceOnce(source, 'registry-mobile-lite.js?v=20260812-1', 'registry-mobile-lite.js?v=20260812-2', 'mobile-lite runtime cache key');
  source = replaceOnce(source, 'registry-mobile-phase3.js?v=20260812-1', 'registry-mobile-phase3.js?v=20260812-2', 'Phase 3/5 runtime cache key');
  write('index.html', source);
}

function patchVersionPinnedTests() {
  const testRoot = path.join(ROOT, 'tests');
  for (const entry of fs.readdirSync(testRoot, { withFileTypes:true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const file = path.join('tests', entry.name);
    let source = read(file);
    source = source
      .replaceAll('registry-mobile-lite-v1', 'registry-mobile-lite-v2')
      .replaceAll('registry-mobile-phase3-v1', 'registry-mobile-phase3-v2')
      .replaceAll('registry-mobile-lite\\.js\\?v=20260812-1', 'registry-mobile-lite\\.js\\?v=20260812-2')
      .replaceAll('registry-mobile-phase3\\.js\\?v=20260812-1', 'registry-mobile-phase3\\.js\\?v=20260812-2')
      .replaceAll('registry-mobile-lite\\.css\\?v=20260812-1', 'registry-mobile-lite\\.css\\?v=20260812-2')
      .replaceAll('registry-mobile-phase3\\.css\\?v=20260812-1', 'registry-mobile-phase3\\.css\\?v=20260812-2');
    if (entry.name === 'registry-mobile-phase3-test.js') {
      source = source.replace(
        `assert.match(js, /data-mi-phase3-search-mode="atc"/, 'ATC search shortcut is missing');\nassert.match(js, /data-mi-phase3-search-mode="form"/, 'pharmaceutical-form search shortcut is missing');`,
        `assert.match(js, /miPhase3Population/, 'approved-population filter is missing');\nassert.match(js, /miPhase3Atc/, 'ATC filter is missing');\nassert.match(js, /miPhase3Substance/, 'active-substance filter is missing');\nassert.match(js, /miPhase3Form/, 'pharmaceutical-form filter is missing');\nassert.match(js, /miPhase3Indication/, 'indication filter is missing');\nassert.match(js, /setFilters/, 'Phase 5 filters must reuse the mobile-lite server gateway');`,
      );
      source = source.replace('Phase 3 phone navigation, filter sheet and lightweight handoff contract passed.', 'Phase 3 navigation plus Phase 5 advanced server filter sheet contract passed.');
    }
    write(file, source);
  }
}

patchApi();
patchMobileLite();
patchMobilePhase3();
patchMobilePhase3Css();
patchIndexVersions();
patchVersionPinnedTests();

console.log('Phase 5 advanced server-side registry filters, population anti-join and mobile filter UX patch passed.');
