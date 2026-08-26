'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'registry-dose-calculator.js');
const MARKER = 'dose-calculator-visibility-lazy-v1';
const normalize = value => value.replace(/\r\n?/g, '\n');

function boundary(source, functionName, from = 0) {
  const candidates = [
    `  function ${functionName}`,
    `  async function ${functionName}`,
  ].map(needle => ({ needle, index:source.indexOf(needle, from) }))
    .filter(item => item.index >= 0)
    .sort((a, b) => a.index - b.index);
  return candidates[0] || null;
}

function replaceFunction(source, functionName, nextFunctionName, replacement) {
  const start = boundary(source, functionName);
  const next = start ? boundary(source, nextFunctionName, start.index + start.needle.length) : null;
  if (!start || !next || next.index <= start.index) {
    throw new Error(`Dose calculator lazy patch could not find ${functionName}() boundaries.`);
  }
  return source.slice(0, start.index) + replacement.trimEnd() + '\n\n' + source.slice(next.index);
}

let source = normalize(fs.readFileSync(FILE, 'utf8'));
if (!source.includes(MARKER)) {
  const stateAnchor = "  let registry = { status:'loading', byNumber:new Map(), byDrugKey:new Map() };\n  let catalog = { status:'loading', byPdid:new Map(), byRegistryNumber:new Map(), byProductKey:new Map() };";
  if (!source.includes(stateAnchor)) throw new Error('Dose calculator lazy patch could not find registry/catalog state.');
  source = source.replace(stateAnchor, `  // ${MARKER}: keep calculator network, modal and observers out of the registry critical path.\n  const STARTUP_VERSION = '${MARKER}';\n  let registry = { status:'deferred', byNumber:new Map(), byDrugKey:new Map() };\n  let catalog = { status:'deferred', byPdid:new Map(), byRegistryNumber:new Map(), byProductKey:new Map() };\n  let registryPromise = null;\n  let catalogPromise = null;\n  let activationPromise = null;\n  let visibilityObserver = null;\n  let activationBound = false;`);

  source = replaceFunction(source, 'loadRegistry', 'loadCatalog', `  function loadRegistry() {
    if (registry.status === 'ready') return Promise.resolve(registry);
    if (registryPromise) return registryPromise;
    registry.status = 'loading';
    registryPromise = (async () => {
      try {
        const rows = await waitForRows();
        const byNumber = new Map();
        const byDrugKey = new Map();
        rows.forEach(row => {
          const number = clean(row['Nr rendor']);
          if (number) byNumber.set(number, row);
          addUnique(byDrugKey, [row.PDID,row['Emri tregtar'],row['Fortësia']].map(clean).join('|'), row);
        });
        registry = { status:'ready', byNumber, byDrugKey };
      } catch (error) {
        console.error('Dose calculator registry:', error);
        registry = { status:'error', byNumber:new Map(), byDrugKey:new Map() };
      }
      return registry;
    })().finally(() => { registryPromise = null; });
    return registryPromise;
  }`);

  source = replaceFunction(source, 'loadCatalog', 'headerIndex', `  function loadCatalog() {
    if (catalog.status === 'ready') return Promise.resolve(catalog);
    if (catalogPromise) return catalogPromise;
    catalog.status = 'loading';
    catalogPromise = (async () => {
      try {
        const response = await fetch(ENDPOINT, { cache:'no-store', credentials:'same-origin' });
        if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
        const payload = await response.json();
        if (!payload?.meta?.failClosed || !payload?.meta?.officialVerifiedOnly || !Array.isArray(payload.catalog)) {
          throw new Error('Kontrata e katalogut nuk është e vlefshme.');
        }
        const byPdid = new Map();
        const byRegistryNumber = new Map();
        const byProductKey = new Map();
        payload.catalog.forEach(product => {
          if (!product?.productKey || !Array.isArray(product.rules) || !product.rules.length) return;
          byProductKey.set(clean(product.productKey), product);
          addUnique(byPdid, product.pdid, product);
          addUnique(byRegistryNumber, product.registryNumber, product);
        });
        catalog = { status:'ready', byPdid, byRegistryNumber, byProductKey };
      } catch (error) {
        console.error('Dose calculator catalog:', error);
        catalog = { status:'error', byPdid:new Map(), byRegistryNumber:new Map(), byProductKey:new Map() };
      }
      return catalog;
    })().finally(() => { catalogPromise = null; });
    return catalogPromise;
  }`);

  const clickAnchor = "  document.getElementById('tbody')?.addEventListener('click', event => {";
  if (!source.includes(clickAnchor)) throw new Error('Dose calculator lazy patch could not find table click anchor.');
  source = source.replace(clickAnchor, `  function activateDoseRuntime(reason = 'intent') {
    if (activationPromise) return activationPromise;
    if (registry.status === 'ready' && catalog.status === 'ready') return Promise.resolve({ registry, catalog });
    document.documentElement.dataset.doseCalculatorActivation = reason;
    activationPromise = Promise.all([loadRegistry(), loadCatalog()])
      .then(() => {
        observe();
        scheduleEnhance();
        return { registry, catalog };
      })
      .finally(() => { activationPromise = null; });
    return activationPromise;
  }

  function doseColumnTarget(target) {
    return target?.closest?.('[data-registry-dose-calculator-column="dose-calculator"]') || null;
  }

  function bindDoseRuntimeActivation() {
    if (activationBound) return;
    activationBound = true;
    const tbody = document.getElementById('tbody');
    const activateFromEvent = event => {
      if (doseColumnTarget(event.target)) void activateDoseRuntime(event.type);
    };
    tbody?.addEventListener('pointerover', activateFromEvent, { passive:true });
    tbody?.addEventListener('touchstart', activateFromEvent, { passive:true });
    document.addEventListener('focusin', activateFromEvent, true);

    const armVisibility = () => {
      const header = document.querySelector('[data-registry-dose-calculator-column="dose-calculator"]');
      if (!header || typeof IntersectionObserver !== 'function') return;
      visibilityObserver?.disconnect();
      visibilityObserver = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting || entry.intersectionRatio > 0)) return;
        visibilityObserver?.disconnect();
        visibilityObserver = null;
        void activateDoseRuntime('visible');
      }, {
        root:document.getElementById('registryContent') || null,
        rootMargin:'120px',
        threshold:0.01,
      });
      visibilityObserver.observe(header);
    };

    armVisibility();
    ['medindex:registry-ready', 'medindex:registry-data-ready', 'medindex:registry-table-stable']
      .forEach(eventName => window.addEventListener(eventName, armVisibility));
    document.documentElement.dataset.doseCalculatorStartup = STARTUP_VERSION;
  }

${clickAnchor}`);

  const startup = `  ensureModal();\n  observe();\n  scheduleEnhance();\n  void loadRegistry();\n  void loadCatalog();`;
  if (!source.includes(startup)) throw new Error('Dose calculator eager startup block is missing.');
  source = source.replace(startup, `  bindDoseRuntimeActivation();`);

  const apiAnchor = "    openByProductKey(productKey) { openModal(catalog.byProductKey.get(clean(productKey)) || null); },";
  if (!source.includes(apiAnchor)) throw new Error('Dose calculator public openByProductKey anchor is missing.');
  source = source.replace(apiAnchor, `    openByProductKey(productKey) {\n      return activateDoseRuntime('api').then(() => openModal(catalog.byProductKey.get(clean(productKey)) || null));\n    },`);
}

