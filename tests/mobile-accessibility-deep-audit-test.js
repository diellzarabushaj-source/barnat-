const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const shell = read('tailadmin-shell.js');
const mobile = read('mobile-accessibility-hardening.js');
const experience = read('mobile-experience.js');

execFileSync(process.execPath, ['--check', path.join(root, 'tailadmin-shell.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(root, 'mobile-accessibility-hardening.js')], { stdio:'pipe' });

assert.match(shell, /MOBILE_A11Y_SRC/);
assert.match(shell, /mobile-accessibility-hardening\.js\?v=mobile-a11y-deep-audit-v1/);
assert.match(shell, /data-medindex-mobile-a11y/);
assert.match(shell, /warm\(MOBILE_A11Y_SRC\)/);
assert.match(shell, /ensureCriticalMobileStyles/);
assert.match(shell, /miCriticalMobileTouchStyles/);
assert.match(shell, /input:not\(\[type\]\)/, 'critical styles must cover inputs whose text type is implicit');
assert.match(shell, /min-height:44px!important/, 'critical 44px touch styles must exist before mobile runtime readiness');
assert.ok(shell.indexOf('ensureCriticalMobileStyles();') < shell.indexOf("loadRuntime(MOBILE_SRC"), 'critical touch styles must be injected before mobile experience starts');

assert.match(mobile, /prefers-reduced-motion:reduce/);
assert.match(mobile, /forced-colors:active/);
assert.match(mobile, /overscroll-behavior/);
assert.match(mobile, /Tabelë me lëvizje horizontale/);
assert.match(mobile, /setAttributeIfChanged\(dialog, 'aria-modal', 'true'\)/);
assert.match(mobile, /trapMobileSearch/);
assert.match(mobile, /event\.key !== 'Tab'/);
assert.match(mobile, /body\.style\.overflow = 'hidden'/);
assert.match(mobile, /previousFocus/);
assert.match(mobile, /tabIndex = 0/);
assert.match(mobile, /'role', region\.getAttribute\('role'\) \|\| 'region'/);
assert.match(mobile, /min-height:44px!important/, 'mobile form controls must remain at least 44px high');
assert.match(mobile, /setAttributeIfChanged/);
assert.match(mobile, /removeAttributeIfPresent/);
assert.match(mobile, /attributeFilter:\['class', 'hidden'\]/, 'mobile observer must watch only external state changes');
assert.doesNotMatch(mobile, /attributeFilter:\[[^\]]*aria-hidden/, 'mobile observer must not watch aria-hidden values that it writes itself');
assert.doesNotMatch(mobile, /backdrop\.setAttribute\('aria-hidden'/, 'backdrop accessibility state must be written idempotently');
assert.doesNotMatch(mobile, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i, 'mobile runtime must not disable browser zoom');

assert.match(experience, /--mi-safe-top:env\(safe-area-inset-top/);
assert.match(experience, /visualViewport/);
assert.match(experience, /orientationchange/);
assert.match(experience, /--mi-touch-target:44px/);

console.log('Mobile accessibility and critical implicit-input touch-target audit passed.');
