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
  ['analizat.html', 'labContent'],
  ['dozologjia.html', 'dosageContent'],
  ['protokollet.html', 'protocolContent'],
  ['recetat.html', 'rxContent'],
];

for (const [fileName, skipTarget] of pages) {
  const html = read(fileName);
  const styles = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]);
  const scripts = [...html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]);

  assert.equal(count(html, /tailadmin-medindex\.css/gi), 1, `${fileName}: TailAdmin CSS must load exactly once`);
  assert.equal(count(html, /tailadmin-shell\.js/gi), 1, `${fileName}: TailAdmin shell must load exactly once`);
  assert.match(styles.at(-1) || '', /tailadmin-medindex\.css/, `${fileName}: TailAdmin CSS must be the final static stylesheet`);
  assert.doesNotMatch(html, /navigation-shell\.css|navigation-consistency\.js|main-navigation-extension\.js/, `${fileName}: legacy navigation layer must not load`);

  const shellIndex = scripts.findIndex(item => item.includes('tailadmin-shell.js'));
  const authIndex = scripts.findIndex(item => item.includes('auth-client.js'));
  const stabilityIndex = scripts.findIndex(item => item.includes('app-stability.js'));
  assert.ok(shellIndex >= 0 && authIndex > shellIndex, `${fileName}: TailAdmin shell must initialize before auth adds logout`);
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

const shell = read('tailadmin-shell.js');
const authClient = read('auth-client.js');
[
  /PAGE_META/,
  /id = 'appMenu'/,
  /data-mi-sidebar-toggle/,
  /data-mi-sidebar-overlay/,
  /data-mi-theme-toggle/,
  /aria-current="page"/,
  /medindex:tailadmin-ready/,
  /Ctrl|ctrlKey/,
  /metaKey/,
  /Escape/,
  /scrollIntoView/,
  /\/dozologjia\.html/,
  /\/protokollet\.html/,
  /\/recetat\.html/,
  /favoriteNavCount/,
].forEach(pattern => assert.match(shell, pattern, `tailadmin-shell.js missing ${pattern}`));
assert.match(shell, /document\.addEventListener\('DOMContentLoaded', init/);
assert.match(shell, /MutationObserver\(ensureStylesheetLast\)/, 'TailAdmin CSS must remain the final cascade layer');
assert.match(shell, /MOBILE_BREAKPOINT = 1024/, 'TailAdmin desktop/mobile breakpoint is missing');
assert.match(authClient, /installLogout/);
assert.match(authClient, /\.auth-logout/);

const css = read('tailadmin-medindex.css');
[
  /--mi-brand-500:\s*#465fff/,
  /--mi-gray-900:\s*#101828/,
  /--mi-sidebar-width:\s*290px/,
  /--mi-sidebar-collapsed:\s*90px/,
  /\.mi-app-shell/,
  /\.mi-sidebar/,
  /\.mi-topbar/,
  /\.mi-global-search/,
  /#appMenu\.mi-sidebar-nav/,
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
assert.doesNotMatch(css, /--medindex-nav-width|bottom navigation/i, 'TailAdmin shell must not retain the legacy bottom-navigation geometry');

const login = read('login.html');
assert.match(login, /class="medindex-tailadmin-login"/);
assert.match(login, /class="login-side-panel"/);
assert.match(login, /id="loginForm"/);
assert.match(login, /tailadmin-medindex\.css/);

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

console.log('TailAdmin UI and navigation audit tests passed.');
