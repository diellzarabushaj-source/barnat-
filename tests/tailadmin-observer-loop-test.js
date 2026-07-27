const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const shell = read('tailadmin-shell.js');
const legacy = read('tailadmin-shell-legacy.js');
const professional = read('tailadmin-professional.js');

for (const file of ['tailadmin-shell.js', 'tailadmin-shell-legacy.js', 'tailadmin-professional.js']) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
}

assert.match(shell, /base\.removeAttribute\('data-tailadmin-medindex-css'\)/, 'wrapper must retire the legacy stylesheet marker before observer startup');
assert.match(shell, /base\.dataset\.miBaseStylesheet = '1'/, 'wrapper must retain a private stable base stylesheet marker');
assert.match(shell, /link\[data-mi-base-stylesheet\]/, 'wrapper must rediscover the isolated base stylesheet');
assert.match(shell, /script\.async = true/, 'dynamically loaded shell runtimes must not enter the ordered defer queue');
assert.match(shell, /verifyLegacyMount/);
assert.match(shell, /legacy-retry-executed-no-shell/);

assert.match(legacy, /link\[data-tailadmin-medindex-css\]/, 'legacy observer contract changed unexpectedly');
assert.match(professional, /link\[data-tailadmin-medindex-css\]/, 'professional observer contract changed unexpectedly');
assert.doesNotMatch(legacy, /data-mi-base-stylesheet/, 'legacy runtime must not reacquire the isolated stylesheet');
assert.doesNotMatch(professional, /data-mi-base-stylesheet/, 'professional runtime must not reacquire the isolated stylesheet');

const shellMarkerRemoval = shell.indexOf("base.removeAttribute('data-tailadmin-medindex-css')");
const legacyLoad = shell.indexOf('loadLegacyShell();');
assert.ok(shellMarkerRemoval >= 0 && legacyLoad >= 0 && shellMarkerRemoval < legacyLoad, 'stylesheet marker isolation must occur before the legacy shell can mount');

console.log('TailAdmin stylesheet observer loop regression test passed.');
