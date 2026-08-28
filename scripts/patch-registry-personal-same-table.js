'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MARKER = 'registry-personal-same-table-v1';
const VISIBLE_CONTRACT_MARKER = 'registry-personal-visible-columns-v2';
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, source) => fs.writeFileSync(path.join(ROOT, file), source.replace(/\r\n?/g, '\n'), 'utf8');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${MARKER}: ${label} anchor not found.`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceRegex(source, pattern, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!pattern.test(source)) throw new Error(`${MARKER}: ${label} block not found.`);
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

function patchPersonalization() {
  const file = 'registry-user-personalization.js';
  let source = read(file);

  if (!source.includes(`${MARKER}: capture visible main-table contract`)) {
    source = replaceOnce(
      source,
      `  function requestPersonalRuntime() {`,
      `  // ${MARKER}: capture visible main-table contract\n  // Favorites and Notes are filters of the registry, not separate registries.\n  // Capture exactly what the clinician is looking at before the full-data\n  // runtime is requested, then make the handoff preserve those same columns.\n  function lockVisibleMainTableContract() {\n    const header = document.getElementById('headerRow');\n    const table = document.getElementById('dataTable');\n    if (!header || !table) return false;\n    const sourceToUnified = {\n      '__select':'select', 'Nr rendor':'number', 'Emri tregtar':'trade-name',\n      'Substanca aktive':'active-substance', 'ATC Code':'atc',\n      'Klasa / Çka është':'drug-class', 'Përdorimi (fjalë kyçe)':'use',\n      'PDID':'pdid', 'ProtocolNo':'protocol', 'Fortësia':'strength',\n      'Forma farmaceutike':'form', 'Si të shënohet në recetë':'prescription-label',\n      'Madhësia e paketimit':'packaging', 'Bartësi i Autorizim Marketingut':'mah',\n      'Prodhuesi':'manufacturer', 'MA certifikata':'ma-certificate',\n      'Statusi':'status', 'Çmimi me shumicë':'wholesale-price',\n      'Çmimi me marzhë':'margin-price', 'TVSH':'vat',\n      'Çmimi me pakicë':'retail-price', 'Afati i vlefshmërisë':'validity'\n    };\n    // ${VISIBLE_CONTRACT_MARKER}: capture rendered header cells only. A hidden\n    // column can still exist in the DOM; treating its 0px box as a 44px column\n    // was the source of the Favorites/Notes "second table" regression.\n    const seen = new Set();\n    const columns = Array.from(header.children).flatMap(cell => {\n      const raw = String(cell.dataset.registryColumnKey || cell.dataset.columnKey || '').trim();\n      const key = sourceToUnified[raw] || raw;\n      if (!key || seen.has(key)) return [];\n      const rect = cell.getBoundingClientRect();\n      const style = typeof window.getComputedStyle === 'function' ? window.getComputedStyle(cell) : null;\n      const visible = !cell.hidden\n        && cell.getAttribute('aria-hidden') !== 'true'\n        && (!style || (style.display !== 'none' && style.visibility !== 'hidden'))\n        && rect.width >= 1\n        && rect.height >= 1;\n      if (!visible) return [];\n      seen.add(key);\n      return [{ key, width:Math.max(44, Math.round(rect.width)), label:String(cell.textContent || '').replace(/[▲▼↕]/g, '').replace(/\\s+/g, ' ').trim() }];\n    });\n    if (columns.length < 2) return false;\n    window.MEDINDEX_MAIN_TABLE_CONTRACT = Object.freeze({\n      version:'${VISIBLE_CONTRACT_MARKER}',\n      columns:Object.freeze(columns.map(column => Object.freeze(column))),\n      keys:Object.freeze(columns.map(column => column.key)),\n      width:Math.max(0, Math.round(table.getBoundingClientRect().width || 0)),\n      capturedAt:Date.now(),\n    });\n    window.MEDINDEX_PERSONAL_TABLE_CONTRACT_LOCK = true;\n    window.dispatchEvent(new CustomEvent('medindex:main-table-contract', { detail:window.MEDINDEX_MAIN_TABLE_CONTRACT }));\n    return true;\n  }\n\n  function requestPersonalRuntime() {`,
      'personal runtime entry',
    );
  }

  if (!source.includes(`${MARKER}: lock before full-data handoff`)) {
    source = replaceOnce(
      source,
      `    const loader = window.MEDINDEX_LOAD_FULL_REGISTRY;`,
      `    // ${MARKER}: lock before full-data handoff\n    lockVisibleMainTableContract();\n    const loader = window.MEDINDEX_LOAD_FULL_REGISTRY;`,
      'resilient full registry loader',
    );
  }

  source = replaceRegex(
    source,
    /  function ensureSidebarNotes\(\) \{[\s\S]*?\n  \}\n\n  function ensureToolbarViews\(\) \{/,
    `  function ensureSidebarNotes() {\n    if (phoneLiteOwnsViewport()) return;\n    const tools = document.querySelector('.mi-menu-group-tools');\n    if (!tools) return;\n\n    let favorite = document.querySelector('[data-nav="favorites"]');\n    if (!favorite) {\n      favorite = document.createElement('button');\n      favorite.type = 'button';\n      favorite.className = 'app-menu-link mi-menu-item';\n      favorite.dataset.nav = 'favorites';\n      favorite.setAttribute('aria-label', 'Favoritet');\n      favorite.innerHTML = '<span class="app-menu-icon mi-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg></span><span class="app-menu-title mi-menu-label">Favoritet</span><span class="nav-mini-count mi-menu-badge" id="favoriteNavCount">' + favorites.size + '</span>';\n      const search = tools.querySelector('[data-nav="search"]');\n      if (search) tools.insertBefore(favorite, search);\n      else tools.appendChild(favorite);\n    }\n\n    if (document.querySelector('[data-nav="notes"]')) return;\n    const item = document.createElement('button');\n    item.type = 'button';\n    item.className = favorite.className;\n    item.dataset.nav = 'notes';\n    item.setAttribute('aria-label', 'Shënimet');\n    item.innerHTML = '<span class="app-menu-icon mi-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></span><span class="app-menu-title mi-menu-label">Shënimet</span><span class="nav-mini-count mi-menu-badge" id="notesNavCount">' + noteCount() + '</span>';\n    favorite.insertAdjacentElement('afterend', item);\n  }\n\n  function ensureToolbarViews() {`,
    'sidebar personal navigation',
  );

  write(file, source);
}

