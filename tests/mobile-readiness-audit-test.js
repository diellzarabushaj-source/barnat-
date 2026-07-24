const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const mobile = read('mobile-experience.js');
const shell = read('tailadmin-shell.js');
const workflow = read('.github/workflows/physician-browser-audit.yml');
const browserSpec = read('tests/mobile-deep-audit.spec.js');

execFileSync(process.execPath, ['--check', path.join(ROOT, 'mobile-experience.js')], { stdio:'pipe' });

[
  /mobile-audit-v1/,
  /safe-area-inset-top/,
  /safe-area-inset-bottom/,
  /--mi-touch-target:44px/,
  /visualViewport/,
  /--mi-visual-height/,
  /data-mi-mobile-search/,
  /aria-label', 'Kërko në MedIndex'/,
  /aria-label', 'Recetë e re'/,
  /mi-mobile-search-open/,
  /workspace\.inert = sidebarOpen/,
  /main\.inert = searchOpen/,
  /orientationchange/,
  /max-height:500px/,
  /width:min\(var\(--mi-sidebar-width\),calc\(100vw - 44px\)\)/,
].forEach(pattern => assert.match(mobile, pattern, `mobile-experience.js missing ${pattern}`));

assert.doesNotMatch(mobile, /fetch\(|\/api\//, 'mobile experience runtime must not touch backend APIs or the network');
assert.match(shell, /MOBILE_SRC = '\/mobile-experience\.js\?v=mobile-audit-v1'/, 'shell must load the audited mobile runtime');
assert.match(shell, /loadMobileExperience\(\)/, 'mobile runtime loader is missing');
assert.match(shell, /warm\(MOBILE_SRC\)/, 'mobile runtime must be warmed for offline reuse');

assert.match(workflow, /mobile-deep-audit\.spec\.js/, 'browser workflow must execute the mobile audit');
[
  /viewport:PHONE/,
  /viewport:TABLET/,
  /hasTouch:true/,
  /expectNoDocumentOverflow/,
  /expectTouchTarget/,
  /mi-sidebar-open/,
  /mi-mobile-search-open/,
  /setViewportSize\(\{ width:844, height:390 \}\)/,
  /setViewportSize\(\{ width:1180, height:820 \}\)/,
  /context\.setOffline\(true\)/,
].forEach(pattern => assert.match(browserSpec, pattern, `mobile browser audit missing ${pattern}`));

console.log('Mobile, tablet, touch, safe-area and orientation audit passed.');