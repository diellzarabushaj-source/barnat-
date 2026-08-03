const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(ROOT, name), 'utf8');

const pages = {
  dozologjia:read('dozologjia.html'),
  recetat:read('recetat.html'),
  login:read('login.html'),
  recovery:read('recovery.html'),
};

for (const [page, html] of Object.entries(pages)) {
  assert.match(html, new RegExp(`data-mi-page=["']${page}["']`), `${page} must declare its page key before scripts run`);
  const remoteAssets = [...html.matchAll(/(?:src|href)=["'](https?:\/\/[^"']+)["']/gi)].map(match => match[1]);
  if (page === 'login') {
    assert.deepEqual(remoteAssets, ['https://accounts.google.com/gsi/client'], 'login may load only the official Google Identity client');
  } else {
    assert.deepEqual(remoteAssets, [], `${page} must not depend on a CDN`);
  }
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${page} contains a duplicate id`);
}

['dosageContent','dosageSearch','dosagePopulation','dosageForm','dosageAtc','patientWeightKg','patientAgeMonths','dosageStatus','dosageList']
  .forEach(id => assert.match(pages.dozologjia, new RegExp(`id=["']${id}["']`)));
['rxContent','rxSavedCount','rxNew','rxDiagnosis','rxComposer','rxSelectedDrugs','rxFormatLocal','rxGenerate','rxClear','rxPreview','rxSave','rxCopy','rxPrint','rxSavedList']
  .forEach(id => assert.match(pages.recetat, new RegExp(`id=["']${id}["']`)));
['loginForm','password','togglePassword','loginSubmit','loginMessage']
  .forEach(id => assert.match(pages.login, new RegExp(`id=["']${id}["']`)));
['recoveryStatus','recoveryError']
  .forEach(id => assert.match(pages.recovery, new RegExp(`id=["']${id}["']`)));

assert.match(pages.dozologjia, /class="dosage-control-panel"/);
assert.match(pages.dozologjia, /dozologjia-simple-workflow-style-loader\.js\?v=20260801-1/);
assert.match(pages.recetat, /recetat-style-loader\.js\?v=20260801-1/);
assert.ok(pages.recetat.indexOf('tailadmin-professional.js') < pages.recetat.indexOf('recetat-style-loader.js'));
assert.match(pages.login, /class="login-shell auth-page"/);
assert.match(pages.recovery, /class="login-shell auth-page recovery-page"/);

const dosageCss = [
  'dozologjia-verified-cards.css',
  'dozologjia-simple-workflow.css',
  'dozologjia-safety-enhancements.css',
  'dozologjia-clinical-readiness.css',
].map(read).join('\n');
const prescriptionCss = [read('recetat.css'), read('recetat-audit.css'), read('signature-templates.css')].join('\n');
const authCss = read('login.css');

for (const [surface, css] of Object.entries({ dosage:dosageCss, prescription:prescriptionCss, auth:authCss })) {
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\s*\(/i, `${surface} must use flat surfaces`);
  assert.doesNotMatch(css, /url\(\s*["']?https?:\/\//i, `${surface} must not load remote CSS assets`);
}

assert.match(read('dozologjia-simple-workflow.css'), /\.dosage-populations\s*\{\s*order:2;/);
assert.match(read('dozologjia-simple-workflow.css'), /html\.medindex-tailadmin\[data-mi-page="dozologjia"\]/);
assert.match(read('recetat.css'), /@media \(min-width:1200px\)/);
assert.match(read('recetat.css'), /grid-template-columns:minmax\(0,1\.08fr\) minmax\(360px,\.92fr\) !important/);
assert.match(read('recetat.css'), /html\.medindex-tailadmin\[data-mi-page="recetat"\]/);
assert.match(authCss, /html\[data-theme="dark"\]/);
assert.match(authCss, /\.recovery-page/);

['dozologjia-card-style-loader.js','dozologjia-simple-workflow-style-loader.js','recetat-style-loader.js']
  .forEach(file => execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' }));

console.log('Workflow page UI tests passed.');
