'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Phase 10 desktop-lite patch could not find ${label}.`);
  return source.replace(before, after);
}

function patchIndex() {
  let source = read('index.html');
  source = source.replace(/<link rel="preload" href="app-runtime-performance\.js\?v=[^"]+" as="script">\n?/g, '');

  const mobilePattern = /<script src="registry-mobile-phase4\.js\?v=20260812-2(?:&[^"]*)?" defer><\/script>/;
  const desktopPattern = /<script src="registry-desktop-lite\.js\?v=20260812-1(?:&[^"]*)?" defer><\/script>/;

  if (!desktopPattern.test(source)) {
    const mobileMatch = source.match(mobilePattern);
    if (!mobileMatch) throw new Error('Phase 10 desktop-lite index mobile anchor is missing.');
    const buildQuery = mobileMatch[0].match(/&build=[^"]+/)?.[0] || '';
    const desktopScript = `<script src="registry-desktop-lite.js?v=20260812-1${buildQuery}" defer></script>`;
    source = source.replace(mobilePattern, `${mobileMatch[0]}\n${desktopScript}`);
  }

  source = source.replace(/registry-runtime-loader\.js\?v=[^"&]+/g, 'registry-runtime-loader.js?v=20260813-10');

  const desktopIndex = source.search(desktopPattern);
  const loaderIndex = source.indexOf('registry-runtime-loader.js?v=20260813-10');
  if (desktopIndex < 0 || loaderIndex < 0 || desktopIndex > loaderIndex) {
    throw new Error('Phase 10 desktop-lite must load before the runtime loader.');
  }
  write('index.html', source);
}

function patchRuntimeLoader() {
  const source = read('registry-runtime-loader.js');

  // Phase 1 now owns phone renderer safety. Phase 10 must verify that contract,
  // not recreate the old v8 5-second mobile timeout implementation.
  /* Njësoj si te Faza 1: kontrata është "një ngarkues i vetëm", jo numri i tij. */
  if (!/const VERSION = 'registry-runtime-loader-v\d+';/.test(source)) {
    throw new Error('Phase 10 requires the single-owner registry-runtime-loader contract.');
  }
  if (!source.includes('function desktopLiteCandidate()')) {
    throw new Error('Phase 10 desktop-lite candidate is missing.');
  }
  if (!source.includes('const DESKTOP_LITE_GRACE_MS = 5000;')) {
    throw new Error('Phase 10 desktop-lite fallback timing is missing.');
  }
  if (!source.includes("html.dataset.registryRuntimeMode = 'desktop-lite-deferred'")) {
    throw new Error('Phase 10 desktop-lite deferral is missing.');
  }
  if (!source.includes("scheduleRuntime('desktop-lite-timeout')")) {
    throw new Error('Phase 10 desktop bounded fallback is missing.');
  }
  if (!source.includes('MOBILE_LITE_STALL_MS = 12000') || !source.includes('medindex:mobile-lite-stalled')) {
    throw new Error('Phase 1 mobile stall observability contract is missing.');
  }
  if (!source.includes('medindex:mobile-full-registry-blocked') || !source.includes('isExplicitMobileFullRequest')) {
    throw new Error('Phase 1 mobile single-owner handoff guard is missing.');
  }
  if (source.includes("scheduleRuntime('mobile-lite-timeout')")) {
    throw new Error('Phase 10 must not restore the removed mobile timeout takeover.');
  }
  if (source.includes("scheduleRuntime('desktop-or-legacy')")) {
    throw new Error('Phase 10 must not eagerly load the full desktop registry.');
  }

  // Deliberately leave the audited loader unchanged.
  write('registry-runtime-loader.js', source);
}

function patchRegistryPopulationMetadata() {
  let source = read('api/drug-search.js');
  source = replaceOnce(
    source,
    `const RegistryRevision = require('../lib/registry-revision.js');\nconst { neonRequest, exactCount } = require('../lib/neon-data-api.js');`,
    `const RegistryRevision = require('../lib/registry-revision.js');\nconst ApprovedPopulation = require('../lib/approved-population-handler.js');\nconst { neonRequest, exactCount } = require('../lib/neon-data-api.js');`,
    'approved-population server dependency',
  );
  source = replaceOnce(
    source,
    `const clean = value => String(value ?? '').replace(/\\s+/g, ' ').trim();\nfunction normalize(value) {`,
    `const clean = value => String(value ?? '').replace(/\\s+/g, ' ').trim();\nlet approvedPopulationIndex = null;\n\nfunction approvedPopulationForRegistryNumber(value) {\n  const registryNumber = Number(value);\n  if (!Number.isInteger(registryNumber) || registryNumber <= 0) return '';\n  if (!approvedPopulationIndex) {\n    approvedPopulationIndex = new Map(\n      ApprovedPopulation.snapshotItems().map(item => [Number(item.registryNumber), clean(item.approvedPopulation)])\n    );\n  }\n  return clean(approvedPopulationIndex.get(registryNumber));\n}\n\nfunction normalize(value) {`,
    'approved-population page index',
  );
  source = replaceOnce(
    source,
    `    registryNumber:row.registry_number ?? null,\n    pdid:clean(row.pdid),`,
    `    registryNumber:row.registry_number ?? null,\n    approvedPopulation:approvedPopulationForRegistryNumber(row.registry_number),\n    pdid:clean(row.pdid),`,
    'approved-population lightweight row metadata',
  );
  if (!source.includes('ApprovedPopulation.snapshotItems()')) throw new Error('Phase 10 approved-population index is missing.');
  if (!source.includes('approvedPopulation:approvedPopulationForRegistryNumber(row.registry_number)')) {
    throw new Error('Phase 10 lightweight registry rows must carry approved population metadata.');
  }
  write('api/drug-search.js', source);
}

function patchDesktopPopulationMetadata() {
  let source = read('registry-desktop-lite.js');
  source = replaceOnce(
    source,
    `      'Nr rendor':row.registryNumber ?? '',\n      'PDID':clean(row.pdid),`,
    `      'Nr rendor':row.registryNumber ?? '',\n      'Popullata e aprovuar':clean(row.approvedPopulation),\n      'Pediatric only':clean(row.approvedPopulation) === 'Pediatric only' ? 'Pediatric only' : '',\n      'PDID':clean(row.pdid),`,
    'approved-population desktop canonical row',
  );
  if (!source.includes("'Popullata e aprovuar':clean(row.approvedPopulation)")) {
    throw new Error('Phase 10 desktop canonical rows must carry approved population metadata.');
  }
  write('registry-desktop-lite.js', source);
}

function patchDosageRuntime() {
  let source = read('registry-dosage-columns-v3.js');
  source = replaceOnce(
    source,
    `  let registry = { status:'loading', byNumber:new Map(), byDrugKey:new Map() };`,
    `  let registry = { status:'loading', byNumber:new Map(), byDrugKey:new Map() };\n  let registryIndexSource = null;`,
    'dosage registry source identity',
  );

  const oldLoad = `  async function loadRegistry() {\n    try {\n      const rows = await waitForRegistryRows();\n      const byNumber = new Map();\n      const byDrugKey = new Map();\n      for (let start = 0; start < rows.length; start += INDEX_BATCH_SIZE) {\n        const end = Math.min(rows.length, start + INDEX_BATCH_SIZE);\n        for (let index = start; index < end; index += 1) {\n          const row = rows[index];\n          const number = clean(row['Nr rendor']);\n          if (number) byNumber.set(number, row);\n          addUnique(byDrugKey, [row.PDID, row['Emri tregtar'], row['Fortësia']].map(clean).join('|'), row);\n        }\n        if (end < rows.length) await yieldToBrowser();\n      }\n      registry = { status:'ready', byNumber, byDrugKey };\n    } catch (error) {\n      console.error('Regjistri i përbashkët nuk u indeksua për dozimin:', error);\n      registry = { status:'error', byNumber:new Map(), byDrugKey:new Map() };\n    }\n    scheduleEnhance();\n  }`;

  const newLoad = `  async function indexRegistryRows(rows) {\n    if (!Array.isArray(rows) || registryIndexSource === rows) return;\n    registryIndexSource = rows;\n    try {\n      const byNumber = new Map();\n      const byDrugKey = new Map();\n      for (let start = 0; start < rows.length; start += INDEX_BATCH_SIZE) {\n        const end = Math.min(rows.length, start + INDEX_BATCH_SIZE);\n        for (let index = start; index < end; index += 1) {\n          const row = rows[index];\n          const number = clean(row['Nr rendor']);\n          if (number) byNumber.set(number, row);\n          addUnique(byDrugKey, [row.PDID, row['Emri tregtar'], row['Fortësia']].map(clean).join('|'), row);\n        }\n        if (end < rows.length) await yieldToBrowser();\n      }\n      registry = { status:'ready', byNumber, byDrugKey };\n      scheduleEnhance();\n    } catch (error) {\n      registryIndexSource = null;\n      throw error;\n    }\n  }\n\n  async function loadRegistry() {\n    try {\n      await indexRegistryRows(await waitForRegistryRows());\n    } catch (error) {\n      console.error('Regjistri i përbashkët nuk u indeksua për dozimin:', error);\n      registry = { status:'error', byNumber:new Map(), byDrugKey:new Map() };\n      scheduleEnhance();\n    }\n  }\n\n  function refreshRegistryFromEvent(event) {\n    const rows = event.detail?.rows || window.MEDINDEX_REGISTRY_ROWS;\n    if (!Array.isArray(rows)) return;\n    void indexRegistryRows(rows).catch(error => {\n      console.warn('Indeksi i dozimit nuk u rifreskua për faqen e re:', error);\n    });\n  }`;
  source = replaceOnce(source, oldLoad, newLoad, 'dosage page-aware registry index');
  source = replaceOnce(
    source,
    `  applyVisibility();\n  startObservers();`,
    `  window.addEventListener('medindex:registry-page-ready', refreshRegistryFromEvent);\n  window.addEventListener('medindex:registry-data-ready', refreshRegistryFromEvent);\n\n  applyVisibility();\n  startObservers();`,
    'dosage page refresh events',
  );
  if (!source.includes("window.addEventListener('medindex:registry-page-ready', refreshRegistryFromEvent)")) {
    throw new Error('Phase 10 dosage runtime is not page-aware.');
  }
  if (!source.includes('registryIndexSource === rows')) throw new Error('Phase 10 dosage reindex must deduplicate the same row source.');
  write('registry-dosage-columns-v3.js', source);
}

function verifyPopulationMarker() {
  const source = read('registry-dose-clinical-row-markers.js');
  if (/fetch\s*\(/.test(source)) throw new Error('Phase 10 row markers must not perform a population API request.');
  if (source.includes('/api/pediatric-only-population')) throw new Error('Phase 10 row markers must not depend on the legacy population endpoint.');
  if (!source.includes("window.addEventListener('medindex:registry-page-ready', onRegistryDataReady)")) {
    throw new Error('Phase 10 row markers must refresh from each lightweight registry page.');
  }
  if (!source.includes("item['Popullata e aprovuar']")) {
    throw new Error('Phase 10 row markers must read approved population from local row metadata.');
  }
}

patchIndex();
patchRuntimeLoader();
patchRegistryPopulationMetadata();
patchDesktopPopulationMetadata();
patchDosageRuntime();
verifyPopulationMarker();
console.log('Phase 10 desktop lightweight registry, inline approved population, v10 single-owner mobile loader, deferred full runtime and page-aware targeted dosage patch passed.');