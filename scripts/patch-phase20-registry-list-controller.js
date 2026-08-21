'use strict';

/* Phase 20 — controller-level Registry List ownership.
 *
 * Phase 19 prevents List from waking the full table runtime for data. This layer
 * covers the remaining legitimate case: the full runtime may already exist.
 * When List owns the registry surface, the unified-table controller must stop
 * building chrome, stop reconciling table geometry, and disconnect its table
 * observer. Returning to Table deterministically resumes it.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'registry-unified-table.js');
if (!fs.existsSync(FILE)) throw new Error('Registry List Phase 20: mungon registry-unified-table.js.');

let source = fs.readFileSync(FILE, 'utf8').replace(/\r\n?/g, '\n');

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Registry List Phase 20: nuk u gjet ${label}.`);
  source = source.replace(before, after);
}

replaceOnce(
  `  const isMobile = () => window.innerWidth <= MOBILE_BREAKPOINT;`,
  `  const isMobile = () => window.innerWidth <= MOBILE_BREAKPOINT;\n  const listOwnsRegistrySurface = () => document.documentElement.dataset.miRegistryView === 'list';`,
  'surface ownership helper',
);

replaceOnce(
  `  function reconcile() {\n    scheduled = false;\n    if (reconciling) return;`,
  `  function reconcile() {\n    scheduled = false;\n    if (listOwnsRegistrySurface()) {\n      observer?.disconnect();\n      lastGeometry = '';\n      return;\n    }\n    if (reconciling) return;`,
  'reconcile ownership gate',
);

replaceOnce(
  `  function schedule() {\n    if (scheduled) return;\n    scheduled = true;\n    requestAnimationFrame(reconcile);\n  }`,
  `  function schedule() {\n    if (listOwnsRegistrySurface()) {\n      observer?.disconnect();\n      scheduled = false;\n      return;\n    }\n    if (scheduled) return;\n    scheduled = true;\n    requestAnimationFrame(reconcile);\n  }`,
  'schedule ownership gate',
);

replaceOnce(
  `  function observeTable() {\n    const header = document.getElementById('headerRow');`,
  `  function observeTable() {\n    if (listOwnsRegistrySurface()) {\n      observer?.disconnect();\n      return;\n    }\n    const header = document.getElementById('headerRow');`,
  'table observer ownership gate',
);

replaceOnce(
  `  function ensureShell() {\n    const tableWrap = document.getElementById('registryContent');`,
  `  function ensureShell() {\n    if (listOwnsRegistrySurface()) {\n      const existing = document.getElementById('registryViewToolbar');\n      if (existing) {\n        existing.hidden = true;\n        existing.setAttribute('aria-hidden', 'true');\n        if ('inert' in existing) existing.inert = true;\n      }\n      return;\n    }\n    const tableWrap = document.getElementById('registryContent');`,
  'shell ownership gate',
);

replaceOnce(
  `      toolbar = replacement;\n    }\n\n    panel.id = 'registryFilterPanel';`,
  `      toolbar = replacement;\n    }\n    toolbar.hidden = false;\n    toolbar.setAttribute('aria-hidden', 'false');\n    if ('inert' in toolbar) toolbar.inert = false;\n\n    panel.id = 'registryFilterPanel';`,
  'deterministic toolbar resume',
);

const startAnchor = `    bindControls();\n    ensureShell();\n    observeTable();\n    schedule();`;
const startReplacement = `    bindControls();\n\n    const surfaceObserver = new MutationObserver(records => {\n      if (!records.some(record => record.attributeName === 'data-mi-registry-view')) return;\n      lastGeometry = '';\n      if (listOwnsRegistrySurface()) {\n        observer?.disconnect();\n        const toolbar = document.getElementById('registryViewToolbar');\n        if (toolbar) {\n          toolbar.hidden = true;\n          toolbar.setAttribute('aria-hidden', 'true');\n          if ('inert' in toolbar) toolbar.inert = true;\n        }\n        return;\n      }\n      ensureShell();\n      observeTable();\n      schedule();\n    });\n    surfaceObserver.observe(document.documentElement, {\n      attributes:true,\n      attributeFilter:['data-mi-registry-view'],\n    });\n\n    ensureShell();\n    observeTable();\n    schedule();`;
replaceOnce(startAnchor, startReplacement, 'surface transition observer');

for (const invariant of [
  "listOwnsRegistrySurface = () => document.documentElement.dataset.miRegistryView === 'list'",
  'if (listOwnsRegistrySurface()) {\n      observer?.disconnect();\n      lastGeometry =',
  'function observeTable() {\n    if (listOwnsRegistrySurface())',
  'function ensureShell() {\n    if (listOwnsRegistrySurface())',
  "attributeFilter:['data-mi-registry-view']",
  "toolbar.setAttribute('aria-hidden', 'false')",
]) {
  if (!source.includes(invariant)) throw new Error(`Registry List Phase 20 invariant mungon: ${invariant}`);
}

fs.writeFileSync(FILE, source, 'utf8');
execFileSync(process.execPath, ['--check', FILE], { cwd:ROOT, stdio:'pipe' });
console.log('Registry List Phase 3: unified-table controller ndalet në List mode dhe rifillon deterministikisht vetëm në Table mode.');