function patchUnifiedTable() {
  const file = 'registry-unified-table.js';
  let source = read(file);

  if (!source.includes(`${MARKER}: exact main-table contract`)) {
    source = replaceOnce(
      source,
      `  const currentView = () => document.documentElement.dataset.registryUxView === 'full' ? 'full' : 'clinical';
  const currentOrder = () => currentView() === 'full' ? FULL_ORDER : CLINICAL_ORDER;
  const isMobile = () => window.innerWidth <= MOBILE_BREAKPOINT;`,
      `  const currentView = () => document.documentElement.dataset.registryUxView === 'full' ? 'full' : 'clinical';
  // ${MARKER}: exact main-table contract
  function mainTableContract() {
    const value = window.MEDINDEX_MAIN_TABLE_CONTRACT;
    const columns = Array.isArray(value?.columns) ? value.columns : [];
    const keys = columns.map(column => clean(column?.key)).filter(key => VALID_KEYS.has(key));
    return keys.length >= 2 ? { ...value, columns, keys } : null;
  }
  function contractLocked() {
    return Boolean(window.MEDINDEX_PERSONAL_TABLE_CONTRACT_LOCK && mainTableContract());
  }
  function contractWidth(key) {
    const contract = mainTableContract();
    const width = Number(contract?.columns?.find(column => column.key === key)?.width || 0);
    return Number.isFinite(width) && width >= 44 ? width : (WIDTHS[key] || 150);
  }
  const currentOrder = () => {
    const base = currentView() === 'full' ? FULL_ORDER : CLINICAL_ORDER;
    if (!contractLocked()) return base;
    const keys = mainTableContract().keys.filter(key => base.includes(key));
    return [...keys, ...base.filter(key => !keys.includes(key))];
  };
  const isMobile = () => window.innerWidth <= MOBILE_BREAKPOINT;`,
      'unified current-order contract',
    );
  }

  source = replaceOnce(
    source,
    `    const required = new Set(DYNAMIC_KEYS);`,
    `    const required = contractLocked() ? new Set(mainTableContract().keys) : new Set(DYNAMIC_KEYS);`,
    'required-column contract',
  );

  if (!source.includes(`${MARKER}: visibility follows captured main table`)) {
    source = replaceRegex(
      source,
      /  function keyVisible\(key\) \{\n/,
      `  function keyVisible(key) {
    // ${MARKER}: visibility follows captured main table
    if (contractLocked() && !mainTableContract().keys.includes(key)) return false;
`,
      'column visibility contract',
    );
  }

  source = source.replace(
    /visible\.reduce\(\(sum, key\) => sum \+ \(WIDTHS\[key\] \|\| 150\), 0\)/,
    'visible.reduce((sum, key) => sum + (contractLocked() ? contractWidth(key) : (WIDTHS[key] || 150)), 0)',
  );
  source = source.replace(
    /if \(keyVisible\(key\)\) col\.style\.width = `\$\{WIDTHS\[key\] \|\| 150\}px`;/,
    'if (keyVisible(key)) col.style.width = `\${contractLocked() ? contractWidth(key) : (WIDTHS[key] || 150)}px`;',
  );

  if (!source.includes(`${MARKER}: non-destructive contract visibility`)) {
    source = replaceOnce(
      source,
      `  function updateCellLabels(header, tbody) {`,
      `  // ${MARKER}: non-destructive contract visibility
  function applyContractVisibility(header, tbody) {
    const locked = contractLocked();
    const visible = new Set(locked ? mainTableContract().keys : currentOrder());
    [header, ...Array.from(tbody.children)].forEach(container => {
      Array.from(container.children).forEach(cell => {
        const key = directKey(cell) || (cell.tagName === 'TH' ? headerKey(cell) : '');
        if (!VALID_KEYS.has(key)) return;
        if (locked && !visible.has(key)) {
          cell.dataset.registryPersonalContractHidden = '${MARKER}';
          cell.style.setProperty('display', 'none', 'important');
        } else if (cell.dataset.registryPersonalContractHidden === '${MARKER}') {
          delete cell.dataset.registryPersonalContractHidden;
          cell.style.removeProperty('display');
        }
      });
    });
  }

  function updateCellLabels(header, tbody) {`,
      'contract visibility function',
    );
  }

  source = replaceOnce(
    source,
    `      updateCellLabels(header, tbody);
      rebuildColgroup(table, wrapper, order);`,
    `      updateCellLabels(header, tbody);
      applyContractVisibility(header, tbody);
      rebuildColgroup(table, wrapper, order);`,
    'contract visibility reconcile call',
  );

  if (!source.includes(`${MARKER}: contract lifecycle`)) {
    source = replaceOnce(
      source,
      `    document.addEventListener('click', event => {`,
      `    // ${MARKER}: contract lifecycle
    window.addEventListener('medindex:main-table-contract', () => { lastGeometry = ''; schedule(); });
    document.addEventListener('click', event => {
      if (event.target.closest?.('#colPickerBtn,#colPanel')) {
        window.MEDINDEX_PERSONAL_TABLE_CONTRACT_LOCK = false;
        lastGeometry = '';
        schedule();
      }`,
      'unified click binding',
    );
  }

  write(file, source);
}

function patchPersonalCss() {
  const file = 'registry-user-personalization.css';
  let source = read(file);
  if (source.includes(MARKER)) return;
  source += `\n\n/* ${MARKER}: personal navigation is a first-class desktop tool. */\n@media (min-width:768px){\n  html.medindex-tailadmin body .mi-menu-group-tools > [data-nav="favorites"],\n  html.medindex-tailadmin body .mi-menu-group-tools > [data-nav="notes"]{\n    display:flex!important;\n    visibility:visible!important;\n  }\n}\n`;
  write(file, source);
}

function verify() {
  const personal = read('registry-user-personalization.js');
  const unified = read('registry-unified-table.js');
  const css = read('registry-user-personalization.css');
  const required = [
    [personal, `${MARKER}: capture visible main-table contract`, 'main table capture'],
    [personal, VISIBLE_CONTRACT_MARKER, 'visible-only table capture'],
    [personal, `style.display !== 'none'`, 'hidden display exclusion'],
    [personal, `rect.width >= 1`, 'zero-width hidden column exclusion'],
    [personal, `const seen = new Set();`, 'duplicate column exclusion'],
    [personal, `${MARKER}: lock before full-data handoff`, 'pre-handoff lock'],
    [personal, `window.MEDINDEX_MAIN_TABLE_CONTRACT`, 'captured table contract'],
    [personal, `favorite.dataset.nav = 'favorites'`, 'Favorites navigation recovery'],
    [unified, `${MARKER}: exact main-table contract`, 'unified table contract'],
    [unified, `contractLocked() ? new Set(mainTableContract().keys)`, 'contract columns synthesized'],
    [unified, `${MARKER}: non-destructive contract visibility`, 'same-column visibility'],
    [unified, `contractLocked() ? contractWidth(key)`, 'captured width preservation'],
    [css, MARKER, 'personal navigation CSS'],
  ];
  for (const [source, needle, label] of required) {
    if (!source.includes(needle)) throw new Error(`${MARKER}: missing ${label}.`);
  }
}

patchPersonalization();
patchUnifiedTable();
patchPersonalCss();
verify();

console.log('Favorites/Notes same-table gate applied: only rendered main-table columns are captured; hidden columns stay hidden, visible order/widths are preserved, and no alternate registry UI is introduced.');
