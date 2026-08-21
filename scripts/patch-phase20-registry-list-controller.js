'use strict';

/* Phase 20 — controller-level Registry List ownership.
 *
 * Phase 19 prevents List from waking the full table runtime for data. This layer
 * covers the remaining legitimate case: the full runtime may already exist.
 * When List owns the registry surface, the unified-table controller must stop
 * building chrome, stop reconciling table geometry, and disconnect its table
 * observer. Returning to Table deterministically resumes it.
 *
 * IMPORTANT: this patch runs after many older build patches. It deliberately
 * injects at function boundaries instead of matching complete function bodies,
 * so normal composition changes cannot disable the ownership contract.
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

function injectFunctionGate(name, marker, body) {
  if (source.includes(marker)) return;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^\\s*function\\s+${escaped}\\([^\\n]*\\)\\s*\\{\\s*\\n)`, 'm');
  if (!pattern.test(source)) throw new Error(`Registry List Phase 20: funksioni ${name} nuk u gjet.`);
  source = source.replace(pattern, `$1${body}`);
  if (!source.includes(marker)) throw new Error(`Registry List Phase 20: guard-i për ${name} nuk u instalua.`);
}

replaceOnce(
  `  const isMobile = () => window.innerWidth <= MOBILE_BREAKPOINT;`,
  `  const isMobile = () => window.innerWidth <= MOBILE_BREAKPOINT;\n  const listOwnsRegistrySurface = () => document.documentElement.dataset.miRegistryView === 'list';`,
  'surface ownership helper',
);

injectFunctionGate(
  'reconcile',
  'registry-list-owner:reconcile',
  `    /* registry-list-owner:reconcile */\n    if (listOwnsRegistrySurface()) {\n      observer?.disconnect();\n      scheduled = false;\n      lastGeometry = '';\n      return;\n    }\n`,
);

injectFunctionGate(
  'schedule',
  'registry-list-owner:schedule',
  `    /* registry-list-owner:schedule */\n    if (listOwnsRegistrySurface()) {\n      observer?.disconnect();\n      scheduled = false;\n      return;\n    }\n`,
);

injectFunctionGate(
  'observeTable',
  'registry-list-owner:observe',
  `    /* registry-list-owner:observe */\n    if (listOwnsRegistrySurface()) {\n      observer?.disconnect();\n      return;\n    }\n`,
);

injectFunctionGate(
  'ensureShell',
  'registry-list-owner:shell',
  `    /* registry-list-owner:shell */\n    if (listOwnsRegistrySurface()) {\n      const existing = document.getElementById('registryViewToolbar');\n      if (existing) {\n        existing.hidden = true;\n        existing.setAttribute('aria-hidden', 'true');\n        if ('inert' in existing) existing.inert = true;\n      }\n      return;\n    }\n`,
);

if (!source.includes('registry-list-owner:surface-observer')) {
  const bootPattern = /(^\s*if \(document\.readyState === 'loading'\)[^\n]*$)/m;
  const match = source.match(bootPattern);
  if (!match) throw new Error('Registry List Phase 20: boot anchor nuk u gjet.');
  const observerBlock = `  /* registry-list-owner:surface-observer */\n  const registrySurfaceOwnershipObserver = new MutationObserver(records => {\n    if (!records.some(record => record.attributeName === 'data-mi-registry-view')) return;\n    lastGeometry = '';\n    const toolbar = document.getElementById('registryViewToolbar');\n    if (listOwnsRegistrySurface()) {\n      observer?.disconnect();\n      if (toolbar) {\n        toolbar.hidden = true;\n        toolbar.setAttribute('aria-hidden', 'true');\n        if ('inert' in toolbar) toolbar.inert = true;\n      }\n      return;\n    }\n    if (toolbar) {\n      toolbar.hidden = false;\n      toolbar.setAttribute('aria-hidden', 'false');\n      if ('inert' in toolbar) toolbar.inert = false;\n    }\n    ensureShell();\n    observeTable();\n    schedule();\n  });\n  registrySurfaceOwnershipObserver.observe(document.documentElement, {\n    attributes:true,\n    attributeFilter:['data-mi-registry-view'],\n  });\n\n`;
  source = source.replace(bootPattern, `${observerBlock}$1`);
}

for (const invariant of [
  "listOwnsRegistrySurface = () => document.documentElement.dataset.miRegistryView === 'list'",
  'registry-list-owner:reconcile',
  'registry-list-owner:schedule',
  'registry-list-owner:observe',
  'registry-list-owner:shell',
  'registry-list-owner:surface-observer',
  "attributeFilter:['data-mi-registry-view']",
  "toolbar.setAttribute('aria-hidden', 'false')",
]) {
  if (!source.includes(invariant)) throw new Error(`Registry List Phase 20 invariant mungon: ${invariant}`);
}

fs.writeFileSync(FILE, source, 'utf8');
execFileSync(process.execPath, ['--check', FILE], { cwd:ROOT, stdio:'pipe' });
console.log('Registry List Phase 3: unified-table controller ndalet në List mode dhe rifillon deterministikisht vetëm në Table mode.');
