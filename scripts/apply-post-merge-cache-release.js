const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const RELEASE = 'production-audit-v1';
const SELF = path.relative(ROOT, __filename).replaceAll('\\', '/');
const TEMP_WORKFLOW = '.github/workflows/apply-post-merge-cache-release.yml';
const TEXT_EXTENSIONS = new Set(['.js', '.html', '.css', '.json', '.yml', '.yaml', '.md', '.txt', '.webmanifest']);
const changed = [];

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.vercel'].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (TEXT_EXTENSIONS.has(path.extname(entry.name)) || entry.name.endsWith('.webmanifest')) files.push(full);
  }
  return files;
}

function writeIfChanged(file, before, after) {
  if (before === after) return;
  fs.writeFileSync(file, after);
  changed.push(path.relative(ROOT, file).replaceAll('\\', '/'));
}

for (const file of walk(ROOT)) {
  const relative = path.relative(ROOT, file).replaceAll('\\', '/');
  if (relative === SELF || relative === TEMP_WORKFLOW) continue;
  const before = fs.readFileSync(file, 'utf8');
  let after = before
    .replaceAll('clinical-audit-v2', RELEASE)
    .replaceAll('clinical-audit-v3', RELEASE)
    .replaceAll('clinical-audit-v4', RELEASE)
    .replaceAll('mobile-audit-v1', RELEASE)
    .replaceAll('tailadmin-shell.js?v=20260724-3', `tailadmin-shell.js?v=${RELEASE}`)
    .replaceAll('tailadmin-professional.js?v=20260724-1', `tailadmin-professional.js?v=${RELEASE}`);
  writeIfChanged(file, before, after);
}

const swPath = path.join(ROOT, 'sw.js');
{
  const before = fs.readFileSync(swPath, 'utf8');
  let after = before;
  if (!after.includes("'/tailadmin-shell-legacy.js'")) {
    after = after.replace(
      "'/tailadmin-shell.js', '/tailadmin-professional.js', '/offline-runtime.js',",
      "'/tailadmin-shell.js', '/tailadmin-shell-legacy.js', '/tailadmin-professional.js', '/mobile-experience.js', '/offline-runtime.js',"
    );
  }
  writeIfChanged(swPath, before, after);
}

const browserWorkflowPath = path.join(ROOT, '.github/workflows/physician-browser-audit.yml');
{
  const before = fs.readFileSync(browserWorkflowPath, 'utf8');
  let after = before;
  if (!/\n\s*push:\s*\n\s*branches:\s*\[main\]/.test(after)) {
    after = after.replace('on:\n  pull_request:', 'on:\n  push:\n    branches: [main]\n  pull_request:');
  }
  writeIfChanged(browserWorkflowPath, before, after);
}

const auditPath = path.join(ROOT, 'tests/cache-coherence-audit-test.js');
const auditSource = `const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const RELEASE = '${RELEASE}';
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const pages = ['index.html', 'klasifikimi.html', 'icd.html', 'analizat.html', 'dozologjia.html', 'protokollet.html', 'recetat.html'];

for (const page of pages) {
  const html = read(page);
  assert.match(html, new RegExp('tailadmin-shell\\\\.js\\\\?v=' + RELEASE), page + ': shell cache token is stale');
  assert.match(html, new RegExp('tailadmin-professional\\\\.js\\\\?v=' + RELEASE), page + ': professional UI cache token is stale');
  assert.match(html, new RegExp('auth-client\\\\.js\\\\?v=' + RELEASE), page + ': auth cache token is stale');
}

const critical = ['sw.js', 'offline-runtime.js', 'auth-client.js', 'tailadmin-shell.js', 'tailadmin-professional.js', 'clinical-workflow.js', 'mobile-experience.js'];
for (const file of critical) {
  const source = read(file);
  assert.ok(source.includes(RELEASE), file + ': release token is missing');
  assert.doesNotMatch(source, /clinical-audit-v[234]|mobile-audit-v1/, file + ': stale runtime token remains');
}

const worker = read('sw.js');
assert.match(worker, /tailadmin-shell-legacy\\.js/, 'legacy shell is not precached');
assert.match(worker, /mobile-experience\\.js/, 'mobile runtime is not precached');
assert.match(worker, new RegExp("VERSION = '" + RELEASE + "'"), 'service-worker cache namespace is stale');

const workflow = read('.github/workflows/physician-browser-audit.yml');
assert.match(workflow, /push:\\s*\\n\\s*branches:\\s*\\[main\\]/, 'browser audit must run after merges to main');
assert.match(workflow, /pull_request:/, 'browser audit must still protect pull requests');

const vercel = read('vercel.json');
assert.match(vercel, /max-age=31536000, immutable/, 'immutable asset policy changed unexpectedly');
assert.match(vercel, /no-cache, no-store, must-revalidate/, 'service worker must remain non-cacheable');

console.log('Production cache coherence and post-merge audit gate passed.');
`;
const previousAudit = fs.existsSync(auditPath) ? fs.readFileSync(auditPath, 'utf8') : '';
writeIfChanged(auditPath, previousAudit, auditSource);

const packagePath = path.join(ROOT, 'package.json');
{
  const before = fs.readFileSync(packagePath, 'utf8');
  const pkg = JSON.parse(before);
  const command = 'node tests/cache-coherence-audit-test.js';
  if (!pkg.scripts.test.includes(command)) pkg.scripts.test += ` && ${command}`;
  const after = `${JSON.stringify(pkg, null, 2)}\n`;
  writeIfChanged(packagePath, before, after);
}

if (!changed.length) throw new Error('No production cache-coherence changes were applied.');
console.log(`Applied ${changed.length} production audit changes:\n- ${changed.join('\n- ')}`);
