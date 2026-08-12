'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MARKER = 'phase11-form-picker-lite-v1';
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Phase 11 form-lite patch could not find ${label}.`);
  return source.replace(before, after);
}

function extractObjectLiteral(name) {
  const legacy = `${read('app-parts/part-02.txt')}\n${read('app-parts/part-03.txt')}`;
  const marker = `const ${name} = {`;
  const start = legacy.indexOf(marker);
  const objectStart = start >= 0 ? legacy.indexOf('{', start) : -1;
  const end = objectStart >= 0 ? legacy.indexOf('\n};', objectStart) : -1;
  if (start < 0 || objectStart < 0 || end < 0) {
    throw new Error(`Phase 11 form-lite could not extract ${name} from the canonical legacy taxonomy.`);
  }
  return legacy.slice(objectStart, end + 2);
}

const FORM_CATEGORIES_LITERAL = extractObjectLiteral('FORM_CATEGORIES');
const CATEGORY_COLORS_LITERAL = extractObjectLiteral('CATEGORY_COLORS');
const FORM_ALIASES_LITERAL = extractObjectLiteral('FORM_ALIASES');

function patchApi() {
  let source = read('api/drug-search.js');
  if (source.includes(`REGISTRY_FORM_FILTER_RUNTIME = '${MARKER}'`)) return;

  const constantsAnchor = 'const REGISTRY_MAX_QUERY_LENGTH = 80;';
  const constants = `${constantsAnchor}\nconst REGISTRY_FORM_FILTER_RUNTIME = '${MARKER}';\nconst REGISTRY_FORM_CATEGORIES = Object.freeze(${FORM_CATEGORIES_LITERAL});`;
  source = replaceOnce(source, constantsAnchor, constants, 'API form taxonomy constants');

  const helperAnchor = 'function resultFromRow(row) {';
  const helpers = `function registryFormCategoryValues(value) {\n  const category = clean(value);\n  const forms = REGISTRY_FORM_CATEGORIES[category];\n  return Array.isArray(forms) ? forms : [];\n}\n\nfunction registryPostgrestQuotedValue(value) {\n  return JSON.stringify(clean(value));\n}\n\n${helperAnchor}`;
  source = replaceOnce(source, helperAnchor, helpers, 'API category helper');

  source = replaceOnce(
    source,
    `  const form = registryPageTextFilter(query.form, 80);\n  const substance = registryPageTextFilter(query.substance, 100);`,
    `  const form = registryPageTextFilter(query.form, 80);\n  const formExact = registryPageTextFilter(query.formExact, 120);\n  const formCategory = clean(query.formCategory).slice(0, 80);\n  const substance = registryPageTextFilter(query.substance, 100);`,
    'registry-page form query state',
  );

  source = replaceOnce(
    source,
    `  if (form) params.set('pharmaceutical_form', \`ilike.*\${form}*\`);\n  if (substance) params.set('active_substance', \`ilike.*\${substance}*\`);`,
    `  const categoryForms = registryFormCategoryValues(formCategory);\n  if (formExact) params.set('pharmaceutical_form', 'eq.' + formExact);\n  else if (categoryForms.length) params.set('pharmaceutical_form', 'in.(' + categoryForms.map(registryPostgrestQuotedValue).join(',') + ')');\n  else if (form) params.set('pharmaceutical_form', \`ilike.*\${form}*\`);\n  if (substance) params.set('active_substance', \`ilike.*\${substance}*\`);`,
    'registry-page exact/category form filter',
  );

  source = replaceOnce(
    source,
    `    form,\n    substance,`,
    `    form,\n    formExact,\n    formCategory,\n    substance,`,
    'registry-page returned form state',
  );

  source = replaceOnce(
    source,
    `      form:request.form,\n      substance:request.substance,`,
    `      form:request.form,\n      formExact:request.formExact,\n      formCategory:request.formCategory,\n      substance:request.substance,`,
    'registry-page response form state',
  );

  if (!source.includes(`REGISTRY_FORM_FILTER_RUNTIME = '${MARKER}'`)) throw new Error('Phase 11 form-lite API marker missing.');
  if (!source.includes("params.set('pharmaceutical_form', 'eq.' + formExact)")) throw new Error('Phase 11 exact pharmaceutical-form filter missing.');
  if (!source.includes("params.set('pharmaceutical_form', 'in.(' + categoryForms.map(registryPostgrestQuotedValue).join(',') + ')')")) {
    throw new Error('Phase 11 category pharmaceutical-form filter missing.');
  }
  write('api/drug-search.js', source);
}

