const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const shell = read('tailadmin-shell.js');
const core = read('tailadmin-shell-core.js');
const legacyShim = read('tailadmin-shell-legacy.js');
const professional = read('tailadmin-professional.js');

for (const file of ['tailadmin-shell.js', 'tailadmin-shell-core.js', 'tailadmin-shell-legacy.js', 'tailadmin-professional.js']) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
}

assert.match(shell, /base\.removeAttribute\('data-tailadmin-medindex-css'\)/, 'bootstrap must retire the source stylesheet marker before observer startup');
assert.match(shell, /base\.dataset\.miBaseStylesheet = '1'/, 'bootstrap must retain a private stable base stylesheet marker');
assert.match(shell, /link\[data-mi-base-stylesheet\]/, 'bootstrap must rediscover the isolated base stylesheet');
assert.match(shell, /script\.async = true/, 'dynamically loaded shell runtimes must not enter the ordered defer queue');
assert.match(shell, /verifyCoreMount/);
assert.match(shell, /core-retry-executed-no-shell/);
assert.match(shell, /CORE_SHELL_SRC/);
assert.doesNotMatch(shell, /verifyLegacyMount|loadLegacyShell|LEGACY_SRC/, 'canonical bootstrap must not retain legacy shell symbols');

assert.match(core, /link\[data-tailadmin-medindex-css\]/, 'canonical core observer contract changed unexpectedly');
assert.match(core, /function createShell\(/, 'canonical core must own shell creation');
assert.match(core, /function buildNavigation\(/, 'canonical core must own navigation creation');
assert.doesNotMatch(core, /data-mi-base-stylesheet/, 'canonical core must not reacquire the isolated stylesheet');

assert.match(legacyShim, /tailadmin-shell-core\.js\?v=/, 'legacy path must migrate to the canonical core');
assert.match(legacyShim, /legacy-migration/, 'legacy path must be migration-only');
assert.doesNotMatch(legacyShim, /function createShell\(|function buildNavigation\(/, 'legacy path must not contain a second shell implementation');

assert.match(professional, /link\[data-tailadmin-medindex-css\]/, 'professional observer contract changed unexpectedly');
assert.doesNotMatch(professional, /data-mi-base-stylesheet/, 'professional runtime must not reacquire the isolated stylesheet');

const shellMarkerRemoval = shell.indexOf("base.removeAttribute('data-tailadmin-medindex-css')");
const coreLoad = shell.indexOf('loadCoreShell();');
assert.ok(shellMarkerRemoval >= 0 && coreLoad >= 0 && shellMarkerRemoval < coreLoad, 'stylesheet marker isolation must occur before the canonical shell can mount');

assert.match(professional, /NAV_OBSERVER_OPTIONS/);
assert.match(professional, /navObserver\.disconnect\(\)/, 'professional navigation observer must disconnect while normalizing its own target');
assert.match(professional, /finally\s*\{[\s\S]*observeNavigation\(nav\)/, 'professional navigation observer must reconnect after normalization');
assert.match(professional, /setAttributeIfChanged/);
assert.match(professional, /removeAttributeIfPresent/);
assert.match(professional, /setClassState/);
assert.match(professional, /if \(stabilized\) return;/, 'professional runtime must stabilize only once');
assert.doesNotMatch(professional, /nav\.setAttribute\('aria-label',[\s\S]*navObserver\.observe\(nav,[\s\S]*normalizeNavigation\(\)/, 'navigation writes must not remain under an active observer');

console.log('TailAdmin canonical shell stylesheet and navigation observer loop regression test passed.');
