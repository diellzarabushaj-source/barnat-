'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const js = read('registry-unified-table.js');
const css = read('registry-unified-table.css');
const html = read('index.html');

const RELEASE = 'registry-canonical-main-table-v1';

assert.match(js, new RegExp(`const VERSION = '${RELEASE}'`), 'canonical registry release marker missing');
assert.ok(js.includes("const currentView = () => 'full';"), 'registry must have one full canonical view');
assert.ok(js.includes('return FULL_ORDER;'), 'full canonical order must remain the fallback outside a captured personal-view contract');
assert.ok(!js.includes('tableWrap.before(replacement)'), 'alternate clinical/full toolbar must not be mounted');
assert.ok(!/function\s+buildToolbar\b/.test(js), 'alternate clinical/full toolbar builder must not survive in production runtime');
assert.ok(!js.includes('Fokus klinik') && !js.includes('Tabela e plotë'), 'legacy alternate-view labels must not survive in production runtime');
assert.ok(js.includes("document.getElementById('registryViewToolbar')?.remove();"), 'stale alternate toolbar must be removed');
assert.ok(js.includes("document.documentElement.dataset.registryFiltersOpen = 'true';"), 'main registry controls must remain visible');
assert.ok(!js.includes("if (currentView() === 'clinical') CLINICAL_BASE_KEYS"), 'clinical-only synthetic base columns must not return');
assert.ok(!js.includes("if (currentView() === 'clinical' && !CLINICAL_ORDER.includes(key))"), 'clinical projection must not hide canonical columns');

// Column order is deliberately not hard-coded here. Favorites/Notes capture the
// exact header already visible in the main registry and reuse that order during
// the data handoff, which is stricter than maintaining a second baked-in order.
assert.ok(js.includes('MEDINDEX_MAIN_TABLE_CONTRACT') || js.includes('const currentOrder = () => FULL_ORDER;'), 'table order must come from the main registry or the canonical full fallback');

assert.ok(css.includes(RELEASE), 'canonical table CSS release marker missing');
assert.match(
  css,
  /#registryViewToolbar\.registry-view-toolbar-unified,[\s\S]*?#registryViewToolbar,[\s\S]*?\.registry-view-toolbar-unified[\s\S]*?display:none!important/,
  'alternate registry toolbar must be force-hidden with specificity at least as strong as the legacy rule',
);
const canonicalGuardIndex = css.lastIndexOf(`/* ${RELEASE} — one visible registry table owner. */`);
const legacyFlexIndex = css.lastIndexOf('display:flex!important');
assert.ok(canonicalGuardIndex > legacyFlexIndex, 'canonical toolbar hide guard must come after every legacy display:flex!important rule in the CSS cascade');
const canonicalTail = css.slice(canonicalGuardIndex).trim();
assert.ok(canonicalTail.endsWith('}'), 'canonical toolbar hide guard must remain the final CSS rule');
assert.ok(canonicalTail.includes('display:none!important'), 'final canonical CSS rule must force-hide the retired toolbar');

assert.match(html, /data-registry-ux-view="full"/, 'registry HTML must boot in full canonical mode');
assert.ok(html.includes(`registry-unified-table.css?v=${RELEASE}`), 'canonical CSS version must be published');
assert.ok(html.includes(`registry-unified-table.js?v=${RELEASE}`), 'canonical JS version must be published');
assert.ok(!html.includes('data-registry-ux-view="clinical"'), 'HTML must never boot the alternate clinical projection');

console.log('✓ Canonical registry table gate passed: one main table, no alternate clinical/full UI or dead toolbar source, visible-column contracts are preserved, and the final CSS cascade cannot revive the retired toolbar.');
