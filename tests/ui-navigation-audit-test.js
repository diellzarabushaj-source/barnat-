const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const count = (value, pattern) => [...value.matchAll(pattern)].length;

const pages = [
  ['index.html', 'registryContent'],
  ['klasifikimi.html', 'atcContent'],
  ['icd.html', 'icdContent'],
  ['urgjencat.html', 'emergencyContent'],
  ['analizat.html', 'labContent'],
  ['dozologjia.html', 'dosageContent'],
  ['protokollet.html', 'protocolContent'],
  ['medical-hub.html', 'medicalHubContent'],
  ['recetat.html', 'rxContent'],
];

for (const [fileName, skipTarget] of pages) {
  const html = read(fileName);
  const styles = [...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/gi)].map(match => match[1]);
  const scripts = [...html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]);

  assert.match(html, /<html[^>]+class=["'][^"']*medindex-tailadmin/, `${fileName}: TailAdmin marker must be available before deferred scripts`);
  assert.equal(count(html, /tailadmin-medindex\.css/gi), 1, `${fileName}: TailAdmin CSS must load exactly once`);
  assert.equal(count(html, /tailadmin-professional\.css/gi), 1, `${fileName}: professional TailAdmin CSS must load exactly once`);
  assert.equal(count(html, /tailadmin-shell\.js/gi), 1, `${fileName}: TailAdmin shell bootstrap must load exactly once`);
  assert.equal(count(html, /tailadmin-shell-legacy\.js/gi), 0, `${fileName}: legacy shell must not be statically loaded`);
  assert.equal(count(html, /ui-enhancements\.js/gi), 0, `${fileName}: retired UI enhancement controller must not be loaded`);
  assert.equal(count(html, /tailadmin-professional\.js/gi), 1, `${fileName}: professional TailAdmin runtime must load exactly once`);

  const professionalCssIndex = styles.findIndex(href => /tailadmin-professional\.css/.test(href));
  assert.ok(professionalCssIndex >= 0, `${fileName}: professional TailAdmin stylesheet is missing from the cascade`);
  const stylesAfterProfessional = styles.slice(professionalCssIndex + 1);
  if (fileName === 'index.html') {
    assert.ok(
      stylesAfterProfessional.every(href => /^registry-table-tools\.css(?:\?|$)/.test(href)),
      `${fileName}: only the generated registry table-tools layer may follow professional TailAdmin CSS; found ${stylesAfterProfessional.join(', ')}`,
    );
  } else {
    assert.deepEqual(stylesAfterProfessional, [], `${fileName}: professional TailAdmin CSS must remain the final static stylesheet`);
  }

  assert.doesNotMatch(html, /navigation-shell\.css|navigation-consistency\.js|main-navigation-extension\.js/, `${fileName}: legacy navigation layer must not load`);

  const shellIndex = scripts.findIndex(item => item.includes('tailadmin-shell.js'));
  const professionalIndex = scripts.findIndex(item => item.includes('tailadmin-professional.js'));
  const authIndex = scripts.findIndex(item => item.includes('auth-client.js'));
  const stabilityIndex = scripts.findIndex(item => item.includes('app-stability.js'));
  assert.ok(shellIndex >= 0 && professionalIndex > shellIndex, `${fileName}: professional runtime must initialize after TailAdmin shell`);
  assert.ok(authIndex > professionalIndex, `${fileName}: TailAdmin runtimes must initialize before auth adds logout`);
  assert.ok(stabilityIndex > authIndex, `${fileName}: stability layer must load after auth`);

  assert.match(html, new RegExp(`<a[^>]+class=["'][^"']*skip-link[^"']*["'][^>]+href=["']#${skipTarget}["']`, 'i'), `${fileName}: missing usable skip link`);
  assert.match(html, new RegExp(`id=["']${skipTarget}["']`), `${fileName}: skip-link target is missing`);
}

const index = read('index.html');
assert.match(index, /id="formPickerBtn"[^>]+aria-controls="formPanel"/);
assert.match(index, /id="colPickerBtn"[^>]+aria-controls="colPanel"/);
assert.match(index, /id="registryContent"[^>]+tabindex="-1"/);

const recetat = read('recetat.html');
assert.match(recetat, /data-rx-command="form"[^>]+aria-controls="rxFormPopover"/);
assert.match(recetat, /data-rx-command="drug"[^>]+aria-controls="rxDrugPopover"/);
assert.match(recetat, /data-rx-command="signature"[^>]+aria-controls="rxSignaturePopover"/);
assert.match(recetat, /id="rxComposer"[^>]+aria-label="Përmbajtja e recetës"/);
assert.match(recetat, /id="rxPreview"[^>]+aria-live="polite"/);
assert.match(recetat, /id="rxSavedList"[^>]+aria-live="polite"/);
assert.match(recetat, /id="rxDosageReview"/);
assert.match(recetat, /id="rxDosageChooser"/);

const shellBootstrap = read('tailadmin-shell.js');
const shellCore = read('tailadmin-shell-core.js');
const legacyShell = read('tailadmin-shell-legacy.js');
const professional = read('tailadmin-professional.js');
const authClient = read('auth-client.js');
const uiEnhancements = read('ui-enhancements.js');
[
  /PAGE_META/,
  /id = 'appMenu'/,
  /data-mi-sidebar-toggle/,
  /aria-controls="miSidebar"/,
  /syncResponsiveSidebar/,
  /resetSidebarPosition/,
  /pageshow/,
  /data-mi-sidebar-overlay/,
  /data-mi-theme-toggle/,
  /aria-current="page"/,
  /medindex:tailadmin-ready/,
  /Ctrl|ctrlKey/,
  /metaKey/,
  /Escape/,
  /scrollIntoView/,
  /\/dozologjia\.html/,
  /\/urgjencat\.html/,
  /\/protokollet\.html/,
  /\/medical-hub\.html/,
  /\/recetat\.html/,
  /favoriteNavCount/,
].forEach(pattern => assert.match(shellCore, pattern, `tailadmin-shell-core.js missing ${pattern}`));
assert.match(shellCore, /document\.addEventListener\('DOMContentLoaded', init/);
assert.match(shellBootstrap, /MutationObserver\(\(\) => queueMicrotask\(ensureStylesheetLast\)\)/, 'TailAdmin base cascade guard must not expire');
assert.doesNotMatch(shellBootstrap, /headObserver\.disconnect|12000/, 'TailAdmin cascade guard must not expire after a timeout');
assert.match(shellBootstrap, /MOBILE_BREAKPOINT = 1024/, 'TailAdmin desktop/mobile breakpoint is missing');
assert.match(shellBootstrap, /CORE_SHELL_SRC/);
assert.doesNotMatch(shellBootstrap, /LEGACY_SRC|loadLegacyShell|verifyLegacyMount/);
assert.match(legacyShell, /tailadmin-shell-core\.js\?v=/, 'legacy shell path must point only to the canonical core');
assert.match(legacyShell, /legacy-migration/);
assert.doesNotMatch(legacyShell, /function createShell\(|function buildNavigation\(/, 'legacy shell path must not retain a second implementation');
[
  /ROOT\.dataset\.miPage/,
  /orderStylesheets/,
  /normalizeNavigation/,
  /resetRootHorizontalOffset/,
  /MutationObserver/,
  /ResizeObserver/,
  /medindex:professional-ui-ready/,
].forEach(pattern => assert.match(professional, pattern, `tailadmin-professional.js missing ${pattern}`));
assert.match(authClient, /installLogout/);
assert.match(authClient, /\.auth-logout/);
assert.match(uiEnhancements, /miLegacyUiEnhancements = 'retired'/, 'legacy registry UI path must be an explicit compatibility-only shim');
assert.doesNotMatch(uiEnhancements, /legacyNavigationStyles|MutationObserver|localStorage|sessionStorage|data-drug-actions|insertAdjacentHTML/, 'retired UI path must not contain a second visual or registry controller');

const css = read('tailadmin-medindex.css');
const professionalCss = [
  read('tailadmin-professional.css'),
  read('tailadmin-professional-core.css'),
  read('medindex-tailwind-ui.css'),
  read('medindex-tailwind-touch.css'),
].join('\n');
[
  /--mi-brand-500:\s*#1f7779/,
  /--mi-gray-900:\s*#101828/,
  /--mi-sidebar-width:\s*290px/,
  /--mi-sidebar-collapsed:\s*90px/,
  /\.mi-app-shell/,
  /\.mi-sidebar/,
  /\.mi-topbar/,
  /\.mi-global-search/,
  /#appMenu\.mi-sidebar-nav/,
  /#appMenu \.app-menu-link,[\s\S]*flex-direction:\s*row !important/,
  /#appMenu\.mi-sidebar-nav[\s\S]*min-height:\s*0 !important/,
  /\.mi-theme-control[\s\S]*display:\s*block !important/,
  /overflow-anchor:\s*none/,
  /max-height:\s*820px/,
  /body\.mi-sidebar-collapsed/,
  /body\.mi-sidebar-open/,
  /@media \(max-width: 1023px\)/,
  /@media \(prefers-reduced-motion: reduce\)/,
  /@media print/,
  /100dvh/,
  /:focus-visible/,
  /html\[data-theme="dark"\]/,
  /\.login-side-panel/,
].forEach(pattern => assert.match(css, pattern, `tailadmin-medindex.css missing ${pattern}`));
[
  /#appMenu \.app-menu-link/,
  /flex-direction:\s*row\s*!important/,
  /overflow-x:\s*hidden\s*!important/,
  /data-mi-page="barnat"/,
  /data-mi-page="klasifikimi"/,
  /data-mi-page="icd"/,
  /data-mi-page="analizat"/,
  /data-mi-page="dozologjia"/,
  /data-mi-page="protokollet"/,
  /data-mi-page="recetat"/,
  /@media \(max-width: 1023px\)/,
  /@media \(max-height: 760px\)/,
].forEach(pattern => assert.match(professionalCss, pattern, `TailAdmin professional bundle missing ${pattern}`));
assert.doesNotMatch(css, /--medindex-nav-width|bottom navigation/i, 'TailAdmin shell must not retain the legacy bottom-navigation geometry');

const login = read('login.html');
assert.match(login, /data-mi-page="login"/);
assert.match(login, /class="lp lp-auth"/);
assert.match(login, /class="auth-stage"/);
assert.match(login, /brand\/drx-horizontal-dark\.svg/);
assert.match(login, /id="loginForm"/);
assert.match(login, /drx-auth\.css/, 'The functional login must load the shared DRx auth system');

assert.ok(fs.existsSync(path.join(ROOT, 'TAILADMIN-LICENSE')), 'TailAdmin license text is missing');
assert.ok(fs.existsSync(path.join(ROOT, 'THIRD_PARTY_NOTICES.md')), 'Third-party notice is missing');
assert.match(read('TAILADMIN-LICENSE'), /MIT License/);
assert.match(read('THIRD_PARTY_NOTICES.md'), /TailAdmin Community Edition/);

const stability = read('app-stability.js');
assert.doesNotMatch(stability, /clinical-ui\.css|installClinicalUi|installNavigationUi/, 'stability layer must not inject competing visual systems');
assert.match(stability, /syncControlledDisclosures/);
assert.match(stability, /aria-controls/);
assert.match(stability, /rx-popover:not\(\[hidden\]\)/);
assert.match(stability, /button:not\(\[type\]\)/);

console.log('Canonical TailAdmin UI, navigation and retired legacy-controller audit passed.');
