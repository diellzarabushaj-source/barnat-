const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const count = (value, pattern) => [...value.matchAll(pattern)].length;

const pages = [
  ['index.html', 'registryContent', null],
  ['klasifikimi.html', 'atcContent', 'Klasifikimi'],
  ['icd.html', 'icdContent', 'ICD'],
  ['analizat.html', 'labContent', 'Analizat'],
  ['recetat.html', 'rxContent', 'Recetat'],
];
const coreLabels = ['Barnat', 'Klasifikimi', 'ICD', 'Analizat', 'Recetat'];

for (const [fileName, skipTarget, activeLabel] of pages) {
  const html = read(fileName);
  const styles = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]);
  const scripts = [...html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]);

  assert.equal(count(html, /navigation-shell\.css/gi), 1, `${fileName}: navigation CSS must load exactly once`);
  assert.equal(count(html, /navigation-consistency\.js/gi), 1, `${fileName}: navigation script must load exactly once`);
  assert.match(styles.at(-1) || '', /navigation-shell\.css/, `${fileName}: canonical navigation CSS must be the final stylesheet`);

  const navigationIndex = scripts.findIndex(item => item.includes('navigation-consistency.js'));
  const authIndex = scripts.findIndex(item => item.includes('auth-client.js'));
  const stabilityIndex = scripts.findIndex(item => item.includes('app-stability.js'));
  assert.ok(navigationIndex >= 0 && authIndex > navigationIndex, `${fileName}: navigation must initialize before auth adds logout`);
  assert.ok(stabilityIndex > authIndex, `${fileName}: stability layer must load last`);

  assert.match(html, new RegExp(`<a[^>]+class=["'][^"']*skip-link[^"']*["'][^>]+href=["']#${skipTarget}["']`, 'i'), `${fileName}: missing usable skip link`);
  assert.match(html, new RegExp(`id=["']${skipTarget}["']`), `${fileName}: skip-link target is missing`);

  if (activeLabel) {
    coreLabels.forEach(label => assert.match(html, new RegExp(`>${label}<`), `${fileName}: missing ${label} navigation item`));
    assert.equal(count(html, /aria-current=["']page["']/gi), 1, `${fileName}: exactly one navigation item must be current`);
    assert.match(html, new RegExp(`aria-current=["']page["'][^>]*>[\\s\\S]{0,500}>${activeLabel}<|>${activeLabel}<[\\s\\S]{0,500}aria-current=["']page["']`, 'i'), `${fileName}: wrong active navigation item`);
  }
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

const shell = read('navigation-shell.css');
[
  /min-height:58px/,
  /min-height:54px/,
  /safe-area-inset-bottom/,
  /scroll-snap-type:x proximity/,
  /:focus-visible/,
  /prefers-reduced-motion/,
  /prefers-contrast:more/,
  /forced-colors:active/,
  /@media print/,
  /height:100dvh/,
  /touch-action:manipulation/,
].forEach(pattern => assert.match(shell, pattern, `navigation-shell.css missing ${pattern}`));
assert.match(shell, /rgba\(210,154,67,\.72\)[\s\S]*color-mix/, 'navigation CSS must include a fallback before color-mix');
assert.match(shell, /html\.medindex-clean-ui body\.has-app-nav\{padding-left:var\(--medindex-nav-width\)!important\}/, 'clean pages need an explicit shell-width override');
assert.match(shell, /html :is\(#appMenu,\.med-nav,\.atc-nav\)\{/, 'canonical navigation needs an ID-level specificity firewall');
assert.match(shell, /html :is\(#appMenu,\.med-nav,\.atc-nav\) :is\(\.app-menu-link,\.med-nav-link,\.atc-nav-link\)\{/, 'navigation items need an ID-level specificity firewall');
assert.match(shell, /html :is\(#appMenu,\.med-nav,\.atc-nav\)[\s\S]*width:var\(--medindex-nav-width\)!important/, 'specificity firewall must enforce the canonical width');
assert.match(shell, /@media\(max-width:780px\)[\s\S]*html :is\(#appMenu,\.med-nav,\.atc-nav\)[\s\S]*flex-direction:row!important/, 'specificity firewall must protect the mobile bottom navigation');

const navigation = read('navigation-consistency.js');
assert.match(navigation, /ACTIVE_SELECTOR/);
assert.match(navigation, /hasHashTarget/);
assert.match(navigation, /currentHashTarget/);
assert.match(navigation, /ArrowDown/);
assert.match(navigation, /ArrowRight/);
assert.match(navigation, /Home/);
assert.match(navigation, /End/);
assert.match(navigation, /aria-current/);
assert.match(navigation, /className = `\$\{classes\.link\} medindex-common-nav`/);
assert.match(navigation, /bodyObserver\.observe\(document\.body, \{ childList:true \}\)/);
assert.doesNotMatch(navigation, /observe\(document\.body, \{ childList:true, subtree:true \}\)/, 'navigation must not observe the full application subtree');
assert.match(navigation, /observer\.observe\(nav, \{ childList:true, subtree:true \}\)/, 'only navigation subtrees should be observed');
assert.match(navigation, /pageshow/);
assert.match(navigation, /popstate/);
assert.match(navigation, /hashchange/);
assert.match(navigation, /orientationchange/);
assert.match(navigation, /scrollIntoView/);

const bridge = read('main-navigation-extension.js');
assert.match(bridge, /delete link\.dataset\.nav/);
assert.match(bridge, /document\.getElementById\('protocolsBtn'\)/);
assert.match(bridge, /window\.location\.href = '\/recetat\.html'/);

const stability = read('app-stability.js');
assert.doesNotMatch(stability, /clinical-ui\.css|installClinicalUi|installNavigationUi/, 'stability layer must not inject competing visual systems');
assert.match(stability, /syncControlledDisclosures/);
assert.match(stability, /aria-controls/);
assert.match(stability, /rx-popover:not\(\[hidden\]\)/);
assert.match(stability, /button:not\(\[type\]\)/);

console.log('UI and navigation audit tests passed.');