for (const fragment of [
  MARKER,
  "const STARTUP_VERSION = 'dose-calculator-visibility-lazy-v1';",
  "status:'deferred'",
  'let registryPromise = null;',
  'let catalogPromise = null;',
  'function activateDoseRuntime(reason = \'intent\')',
  "new IntersectionObserver(entries =>",
  "rootMargin:'120px'",
  "tbody?.addEventListener('pointerover'",
  "tbody?.addEventListener('touchstart'",
  "document.addEventListener('focusin'",
  'bindDoseRuntimeActivation();',
  "activateDoseRuntime('api')",
]) {
  if (!source.includes(fragment)) throw new Error(`Dose calculator lazy runtime missing ${fragment}.`);
}
if (/\n\s*ensureModal\(\);\n\s*observe\(\);\n\s*scheduleEnhance\(\);\n\s*void loadRegistry\(\);\n\s*void loadCatalog\(\);/.test(source)) {
  throw new Error('Dose calculator eager startup calls survived the lazy patch.');
}

fs.writeFileSync(FILE, source, 'utf8');
execFileSync(process.execPath, [path.join(ROOT, 'tests', 'dose-calculator-startup-lazy-test.js')], {
  cwd:ROOT,
  stdio:'inherit',
});
console.log('Dose calculator startup cleanup applied: catalog/network, modal and table observer are visibility/intent-gated instead of startup work.');
