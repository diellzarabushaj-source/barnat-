'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8').replace(/\r\n?/g, '\n');
const write = (relative, content) => fs.writeFileSync(path.join(ROOT, relative), content.replace(/\r\n?/g, '\n'), 'utf8');
const LEGACY_COMPAT_FILES = new Set([
  'ui-enhancements.js',
  'navigation-consistency.js',
  'main-navigation-extension.js',
  'navigation-shell.css',
]);

function cleanRelease(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 96);
}

const pkg = JSON.parse(read('package.json'));
const RELEASE_ID = cleanRelease(
  process.env.VERCEL_GIT_COMMIT_SHA
  || process.env.GITHUB_SHA
  || process.env.VERCEL_DEPLOYMENT_ID
  || `local-${pkg.version}`
);
if (!RELEASE_ID) throw new Error('Phase 7 release ID could not be resolved.');

function syntaxCheck(relative, source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medindex-phase7-'));
  const file = path.join(dir, path.basename(relative));
  try {
    fs.writeFileSync(file, source, 'utf8');
    execFileSync(process.execPath, ['--check', file], { stdio:'pipe' });
  } finally {
    fs.rmSync(dir, { recursive:true, force:true });
  }
}

function materializeCanonicalShellCore() {
  const legacySource = read('tailadmin-shell-legacy.js');
  if (!legacySource.includes('function createShell(')
      || !legacySource.includes('function buildNavigation(')
      || !legacySource.includes("window.dispatchEvent(new CustomEvent('medindex:tailadmin-ready'))")) {
    throw new Error('The shell implementation source is incomplete; refusing Phase 7 migration.');
  }

  const banner = `/* AUTO-GENERATED Phase 7 canonical shell core · release ${RELEASE_ID}. */\n`;
  const coreSource = banner + legacySource;
  syntaxCheck('tailadmin-shell-core.js', coreSource);
  write('tailadmin-shell-core.js', coreSource);

  const shim = `(() => {\n  'use strict';\n  if (document.body?.dataset.tailadminReady === '1') return;\n  if (document.querySelector('script[data-medindex-tailadmin-core]')) return;\n  const script = document.createElement('script');\n  script.src = '/tailadmin-shell-core.js?v=${RELEASE_ID}';\n  script.async = true;\n  script.dataset.medindexTailadminCore = 'legacy-migration';\n  document.head.appendChild(script);\n})();\n`;
  syntaxCheck('tailadmin-shell-legacy.js', shim);
  write('tailadmin-shell-legacy.js', shim);
}

function patchShellBootstrap() {
  let source = read('tailadmin-shell.js');
  source = source
    .replace(/const LEGACY_SRC = '[^']+';/, `const CORE_SHELL_SRC = '/tailadmin-shell-core.js?v=${RELEASE_ID}';`)
    .replace(/\bLEGACY_SRC\b/g, 'CORE_SHELL_SRC')
    .replace(/verifyLegacyMount/g, 'verifyCoreMount')
    .replace(/loadLegacyShell/g, 'loadCoreShell')
    .replace(/data-medindex-tailadmin-legacy/g, 'data-medindex-tailadmin-core')
    .replace(/medindexTailadminLegacy/g, 'medindexTailadminCore')
    .replace(/legacy-retry-executed-no-shell/g, 'core-retry-executed-no-shell')
    .replace(/legacy-executed-no-shell/g, 'core-executed-no-shell')
    .replace(/legacy-retry-load/g, 'core-retry-load')
    .replace(/legacy-load/g, 'core-load');

  if (!source.includes(`const CORE_SHELL_SRC = '/tailadmin-shell-core.js?v=${RELEASE_ID}';`)
      || !source.includes('function loadCoreShell(')
      || source.includes('tailadmin-shell-legacy.js')
      || source.includes('loadLegacyShell')
      || source.includes('data-medindex-tailadmin-legacy')) {
    throw new Error('TailAdmin bootstrap was not converted to the canonical shell core.');
  }
  syntaxCheck('tailadmin-shell.js', source);
  write('tailadmin-shell.js', source);
}

