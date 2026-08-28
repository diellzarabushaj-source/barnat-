'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`PR157 merge-readiness patch could not find ${label}.`);
  return source.replace(before, after);
}

function patchMobilePhase3Owner() {
  let source = read('registry-mobile-phase3.js');

  const directListener = "    window.addEventListener('medindex:full-registry-started', releaseMobileShellOwner, { once:true });";
  const inlineListener = `    window.addEventListener('medindex:full-registry-started', () => {\n      closeFilters();\n      bodyClassObserver?.disconnect();\n      bodyClassObserver = null;\n      document.getElementById('miRegistryBottomNav')?.remove();\n      document.getElementById('miRegistryMobileFilterBar')?.remove();\n      root.dataset.registryMobilePhase3State = 'handoff';\n    }, { once:true });`;

  if (!source.includes(inlineListener)) {
    if (!source.includes(directListener)) {
      throw new Error('Phase 3 accepted full-runtime listener is missing.');
    }
    source = source.replace(directListener, inlineListener);
  }

  if (source.includes("'medindex:full-registry-started', releaseMobileShellOwner")) {
    throw new Error('Phase 3 still registers a free releaseMobileShellOwner reference.');
  }
  write('registry-mobile-phase3.js', source);
}

function patchPhonePersonalControls() {
  let source = read('registry-table-tools.css');
  const marker = '/* PR157 merge readiness: phone personal views remain readable and touch-safe. */';
  if (!source.includes(marker)) {
    source += `\n\n${marker}\n@media (max-width:767px){\n  html[data-registry-mobile-lite] .registry-personal-view-actions button{\n    min-height:44px!important;\n    font-size:12px!important;\n  }\n  html[data-registry-mobile-lite] .registry-personal-view-actions button>b{\n    font-size:11px!important;\n  }\n}\n`;
  }
  if (!source.includes('min-height:44px!important;') || !source.includes('font-size:11px!important;')) {
    throw new Error('Phone personal-view touch/font floor was not materialized.');
  }
  write('registry-table-tools.css', source);
}

function patchPhoneCardDensity() {
  let design = read('registry-table-tools.css');
  design = replaceOnce(
    design,
    'padding:3px 12px 3px 15px;',
    'padding:2px 12px 2px 15px;',
    'final phone card vertical padding',
  );
  design = replaceOnce(
    design,
    'padding:3px 10px 3px 13px;',
    'padding:2px 10px 2px 13px;',
    'final sub-390 card vertical padding',
  );
  write('registry-table-tools.css', design);

  let phone = read('registry-table-tools.css');
  phone = replaceOnce(
    phone,
    'padding:4px 9px 4px 12px;',
    'padding:2px 9px 2px 12px;',
    'final narrow-phone card vertical padding',
  );
  write('registry-table-tools.css', phone);
}

function patchFullDesktopColumnMaterialization() {
  const source = read('registry-unified-table.js');
  // The full view must never materialize every FULL_ORDER key. Normally only
  // dynamic columns are added. During a Favorites/Notes handoff the exact main
  // table contract is allowed instead: it re-materializes only columns that were
  // already visible before the handoff, so it preserves (rather than overrides)
  // the doctor's visible table.
  const dynamicOnly = source.includes('    const required = new Set(DYNAMIC_KEYS);\n');
  const capturedMainTable = source.includes('    const required = contractLocked() ? new Set(mainTableContract().keys) : new Set(DYNAMIC_KEYS);\n');
  if (!dynamicOnly && !capturedMainTable) {
    throw new Error('Full desktop view must not force columns the column picker excluded.');
  }
  if (capturedMainTable && !source.includes('MEDINDEX_MAIN_TABLE_CONTRACT')) {
    throw new Error('Captured main-table materialization is missing its ownership contract.');
  }
}

patchMobilePhase3Owner();
patchPhonePersonalControls();
patchPhoneCardDensity();
patchFullDesktopColumnMaterialization();

console.log('PR157 merge-readiness patch passed: composed mobile owner, touch/font floor, card density and picker-owned/captured-main-table desktop columns.');
