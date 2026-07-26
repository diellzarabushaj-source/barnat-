const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const exists = file => fs.existsSync(path.join(ROOT, file));
const pages = ['index.html', 'klasifikimi.html', 'icd.html', 'analizat.html', 'dozologjia.html', 'protokollet.html', 'recetat.html', 'login.html'];

for (const page of pages) {
  assert.ok(exists(page), `${page}: missing`);
  const html = read(page);
  assert.match(html, /<meta\s+name=["']viewport["']/i, `${page}: viewport is missing`);
  assert.match(html, /<title>[^<]+<\/title>/i, `${page}: title is missing`);
  assert.match(html, /lang=["']sq["']/i, `${page}: Albanian document language is missing`);
  const ids = [...html.matchAll(/\sid=["']([^"']+)["']/gi)].map(match => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], [], `${page}: duplicate ids: ${duplicates.join(', ')}`);
}

for (const page of pages.filter(page => page !== 'login.html')) {
  const html = read(page);
  assert.match(html, /auth-client\.js\?v=production-audit-v1/, `${page}: auth guard is missing or stale`);
  assert.match(html, /app-stability\.js\?v=/, `${page}: global stability runtime is missing`);
}

const jsFiles = [
  'app-stability.js', 'sw.js', 'tailadmin-shell.js', 'tailadmin-shell-legacy.js',
  'mobile-experience.js', 'auth-client.js', 'offline-runtime.js', 'app.js',
  'theme-preload.js', 'recetat-safe-print.js',
  'icd.js', 'analizat.js', 'dozologjia.js', 'dozologjia-deep-audit.js',
  'protokollet.js', 'recetat.js',
];
for (const file of jsFiles) {
  assert.ok(exists(file), `${file}: missing`);
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
}

const stability = read('app-stability.js');
assert.match(stability, /const bannerTimers = new Map\(\)/, 'banner timers must not interfere across status types');
assert.match(stability, /getAttribute\('aria-expanded'\) !== value/, 'aria disclosure sync must be idempotent');
assert.match(stability, /#rxDosageChooser/, 'dosage chooser must participate in focus management');
assert.match(stability, /clearPrivateClientCaches/, 'private client caches must clear on logout');
assert.doesNotMatch(stability, /let errorBannerTimer/, 'single shared banner timer must not return');
assert.equal((stability.match(/new MutationObserver/g) || []).length, 1, 'global runtime must use one consolidated DOM observer');

const auth = read('auth-client.js');
[
  'barnat-registry-parts-v4',
  'barnat-registry-cached-at-v4',
  'regjistriBarnave_protokollet_v1',
  'medindexPrescriptionSelection',
  'medindex-prescriptions-v1',
].forEach(key => assert.ok(auth.includes(key), `logout cleanup is missing ${key}`));
assert.match(auth, /CLEAR_PRIVATE_DATA/, 'logout must clear service-worker private caches');
assert.match(auth, /clearSensitiveWebStorage/, 'logout storage cleanup must remain centralized');

const worker = read('sw.js');
assert.match(worker, /csp-static-runtime-20260727-1/, 'service-worker cache epoch is stale');
[
  'app-runtime.js', 'theme-preload.js', 'recetat-safe-print.js',
  'dozologjia-deep-audit.js', 'dozologjia-clinical-readiness.css',
  'analizat-tailwind-cards-v2.css', 'icd-tailadmin-cards-v2.css',
].forEach(asset => assert.ok(worker.includes(asset), `sw.js: ${asset} is missing from the offline shell`));
assert.doesNotMatch(worker, /app-parts\/part-0[1-4]\.txt|app-parts\/core-tail\.txt/, 'source fragments must not be served as offline runtime assets');
assert.match(worker, /forms:\[\], adult:\[\], pediatric:\[\], cards:\[\]/, 'offline dosage fallback must preserve the API shape');
assert.match(worker, /page-network/, 'navigation must remain network-first');
assert.match(worker, /page-hit/, 'navigation must retain an offline fallback');
assert.match(worker, /privateCacheStatus/, 'offline readiness must validate exact clinical datasets');
assert.match(worker, /url\.pathname === '\/api\/gemini-prescription'[\s\S]*geminiResponse/, 'Gemini POST must retain an explicit offline fallback');

const vercel = JSON.parse(read('vercel.json'));
const headers = JSON.stringify(vercel.headers);
assert.doesNotMatch(headers, /unsafe-eval/, 'CSP must not allow unsafe-eval');
assert.match(headers, /script-src 'self'/, 'CSP must restrict scripts to self');
assert.match(headers, /script-src-attr 'none'/, 'CSP must block inline event handlers');
assert.match(headers, /Origin-Agent-Cluster/, 'origin isolation header is missing');
assert.match(headers, /browsing-topics=\(\)/, 'privacy permissions policy is incomplete');
const scriptStyleHeader = vercel.headers.find(entry => String(entry.source).includes('(css|js)'));
assert.ok(scriptStyleHeader, 'CSS/JS cache policy is missing');
assert.match(JSON.stringify(scriptStyleHeader.headers), /max-age=0, must-revalidate/, 'non-hashed CSS/JS must revalidate');
assert.doesNotMatch(JSON.stringify(scriptStyleHeader.headers), /immutable/, 'non-hashed CSS/JS must not be immutable');

const pkg = JSON.parse(read('package.json'));
assert.ok(!pkg.scripts.postbuild, 'production build must not mutate Neon or external datasets');
assert.match(pkg.scripts['build:runtime'] || '', /build-static-runtime/, 'static registry runtime generation must run explicitly');
assert.match(pkg.scripts['sync:neon'] || '', /sync-neon-from-sheets/, 'manual Neon sync command must remain available');

console.log('Site-wide deep audit passed.');
