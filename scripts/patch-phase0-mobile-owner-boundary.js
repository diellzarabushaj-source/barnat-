'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Phase 0 mobile owner boundary could not find ${label}.`);
  return source.replace(before, after);
}

function patchUnifiedTable() {
  let source = read('registry-unified-table.js');

  source = replaceOnce(
    source,
    `  const MOBILE_BREAKPOINT = 1199;`,
    `  const MOBILE_BREAKPOINT = 1199;\n  const PHONE_OWNER_QUERY = '(max-width: 767px)';`,
    'unified table phone owner constant',
  );

  source = replaceOnce(
    source,
    `  const isMobile = () => window.innerWidth <= MOBILE_BREAKPOINT;`,
    `  const isMobile = () => window.innerWidth <= MOBILE_BREAKPOINT;\n  const phoneRegistryOwnsViewport = () => window.matchMedia?.(PHONE_OWNER_QUERY)?.matches === true\n    && document.documentElement.dataset.registryMobileLiteState !== 'handoff';\n\n  function deferUnifiedTableForPhone() {\n    const toolbar = document.getElementById('registryViewToolbar');\n    if (toolbar?.classList.contains('registry-view-toolbar-unified')) toolbar.remove();\n    document.documentElement.dataset.registryUnifiedTableState = 'phone-deferred';\n  }`,
    'unified table phone owner helper',
  );

  source = replaceOnce(
    source,
    `  function reconcile() {\n    scheduled = false;\n    if (reconciling) return;`,
    `  function reconcile() {\n    scheduled = false;\n    if (phoneRegistryOwnsViewport()) {\n      deferUnifiedTableForPhone();\n      return;\n    }\n    if (reconciling) return;`,
    'reconcile phone owner guard',
  );

  source = replaceOnce(
    source,
    `  function ensureShell() {\n    const tableWrap = document.getElementById('registryContent');`,
    `  function ensureShell() {\n    if (phoneRegistryOwnsViewport()) {\n      deferUnifiedTableForPhone();\n      return;\n    }\n    document.documentElement.dataset.registryUnifiedTableState = 'active';\n    const tableWrap = document.getElementById('registryContent');`,
    'shell phone owner guard',
  );

  source = replaceOnce(
    source,
    `    window.addEventListener('resize', () => {\n      lastGeometry = '';\n      schedule();\n    }, { passive:true });`,
    `    window.addEventListener('medindex:request-full-registry', () => {\n      lastGeometry = '';\n      requestAnimationFrame(() => {\n        ensureShell();\n        schedule();\n      });\n    });\n    window.addEventListener('resize', () => {\n      lastGeometry = '';\n      if (phoneRegistryOwnsViewport()) deferUnifiedTableForPhone();\n      else ensureShell();\n      schedule();\n    }, { passive:true });`,
    'unified table handoff and resize recovery',
  );

  const reconcileIndex = source.indexOf('function reconcile()');
  const ensureColumnsIndex = source.indexOf('ensureRequiredColumns(header, tbody)', reconcileIndex);
  const reconcileGuardIndex = source.indexOf('if (phoneRegistryOwnsViewport())', reconcileIndex);
  const shellIndex = source.indexOf('function ensureShell()');
  const buildToolbarIndex = source.indexOf('buildToolbar()', shellIndex);
  const shellGuardIndex = source.indexOf('if (phoneRegistryOwnsViewport())', shellIndex);

  if (!source.includes("const PHONE_OWNER_QUERY = '(max-width: 767px)'")) throw new Error('Phase 0 unified-table phone breakpoint is missing.');
  if (!(reconcileGuardIndex > reconcileIndex && reconcileGuardIndex < ensureColumnsIndex)) throw new Error('Phase 0 reconcile guard must run before synthetic columns.');
  if (!(shellGuardIndex > shellIndex && shellGuardIndex < buildToolbarIndex)) throw new Error('Phase 0 shell guard must run before shared toolbar creation.');
  if (!source.includes("window.addEventListener('medindex:request-full-registry'")) throw new Error('Phase 0 explicit full-registry recovery hook is missing.');

  write('registry-unified-table.js', source);
}

