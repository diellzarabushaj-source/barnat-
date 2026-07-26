const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const pages = ['index.html', 'klasifikimi.html', 'icd.html', 'analizat.html', 'dozologjia.html', 'protokollet.html', 'recetat.html', 'login.html'];

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
assert.match(csp, /script-src 'self'(?:;|$)/, 'CSP must allow scripts only from self');
assert.match(csp, /script-src-attr 'none'/, 'CSP must block inline event-handler scripts');
assert.doesNotMatch(csp, /script-src[^;]*(?:unsafe-inline|unsafe-eval)/, 'script-src must not contain unsafe-inline or unsafe-eval');

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

const rxHtml = read('recetat.html');
assert.ok(rxHtml.indexOf('recetat.js') < rxHtml.indexOf('recetat-safe-print.js'), 'safe print must load after the legacy composer');
const safePrint = read('recetat-safe-print.js');
assert.match(safePrint, /cloneNode\(true\)/, 'safe print must remove the legacy listener');
assert.doesNotMatch(safePrint, /<script\b/i, 'print output must not inject scripts');
assert.match(read('login.html'), /theme-preload\.js/, 'login theme preload must be external');

console.log('CSP and dynamic-code hardening audit passed.');