function patchIndex() {
  let html = read('index.html');
  html = html.replace(/\n?<script src="tailadmin-shell-legacy\.js(?:\?[^\"]*)?"[^>]*><\/script>/g, '');

  const legacyRefs = (html.match(/tailadmin-shell-legacy\.js/g) || []).length;
  const bootstrapRefs = (html.match(/tailadmin-shell\.js/g) || []).length;
  if (legacyRefs !== 0) throw new Error(`index.html still contains ${legacyRefs} legacy shell reference(s).`);
  if (bootstrapRefs !== 1) throw new Error(`index.html must load exactly one shell bootstrap; found ${bootstrapRefs}.`);
  if (html.includes('offline-runtime-performance.js')) throw new Error('index.html still loads the legacy offline runtime path.');

  write('index.html', html);
}

function patchCanonicalWorker() {
  let source = read('sw.js');
  source = source
    .replace("'/tailadmin-shell.js', '/tailadmin-shell-legacy.js', '/tailadmin-professional.js'", "'/tailadmin-shell.js', '/tailadmin-shell-core.js', '/tailadmin-professional.js'");

  for (const file of LEGACY_COMPAT_FILES) {
    const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    source = source.replace(new RegExp(`\\s*['\"]/\\?${escaped}['\"],?`, 'g'), '');
  }

  if (!source.includes("'/tailadmin-shell-core.js'")) throw new Error('Canonical shell core is missing from the service-worker shell.');
  if (source.includes("'/tailadmin-shell-legacy.js'")) throw new Error('Legacy shell implementation remains in the canonical service-worker shell.');
  for (const file of LEGACY_COMPAT_FILES) {
    if (source.includes(`'/${file}'`) || source.includes(`"/${file}"`)) {
      throw new Error(`${file} remains in the canonical service-worker shell.`);
    }
  }
  syntaxCheck('sw.js', source);
  write('sw.js', source);
}

function runtimeFiles(directory = ROOT) {
  const ignored = new Set([
    '.git', '.github', '.superdesign', '.vercel', 'node_modules', 'tests', 'scripts',
    'test-results', 'playwright-report',
  ]);
  return fs.readdirSync(directory, { withFileTypes:true }).flatMap(entry => {
    if (entry.isDirectory() && ignored.has(entry.name)) return [];
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return runtimeFiles(absolute);
    if (!entry.isFile()) return [];
    if (!/\.(?:html|js|mjs|css)$/i.test(entry.name)) return [];
    if (LEGACY_COMPAT_FILES.has(entry.name)) return [];
    return [absolute];
  });
}

function findRuntimeReferences(needle) {
  const references = [];
  for (const absolute of runtimeFiles()) {
    const source = fs.readFileSync(absolute, 'utf8');
    if (!source.includes(needle)) continue;
    references.push(path.relative(ROOT, absolute).replace(/\\/g, '/'));
  }
  return references.sort();
}

function assertNoRuntimeReferences(file) {
  const references = findRuntimeReferences(file);
  if (references.length) {
    throw new Error(`Phase 7 refused to retire ${file}; production references remain: ${references.join(', ')}`);
  }
}

function canonicalShellMigrationShim(label) {
  return `(() => {\n  'use strict';\n  // Phase 7 compatibility path only: ${label} now delegates to the canonical TailAdmin shell.\n  if (document.body?.dataset.tailadminReady === '1') return;\n  if (document.querySelector('script[data-medindex-phase7-shell-migration]')) return;\n  const existing = document.querySelector('script[src="/tailadmin-shell.js"],script[src^="/tailadmin-shell.js?"],script[src="tailadmin-shell.js"],script[src^="tailadmin-shell.js?"]');\n  if (existing) return;\n  const script = document.createElement('script');\n  script.src = '/tailadmin-shell.js?v=${RELEASE_ID}';\n  script.async = true;\n  script.dataset.medindexPhase7ShellMigration = '${label}';\n  document.head.appendChild(script);\n})();\n`;
}

function retireUiEnhancements() {
  assertNoRuntimeReferences('ui-enhancements.js');
  const shim = `(() => {\n  'use strict';\n  // Phase 7 compatibility path only. The former registry visual/navigation controller is retired.\n  document.documentElement.dataset.miLegacyUiEnhancements = 'retired';\n})();\n`;
  syntaxCheck('ui-enhancements.js', shim);
  write('ui-enhancements.js', shim);
}