function patchCellPreview() {
  let source = read('registry-cell-preview.js');

  source = replaceOnce(
    source,
    `  function shouldPreviewCell(cell, text) {\n    if (!cell || !text || hasExistingControl(cell)) return false;`,
    `  function shouldPreviewCell(cell, text) {\n    if (!cell || !text || cell.closest('.mobile-lite-row') || hasExistingControl(cell)) return false;`,
    'cell preview mobile-lite eligibility guard',
  );

  source = replaceOnce(
    source,
    `  function enhanceCell(cell) {\n    if (!(cell instanceof HTMLTableCellElement)) return;\n    restoreCanonicalSource(cell);`,
    `  function enhanceCell(cell) {\n    if (!(cell instanceof HTMLTableCellElement)) return;\n    if (cell.closest('.mobile-lite-row')) {\n      if (cell.hasAttribute(PREVIEW_ATTR) || cell.querySelector(\`:scope > .\${TRIGGER_CLASS}\`)) removePreview(cell);\n      return;\n    }\n    restoreCanonicalSource(cell);`,
    'cell preview mobile-lite cleanup guard',
  );

  source = replaceOnce(
    source,
    `    tableObserver.observe(tbody, {\n      childList:true,\n      subtree:true,\n      characterData:true,\n      attributes:true,\n      attributeFilter:['class', 'data-registry-row-expanded'],\n    });`,
    `    // Nested child insertion is still needed for dosage/clinical controls, but\n    // text/class/aria churn must not retrigger a full visible-cell scan.\n    tableObserver.observe(tbody, { childList:true, subtree:true });`,
    'cell preview lean mutation observer',
  );

  const initAnchor = `    window.addEventListener('medindex:registry-table-stable', activate);\n    ['medindex:registry-data-ready', 'medindex:tailadmin-ready']`;
  const eventDriven = `    window.addEventListener('medindex:registry-table-stable', activate);\n    window.addEventListener('medindex:registry-row-expanded-change', event => {\n      const row = event.detail?.row;\n      if (!row?.isConnected) return;\n      row.querySelectorAll(\`.\${TRIGGER_CLASS}\`).forEach(syncTriggerState);\n    });\n    ['medindex:registry-data-ready', 'medindex:tailadmin-ready']`;
  source = replaceOnce(source, initAnchor, eventDriven, 'cell preview row-expanded event sync');

  if (!source.includes("cell.closest('.mobile-lite-row')")) throw new Error('Phase 0 cell-preview phone guard is missing.');
  if (!source.includes('tableObserver.observe(tbody, { childList:true, subtree:true });')) {
    throw new Error('Phase 0 cell-preview must retain only child-list subtree observation.');
  }
  if (/characterData\s*:\s*true|attributes\s*:\s*true|attributeFilter\s*:/.test(source.slice(source.indexOf('function connectObserver()'), source.indexOf('function enhanceVisibleCells()')))) {
    throw new Error('Phase 0 cell-preview observer must not watch text or attribute churn.');
  }
  if (!source.includes("window.addEventListener('medindex:registry-row-expanded-change'")) {
    throw new Error('Phase 0 cell-preview must sync expansion state from the canonical row event.');
  }
  write('registry-cell-preview.js', source);
}

function patchSharedPersonalization() {
  let source = read('registry-user-personalization.js');
  const marker = 'registry-personalization-phone-deferred-v1';
  const guard = `  const PHONE_OWNER_QUERY = '(max-width: 767px)';\n  const phoneRegistryOwnsViewport = window.matchMedia?.(PHONE_OWNER_QUERY)?.matches === true\n    && document.documentElement.dataset.registryMobileLiteState !== 'handoff'\n    && (window.MEDINDEX_MOBILE_LITE_ACTIVE === true || Boolean(document.documentElement.dataset.registryMobileLite));\n  if (phoneRegistryOwnsViewport) {\n    document.documentElement.dataset.registryPersonalization = '${marker}';\n    return;\n  }\n\n`;

  if (!source.includes(marker)) {
    const versionMatch = source.match(/  const VERSION = 'registry-user-personalization-v[^']+';\n/);
    if (!versionMatch) throw new Error('Phase 0 shared personalization version declaration is missing.');
    source = source.replace(versionMatch[0], `${versionMatch[0]}${guard}`);
  }

  if (!source.includes("document.documentElement.dataset.registryPersonalization = 'registry-personalization-phone-deferred-v1'")) {
    throw new Error('Phase 0 shared personalization phone guard is missing.');
  }
  write('registry-user-personalization.js', source);
}

patchUnifiedTable();
patchCellPreview();
patchSharedPersonalization();

console.log('Phase 0 phone owner + long-session preview boundary: shared table UI stays deferred on phones and cell previews ignore text/attribute mutation churn.');