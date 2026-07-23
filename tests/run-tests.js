const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const requiredFiles = [
  'index.html','klasifikimi.html','icd.html','analizat.html','login.html',
  'login.css','login.js','auth-client.js','app-stability.js','app-polish.css',
  'middleware.ts','lib/auth.mjs','lib/auth-edge.mjs','api/auth.js','api/registry.js','api/dosage.js','api/health.js',
  'data/registry-quality.js','icd-data.js','lab-data.js','vercel.json','robots.txt',
  ...Array.from({ length: 7 }, (_, index) => `app-parts/part-${String(index + 1).padStart(2, '0')}.txt`),
];

function file(relativePath) { return fs.readFileSync(path.join(ROOT, relativePath), 'utf8'); }
function checkSyntax(relativePath) { execFileSync(process.execPath, ['--check', path.join(ROOT, relativePath)], { stdio: 'pipe' }); }
function duplicateIds(html) {
  const ids = [...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);
  return ids.filter((id, index) => ids.indexOf(id) !== index);
}
function localReferences(html) {
  return [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)]
    .map(match => match[1].split(/[?#]/)[0])
    .filter(value => value && !value.startsWith('#') && !/^(?:https?:|mailto:|tel:|data:)/i.test(value));
}

async function main() {
  console.log('1/9 Required files');
  requiredFiles.forEach(relativePath => assert.ok(fs.existsSync(path.join(ROOT, relativePath)), `Missing ${relativePath}`));
  assert.ok(!fs.existsSync(path.join(ROOT, 'middleware.js')), 'Conflicting middleware.js must not exist');

  console.log('2/9 JSON and JavaScript syntax');
  const vercel = JSON.parse(file('vercel.json'));
  assert.equal(vercel.rewrites?.[0]?.destination, '/api/registry');
  [
    'app.js','login.js','auth-client.js','app-stability.js','main-navigation-extension.js',
    'api/auth.js','api/registry.js','api/registry-data.js','api/dosage.js','api/health.js',
    'data/registry-quality.js','classification-registry-bridge.js','classification-v3.js',
    'classification-audit-view.js','classification-info-v3.js','icd-data.js','icd.js',
    'lab-data.js','analizat.js','dosage-integration.js','dosage-auto-apply.js',
    'prescription-review.js','medindex-view.js','lib/auth.mjs','lib/auth-edge.mjs',
  ].forEach(checkSyntax);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'medindex-test-'));
  const middlewareTemp = path.join(tempDir, 'middleware.mjs');
  fs.writeFileSync(middlewareTemp, file('middleware.ts'));
  execFileSync(process.execPath, ['--check', middlewareTemp], { stdio: 'pipe' });
  const bundleTemp = path.join(tempDir, 'app-bundle.js');
  fs.writeFileSync(bundleTemp, Array.from({ length: 7 }, (_, index) => file(`app-parts/part-${String(index + 1).padStart(2, '0')}.txt`)).join(''));
  execFileSync(process.execPath, ['--check', bundleTemp], { stdio: 'pipe' });

  console.log('3/9 Authentication and session expiry');
  process.env.SESSION_SECRET = 'medindex-test-secret-with-at-least-thirty-two-characters';
  process.env.ACCESS_CODE = ['diellza', '123'].join('');
  const authUrl = `${pathToFileURL(path.join(ROOT, 'lib/auth.mjs')).href}?test=${Date.now()}`;
  const edgeAuthUrl = `${pathToFileURL(path.join(ROOT, 'lib/auth-edge.mjs')).href}?test=${Date.now()}`;
  const auth = await import(authUrl);
  const edgeAuth = await import(edgeAuthUrl);
  assert.equal(auth.verifyAccessCode(['diellza', '123'].join('')), true);
  assert.equal(auth.verifyAccessCode('wrong-password'), false);
  const now = Date.now();
  const token = auth.createSessionToken(now);
  assert.equal(auth.verifySessionToken(token, now + 1000), true);
  assert.equal(await edgeAuth.verifySessionToken(token, now + 1000), true, 'Edge could not verify Node session');
  assert.equal(auth.verifySessionToken(token, now + (8 * 60 * 60 * 1000) + 1000), false);
  assert.equal(await edgeAuth.verifySessionToken(token, now + (8 * 60 * 60 * 1000) + 1000), false);
  assert.match(auth.sessionCookie(token), /HttpOnly/);
  assert.match(auth.sessionCookie(token), /SameSite=Strict/);
  assert.match(auth.sessionCookie(token), /Secure/);

  console.log('4/9 HTML wiring, duplicate IDs and private assets');
  const htmlFiles = ['index.html','klasifikimi.html','icd.html','analizat.html','login.html'];
  const virtualFiles = new Set(['data/registry-data.js']);
  htmlFiles.forEach(relativePath => {
    const html = file(relativePath);
    assert.deepEqual([...new Set(duplicateIds(html))], [], `${relativePath} has duplicate IDs`);
    localReferences(html).forEach(reference => {
      const normalized = reference.replace(/^\.\//, '');
      assert.ok(virtualFiles.has(normalized) || fs.existsSync(path.join(ROOT, normalized)), `${relativePath} references missing ${reference}`);
    });
  });
  ['index.html','klasifikimi.html','icd.html','analizat.html'].forEach(relativePath => {
    const html = file(relativePath);
    assert.match(html, /auth-client\.js/);
    assert.match(html, /app-stability\.js/);
    assert.match(html, /app-polish\.css/);
  });
  assert.match(file('index.html'), /value="500"/);
  assert.match(file('index.html'), /value="4006" hidden/);

  console.log('5/9 No password leakage to browser assets');
  const browserFiles = ['index.html','login.html','login.js','login.css','auth-client.js','app-stability.js','app.js'];
  const forbiddenPassword = ['diellza', '123'].join('');
  browserFiles.forEach(relativePath => assert.equal(file(relativePath).includes(forbiddenPassword), false, `Password leaked in ${relativePath}`));

  console.log('6/9 Registry quality correction and blocking rules');
  const quality = require(path.join(ROOT, 'data/registry-quality.js'));
  const base = {
    'Emri tregtar':'Test','Substanca aktive':'Test','ATC Code':'A01AA01',
    'Klasa / Çka është':'Klasë','Përdorimi (fjalë kyçe)':'Përdorim',
    'Fortësia':'1 mg','Forma farmaceutike':'Tablet',ProtocolNo:'PD0001/010126',PDID:'9999',Statusi:'Gjenerik',
  };
  const result = quality.applyRows([
    { ...base, ProtocolNo:'PD1339/051225', PDID:'42', 'Emri tregtar':'ANALGIN', 'Substanca aktive':'Metronidazole micronised', 'ATC Code':'N02BB02', 'Fortësia':'1 g/2 ml', 'Forma farmaceutike':'Solution for injection' },
    { ...base, 'Emri tregtar':'KETOPROFEN', 'Substanca aktive':'Ketoprofen', 'ATC Code':'M02AA10', 'Klasa / Çka është':'NSAID topik', 'Forma farmaceutike':'Solution for injection' },
    { ...base, ProtocolNo:'Deklarim', PDID:'d.fizike' },
  ]);
  assert.equal(result.rows[0]['Substanca aktive'], 'Metamizole sodium');
  assert.equal(result.rows[0].__qualityStatus, 'corrected');
  assert.equal(result.rows[1].__qualityStatus, 'blocked');
  assert.equal(result.rows[2].__qualityStatus, 'warning');

  console.log('7/9 ICD dataset');
  global.window = {};
  delete require.cache[require.resolve(path.join(ROOT, 'icd-data.js'))];
  require(path.join(ROOT, 'icd-data.js'));
  const icd = global.window.MEDINDEX_ICD10;
  assert.ok(Array.isArray(icd.entries) && icd.entries.length >= 8);
  const icdCodes = new Set();
  icd.entries.forEach(entry => {
    ['code','title','level','parent','summary'].forEach(key => assert.ok(String(entry[key] || '').trim(), `ICD ${entry.code || '?'} missing ${key}`));
    assert.equal(icdCodes.has(entry.code), false, `Duplicate ICD ${entry.code}`);
    icdCodes.add(entry.code);
  });
  ['J85','J85.0','J85.1','J85.2','J85.3','J86','J86.0','J86.9'].forEach(code => assert.ok(icdCodes.has(code), `Missing ICD ${code}`));

  console.log('8/9 Laboratory dataset from user-provided forms only');
  global.window = {};
  delete require.cache[require.resolve(path.join(ROOT, 'lab-data.js'))];
  require(path.join(ROOT, 'lab-data.js'));
  const labs = global.window.MEDINDEX_LABS;
  assert.equal(labs.version, '2026-07-23.2');
  assert.match(labs.sourcePolicy, /Vetëm analizat/);
  assert.ok(Array.isArray(labs.systems) && labs.systems.length === 12);
  assert.ok(Array.isArray(labs.tests) && labs.tests.length === 110);
  const systems = new Set(labs.systems.map(item => item.id));
  const labIds = new Set();
  labs.tests.forEach(test => {
    ['id','system','name','specimen','reference','sourceLabel'].forEach(key => assert.ok(String(test[key] || '').trim(), `Lab ${test.id || '?'} missing ${key}`));
    assert.ok(systems.has(test.system), `Unknown system ${test.system}`);
    assert.equal(labIds.has(test.id), false, `Duplicate lab ${test.id}`);
    assert.equal('sourceUrl' in test, false, `External source URL must not be added to ${test.id}`);
    labIds.add(test.id);
  });
  const byId = id => labs.tests.find(test => test.id === id);
  assert.equal(byId('crp').reference, 'Deri 6');
  assert.equal(byId('crp').unit, 'mg/L');
  assert.equal(byId('sodium').reference, '136–146');
  assert.match(byId('wbc').alternateReference, /3\.5–10\.0/);
  assert.equal(byId('urine-appearance').reference, 'Nuk është shënuar në formular');
  ['ferritin','b12','egfr','hba1c','tsh','ft4'].forEach(id => assert.equal(labIds.has(id), false, `Unapproved laboratory test returned: ${id}`));
  assert.match(file('analizat.html'), /Vetëm analizat/);
  assert.match(file('analizat.js'), /Nga formulari/);

  console.log('9/9 Security and performance invariants');
  assert.match(file('middleware.ts'), /auth-edge\.mjs/);
  assert.doesNotMatch(file('middleware.ts'), /runtime:\s*'nodejs'/);
  assert.match(file('middleware.ts'), /pathname\.startsWith\('\/api\/'\)/);
  assert.match(file('api/registry.js'), /MIN_EXPECTED_ROWS\s*=\s*3500/);
  assert.match(file('api/registry.js'), /authorized\(req\)/);
  assert.match(file('api/dosage.js'), /authorized\(req\)/);
  assert.match(file('api/dosage.js'), /Cache-Control', 'private, no-cache/);
  assert.match(file('vercel.json'), /\/api\/\(\.\*\)/);
  assert.match(file('app-parts/part-03.txt'), /const SEARCH_INDEX = new WeakMap/);
  assert.match(file('app-parts/part-07.txt'), /setTimeout\(applyRegistrySearch, 35\)/);
  assert.match(file('app-parts/part-07.txt'), /requestAnimationFrame/);
  assert.equal(file('robots.txt').trim(), 'User-agent: *\nDisallow: /');

  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log('All MedIndex tests passed.');
}

main().catch(error => {
  console.error('\nTEST FAILURE:', error.stack || error);
  process.exitCode = 1;
});
