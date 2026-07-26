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

assert.match(mobile, /prefers-reduced-motion:reduce/);
assert.match(mobile, /forced-colors:active/);
assert.match(mobile, /overscroll-behavior/);
assert.match(mobile, /Tabelë me lëvizje horizontale/);
assert.match(mobile, /setAttribute\('aria-modal', 'true'\)/);
assert.match(mobile, /trapMobileSearch/);
assert.match(mobile, /event\.key !== 'Tab'/);
assert.match(mobile, /body\.style\.overflow = 'hidden'/);
assert.match(mobile, /previousFocus/);
assert.match(mobile, /tabIndex = 0/);
assert.match(mobile, /role', 'region'/);
assert.doesNotMatch(mobile, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i, 'mobile runtime must not disable browser zoom');

assert.match(experience, /--mi-safe-top:env\(safe-area-inset-top/);
assert.match(experience, /visualViewport/);
assert.match(experience, /orientationchange/);
assert.match(experience, /--mi-touch-target:44px/);

console.log('Mobile accessibility deep audit passed.');