function retireDuplicateNavigationLayers() {
  for (const file of ['navigation-consistency.js', 'main-navigation-extension.js', 'navigation-shell.css']) {
    assertNoRuntimeReferences(file);
  }

  const consistencyShim = canonicalShellMigrationShim('navigation-consistency');
  const extensionShim = canonicalShellMigrationShim('main-navigation-extension');
  syntaxCheck('navigation-consistency.js', consistencyShim);
  syntaxCheck('main-navigation-extension.js', extensionShim);
  write('navigation-consistency.js', consistencyShim);
  write('main-navigation-extension.js', extensionShim);

  const cssShim = `/* Phase 7 compatibility stylesheet. The former navigation design system is retired. */\n@import url('/tailadmin-medindex.css?v=${RELEASE_ID}');\n`;
  write('navigation-shell.css', cssShim);
}

function auditPhase7() {
  const index = read('index.html');
  const bootstrap = read('tailadmin-shell.js');
  const core = read('tailadmin-shell-core.js');
  const legacyShim = read('tailadmin-shell-legacy.js');
  const uiShim = read('ui-enhancements.js');
  const consistencyShim = read('navigation-consistency.js');
  const extensionShim = read('main-navigation-extension.js');
  const navigationCssShim = read('navigation-shell.css');
  const worker = read('sw.js');

  if ((index.match(/tailadmin-shell\.js/g) || []).length !== 1) throw new Error('Phase 7: multiple shell bootstraps are statically loaded.');
  if (index.includes('tailadmin-shell-legacy.js')) throw new Error('Phase 7: legacy shell is still statically loaded.');
  if (index.includes('offline-runtime-performance.js')) throw new Error('Phase 7: legacy offline runtime is still statically loaded.');
  for (const file of LEGACY_COMPAT_FILES) {
    if (index.includes(file)) throw new Error(`Phase 7: obsolete UI layer is statically loaded: ${file}`);
  }
  if (!bootstrap.includes('CORE_SHELL_SRC') || bootstrap.includes('LEGACY_SRC')) throw new Error('Phase 7: shell bootstrap is not canonical.');
  if (!core.includes('function createShell(') || !core.includes('function buildNavigation(')) throw new Error('Phase 7: canonical shell core is incomplete.');
  if (!legacyShim.includes('legacy-migration') || legacyShim.includes('function createShell(')) throw new Error('Phase 7: legacy shell path is not a migration-only shim.');
  if (!uiShim.includes("miLegacyUiEnhancements = 'retired'")
      || /MutationObserver|localStorage|sessionStorage|insertAdjacentHTML|legacyNavigationStyles|data-drug-actions/.test(uiShim)) {
    throw new Error('Phase 7: ui-enhancements.js still contains a competing registry UI implementation.');
  }
  for (const [file, shim] of [
    ['navigation-consistency.js', consistencyShim],
    ['main-navigation-extension.js', extensionShim],
  ]) {
    if (!shim.includes('/tailadmin-shell.js?v=')
        || !shim.includes('data-medindex-phase7-shell-migration')
        || /MutationObserver|localStorage|PATH_TARGETS|ITEMS\s*=|installStyles|ensureClinicalSections/.test(shim)) {
      throw new Error(`Phase 7: ${file} still contains a competing navigation implementation.`);
    }
  }
  if (!navigationCssShim.includes("@import url('/tailadmin-medindex.css?v=")
      || /--medindex-nav-width|\.app-menu-link|\.med-nav-link|\.atc-nav-link/.test(navigationCssShim)) {
    throw new Error('Phase 7: navigation-shell.css still contains a competing design system.');
  }
  if (!worker.includes("'/tailadmin-shell-core.js'") || worker.includes("'/tailadmin-shell-legacy.js'")) {
    throw new Error('Phase 7: service-worker shell still has competing shell implementations.');
  }
  for (const file of LEGACY_COMPAT_FILES) {
    if (worker.includes(`'/${file}'`) || worker.includes(`"/${file}"`)) {
      throw new Error(`Phase 7: service-worker still precaches obsolete UI layer ${file}.`);
    }
    const references = findRuntimeReferences(file);
    if (references.length) throw new Error(`Phase 7: obsolete UI runtime references remain for ${file}: ${references.join(', ')}`);
  }

  console.log(`Phase 7 legacy UI cleanup passed for ${RELEASE_ID}: one shell, one navigation implementation and one TailAdmin design system; old paths are compatibility-only.`);
}

materializeCanonicalShellCore();
patchShellBootstrap();
patchIndex();
patchCanonicalWorker();
retireUiEnhancements();
retireDuplicateNavigationLayers();
auditPhase7();