function patchDesktop() {
  let source = read('registry-desktop-lite.js');
  if (source.includes(`const DESKTOP_FORM_FILTER_RUNTIME = '${MARKER}';`)) return;

  source = replaceOnce(
    source,
    `    q:'',\n    status:'',\n    sort:'registry',`,
    `    q:'',\n    status:'',\n    formType:null,\n    formValue:null,\n    sort:'registry',`,
    'desktop form state',
  );

  const taxonomyAnchor = '  function authReady() {';
  const taxonomy = `  const DESKTOP_FORM_FILTER_RUNTIME = '${MARKER}';\n  const DESKTOP_FORM_CATEGORIES = Object.freeze(${FORM_CATEGORIES_LITERAL});\n  const DESKTOP_CATEGORY_COLORS = Object.freeze(${CATEGORY_COLORS_LITERAL});\n  const DESKTOP_FORM_ALIASES = Object.freeze(${FORM_ALIASES_LITERAL});\n\n${taxonomyAnchor}`;
  source = replaceOnce(source, taxonomyAnchor, taxonomy, 'desktop legacy form taxonomy');

  source = replaceOnce(
    source,
    `    if (state.q.length >= 2) params.set('q', state.q);\n    if (state.status) params.set('status', state.status);\n    if (includeTotal) params.set('includeTotal', '1');`,
    `    if (state.q.length >= 2) params.set('q', state.q);\n    if (state.status) params.set('status', state.status);\n    if (state.formType === 'form' && state.formValue) params.set('formExact', state.formValue);\n    else if (state.formType === 'category' && state.formValue) params.set('formCategory', state.formValue);\n    if (includeTotal) params.set('includeTotal', '1');`,
    'desktop form query parameters',
  );

  const pickerAnchor = '  function configureControls() {';
  const picker = `  function normalizeDesktopFormText(value) {\n    return clean(value)\n      .normalize('NFD')\n      .replace(/[\\u0300-\\u036f]/g, '')\n      .toLocaleLowerCase('sq')\n      .replace(/\\s+/g, ' ')\n      .trim();\n  }\n\n  function desktopFormMatches(text, query) {\n    const normalizedText = normalizeDesktopFormText(text);\n    const normalizedQuery = normalizeDesktopFormText(query);\n    if (!normalizedQuery || normalizedText.includes(normalizedQuery)) return true;\n    return Object.entries(DESKTOP_FORM_ALIASES).some(([alias, targets]) => {\n      if (!normalizedQuery.includes(normalizeDesktopFormText(alias))) return false;\n      return targets.some(target => normalizedText.includes(normalizeDesktopFormText(target)));\n    });\n  }\n\n  function desktopFormCategoryOf(value) {\n    const form = clean(value);\n    return Object.keys(DESKTOP_FORM_CATEGORIES).find(category => DESKTOP_FORM_CATEGORIES[category].includes(form)) || '';\n  }\n\n  function syncDesktopFormButton() {\n    const button = document.getElementById('formPickerBtn');\n    if (!button) return;\n    if (!state.formType || !state.formValue) {\n      button.textContent = 'Forma: Të gjitha ▾';\n      return;\n    }\n    const category = state.formType === 'category' ? state.formValue : desktopFormCategoryOf(state.formValue);\n    const color = DESKTOP_CATEGORY_COLORS[category] || '#999';\n    button.innerHTML = '<span class="cat-dot" style="background:' + escapeHtml(color) + '"></span>' + escapeHtml(state.formValue) + ' ▾';\n  }\n\n  function selectDesktopForm(type, value) {\n    if (state.disabled) return;\n    state.formType = type === 'category' || type === 'form' ? type : null;\n    state.formValue = state.formType ? clean(value) : null;\n    state.page = 1;\n    syncDesktopFormButton();\n    document.getElementById('formPanel')?.classList.remove('open');\n    buildDesktopFormPanel(document.getElementById('formSearch')?.value || '');\n    void loadPage({ includeTotal:true, scroll:false });\n  }\n\n  function buildDesktopFormPanel(filterText = '') {\n    const list = document.getElementById('formList');\n    if (!list) return;\n    list.innerHTML = '';\n    const query = normalizeDesktopFormText(filterText);\n\n    const allItem = document.createElement('div');\n    allItem.className = 'form-item form-item-all' + (!state.formType ? ' active' : '');\n    allItem.textContent = 'Të gjitha format';\n    allItem.addEventListener('click', () => selectDesktopForm(null, null));\n    list.appendChild(allItem);\n\n    let rendered = false;\n    Object.entries(DESKTOP_FORM_CATEGORIES).forEach(([category, forms]) => {\n      const categoryMatches = !query || desktopFormMatches(category, query);\n      const visibleForms = forms.filter(form => !query || categoryMatches || desktopFormMatches(form, query));\n      if (query && !categoryMatches && visibleForms.length === 0) return;\n      rendered = true;\n\n      const color = DESKTOP_CATEGORY_COLORS[category] || '#999';\n      const header = document.createElement('div');\n      header.className = 'form-cat-header' + (state.formType === 'category' && state.formValue === category ? ' active' : '');\n      header.innerHTML = '<span class="cat-dot" style="background:' + escapeHtml(color) + '"></span>' + escapeHtml(category) + ' <span class="cat-count">(' + forms.length + ')</span>';\n      header.addEventListener('click', () => selectDesktopForm('category', category));\n      list.appendChild(header);\n\n      (query && !categoryMatches ? visibleForms : forms).forEach(form => {\n        const item = document.createElement('div');\n        item.className = 'form-item form-item-sub' + (state.formType === 'form' && state.formValue === form ? ' active' : '');\n        item.innerHTML = '<span class="cat-dot" style="background:' + escapeHtml(color) + '"></span>' + escapeHtml(form);\n        item.addEventListener('click', () => selectDesktopForm('form', form));\n        list.appendChild(item);\n      });\n    });\n\n    if (query && !rendered) {\n      const empty = document.createElement('div');\n      empty.className = 'form-empty';\n      empty.textContent = 'Asnjë formë nuk u gjet';\n      list.appendChild(empty);\n    }\n  }\n\n  function initDesktopFormPicker() {\n    const button = document.getElementById('formPickerBtn');\n    const panel = document.getElementById('formPanel');\n    const search = document.getElementById('formSearch');\n    if (!button || !panel || !search || button.dataset.desktopLiteFormBound === '1') return;\n    button.dataset.desktopLiteFormBound = '1';\n    buildDesktopFormPanel('');\n    syncDesktopFormButton();\n\n    button.addEventListener('click', event => {\n      if (state.disabled) return;\n      event.stopPropagation();\n      panel.classList.toggle('open');\n      if (panel.classList.contains('open')) search.focus({ preventScroll:true });\n    });\n    search.addEventListener('input', () => {\n      if (!state.disabled) buildDesktopFormPanel(search.value);\n    });\n    panel.addEventListener('click', event => {\n      if (!state.disabled) event.stopPropagation();\n    });\n    document.addEventListener('click', event => {\n      if (state.disabled) return;\n      if (!panel.contains(event.target) && event.target !== button) panel.classList.remove('open');\n    });\n  }\n\n${pickerAnchor}`;
  source = replaceOnce(source, pickerAnchor, picker, 'desktop form picker implementation');

  source = replaceOnce(
    source,
    `      ['protocolsBtn', 'prescription-builder'],\n      ['colPickerBtn', 'column-picker'],\n      ['formPickerBtn', 'form-picker'],`,
    `      ['protocolsBtn', 'prescription-builder'],\n      ['colPickerBtn', 'column-picker'],`,
    'remove form picker full-registry handoff',
  );

  source = replaceOnce(
    source,
    `  function start() {\n    if (state.disabled) return;\n    configureControls();\n    void loadPage({ includeTotal:true, scroll:false });\n  }`,
    `  function start() {\n    if (state.disabled) return;\n    configureControls();\n    initDesktopFormPicker();\n    void loadPage({ includeTotal:true, scroll:false });\n  }`,
    'desktop form picker startup',
  );

  if (!source.includes(`const DESKTOP_FORM_FILTER_RUNTIME = '${MARKER}';`)) throw new Error('Phase 11 desktop form-lite marker missing.');
  if (source.includes("['formPickerBtn', 'form-picker']")) throw new Error('Phase 11 form picker still triggers full-registry handoff.');
  if (!source.includes("params.set('formExact', state.formValue)")) throw new Error('Phase 11 exact form query is missing.');
  if (!source.includes("params.set('formCategory', state.formValue)")) throw new Error('Phase 11 category form query is missing.');
  write('registry-desktop-lite.js', source);
}

patchApi();
patchDesktop();
console.log('Phase 11 pharmaceutical-form picker stays local until selection and filters Neon server-side without full-registry handoff.');
