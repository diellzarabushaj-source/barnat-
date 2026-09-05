const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const pages = ['index.html', 'klasifikimi.html', 'icd.html', 'analizat.html', 'dozologjia.html', 'protokollet.html', 'recetat.html', 'medical-hub.html', 'login.html'];

for (const page of pages) {
  const html = read(page);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  for (const match of scripts) {
    const attributes = match[1] || '';
    const body = String(match[2] || '').trim();
    const external = /\bsrc\s*=/.test(attributes);
    const inertJson = /\btype\s*=\s*["']application\/json["']/i.test(attributes);
    assert.ok(external || inertJson || !body, `${page}: executable inline script remains`);
  }
  assert.doesNotMatch(html, /\son[a-z]+\s*=\s*["']/i, `${page}: inline event handler remains`);
}

const vercel = JSON.parse(read('vercel.json'));
const globalHeaders = vercel.headers.find(entry => entry.source === '/(.*)')?.headers || [];
const csp = globalHeaders.find(header => header.key === 'Content-Security-Policy')?.value || '';
assert.match(csp, /script-src 'self' https:\/\/accounts\.google\.com\/gsi\/client;/, 'CSP must allow only the official Google Identity client in addition to self');
assert.match(csp, /frame-src https:\/\/accounts\.google\.com\/gsi\//, 'CSP must allow only the Google Identity frame');
assert.match(csp, /connect-src 'self' https:\/\/accounts\.google\.com\/gsi\//, 'CSP must allow only the Google Identity connection in addition to self');
assert.match(csp, /style-src 'self' 'unsafe-inline' https:\/\/accounts\.google\.com\/gsi\/style/, 'CSP must allow the official Google Identity style');
assert.match(csp, /script-src-attr 'none'/, 'CSP must block inline event-handler scripts');
assert.doesNotMatch(csp, /script-src[^;]*(?:unsafe-inline|unsafe-eval)/, 'script-src must not contain unsafe-inline or unsafe-eval');
assert.doesNotMatch(csp, /(?:script-src|connect-src|frame-src|style-src)[^;]*\shttps:\s/, 'CSP must not allow a broad HTTPS wildcard');
assert.doesNotMatch(csp, /(?:googleapis\.com|gstatic\.com)(?!\/gsi\/)/, 'CSP must not broadly allow unrelated Google origins');

function browserScripts(directory, relative = '') {
  const blockedDirectories = new Set(['api', 'lib', 'scripts', 'tests', 'node_modules', '.git', '.github']);
  return fs.readdirSync(directory, { withFileTypes:true }).flatMap(entry => {
    if (entry.isDirectory() && blockedDirectories.has(entry.name)) return [];
    const absolute = path.join(directory, entry.name);
    const nextRelative = path.join(relative, entry.name);
    if (entry.isDirectory()) return browserScripts(absolute, nextRelative);
    return entry.isFile() && entry.name.endsWith('.js') ? [nextRelative.replace(/\\/g, '/')] : [];
  });
}

for (const file of browserScripts(root)) {
  const source = read(file);
  assert.doesNotMatch(source, /(^|[^\w$])eval\s*\(/m, `${file}: eval remains in browser code`);
  assert.doesNotMatch(source, /\b(?:new\s+)?Function\s*\(\s*["'`]/, `${file}: Function constructor remains in browser code`);
}

const app = read('app.js');
assert.match(app, /app-runtime\.js/, 'registry UI must load the generated static runtime');
assert.match(app, /parseRegistryPayload/, 'registry payload must be parsed as data');
assert.doesNotMatch(app, /app-parts\/part-|codeParts|registryCode/, 'browser must not fetch and execute source fragments');

assert.ok(fs.existsSync(path.join(root, 'app-runtime.js')), 'generated app-runtime.js is missing');
execFileSync(process.execPath, ['--check', path.join(root, 'app-runtime.js')], { stdio:'pipe' });
assert.match(read('app-runtime.js'), /window\.MEDINDEX_REGISTRY_UI_READY = \(async \(\) => \{/, 'generated runtime must expose an awaitable readiness promise');

const tailadminCss = read('tailadmin-medindex.css');
assert.ok(tailadminCss.length > 25000, 'TailAdmin CSS appears truncated');
assert.match(tailadminCss, /\.mi-sidebar-header/, 'TailAdmin sidebar styles are missing');
assert.match(tailadminCss, /\.mi-content-container/, 'TailAdmin content styles are missing');
assert.match(tailadminCss, /@media/, 'TailAdmin responsive styles are missing');
assert.doesNotMatch(tailadminCss, /fonts\.(?:googleapis|gstatic)\.com/i, 'TailAdmin must not request third-party fonts');
assert.match(tailadminCss, /--mi-font:\s*Inter, ui-sans-serif/, 'TailAdmin must use the local system font stack');
const builder = read('scripts/build-static-runtime.js');
assert.match(builder, /tailadmin-medindex\.css duket i cunguar/, 'build must stop if TailAdmin CSS is truncated');
assert.match(builder, /hardenTailAdminCss/, 'build must remove third-party font imports');

const rxHtml = read('recetat.html');
assert.ok(rxHtml.indexOf('recetat.js') < rxHtml.indexOf('recetat-safe-print.js'), 'safe print must load after the legacy composer');
assert.ok(rxHtml.indexOf('user-library-client.js') < rxHtml.indexOf('recetat.js'), 'persistent library must load before the recipe composer');
const safePrint = read('recetat-safe-print.js');
assert.match(safePrint, /cloneNode\(true\)/, 'safe print must remove the legacy listener');
assert.match(safePrint, /popup\.opener = null/, 'print popup must sever its opener');
assert.doesNotMatch(safePrint, /<script\b/i, 'print output must not inject scripts');

const loginHtml = read('login.html');
assert.match(loginHtml, /theme-preload\.js/, 'login theme preload must be external');
assert.match(loginHtml, /https:\/\/accounts\.google\.com\/gsi\/client/, 'login must load the official Google Identity client');
const middleware = read('middleware.ts');
for (const asset of ['/login.html', '/login.css', '/google-login.css', '/login.js', '/theme-preload.js', '/tailadmin-medindex.css']) {
  assert.ok(middleware.includes(`'${asset}'`), `middleware must allow the required login asset ${asset}`);
}
assert.doesNotMatch(middleware, /pathname\.startsWith\('\/(?:data|app-parts|api\/registry)'\)/, 'clinical datasets must not be public before authentication');

const smoke = read('tests/clinical-smoke-server.js');
assert.match(smoke, /Content-Security-Policy/, 'browser smoke server must enforce CSP');
assert.match(smoke, /JSON\.stringify\(registryMeta\)/, 'browser registry metadata must use valid JSON');

console.log('CSP and dynamic-code hardening audit passed.');
