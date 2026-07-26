const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

['clinical-workflow.js', 'local-registry.js', 'sw.js', 'offline-runtime.js', 'auth-client.js', 'prescription-bridge.js'].forEach(file => {
  assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} mungon`);
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
});

const workflow = read('clinical-workflow.js');
[
  /miCommandPalette/, /Kërko bar/, /Kërko diagnozën/, /Kërko analizën/, /Kërko dozologjinë/,
  /medindex_rx_diagnosis_v1/, /Përdore në recetë/, /medindex_rx_autodraft_v1/,
  /Drafti ruhet automatikisht/, /Eksporto kopjen/, /Importo kopjen/, /Zhbëje/,
  /beforeunload/, /data-delete-saved/, /data-rx-command="drug"/, /MedIndexLocalRegistry/,
  /stopImmediatePropagation/, /rxDosageChooser/,
].forEach(pattern => assert.match(workflow, pattern, `Rrjedha klinike mungon ${pattern}`));

const bridge = read('prescription-bridge.js');
[
  /medindex_rx_autodraft_v1/, /medindex_rx_diagnosis_v1/, /DRAFT_MAX_AGE/, /rxComposer/,
  /rxDiagnosis/, /pendingDiagnosis/, /dispatchEvent\(new Event\('input'/,
  /medindex:clinical-workflow-ready/, /medindex:prescription-context-ready/,
].forEach(pattern => assert.match(bridge, pattern, `Ura ICD→Recetë mungon ${pattern}`));
const prescriptionHtml = read('recetat.html');
assert.equal((prescriptionHtml.match(/prescription-bridge\.js/gi) || []).length, 1, 'Ura ICD→Recetë duhet të ngarkohet vetëm një herë');
assert.match(prescriptionHtml, /prescription-bridge\.js\?v=production-audit-v1/, 'Versioni i cache-it të urës ICD→Recetë është i vjetër');
assert.ok(prescriptionHtml.indexOf('auth-client.js') < prescriptionHtml.indexOf('prescription-bridge.js'), 'Auth duhet të ngarkohet para urës ICD→Recetë');
assert.ok(prescriptionHtml.indexOf('prescription-bridge.js') < prescriptionHtml.indexOf('recetat.js'), 'Ura ICD→Recetë duhet të dëgjojë para inicializimit të recetës');

const localRegistry = read('local-registry.js');
[
  /medindex-registry-v1/, /indexedDB\.open/, /DecompressionStream\('gzip'\)/,
  /\/api\/registry/, /qualityStatus/, /blocked/, /async function search/,
].forEach(pattern => assert.match(localRegistry, pattern, `Kërkimi lokal mungon ${pattern}`));
assert.doesNotMatch(localRegistry, /\/api\/drug-search/, 'Kërkimi lokal nuk duhet të varet nga endpoint-i i kërkimit');

const worker = read('sw.js');
assert.match(worker, /production-audit-v1/);
assert.match(worker, /clinical-workflow\.js/);
assert.match(worker, /local-registry\.js/);
assert.match(worker, /page-network/);
assert.match(worker, /page-hit/);
assert.match(worker, /async function navigationResponse/);
assert.match(worker, /new Request\(request, \{ cache:'no-store' \}\)/, 'navigation must remain network-first');
assert.match(worker, /event\.waitUntil\(putIfCacheable\(PAGE_CACHE/, 'fresh navigation responses must be persisted through the fetch event lifetime');
assert.doesNotMatch(worker, /self\.waitUntil/, 'Service worker nuk duhet të thërrasë self.waitUntil');
assert.match(worker, /MEDINDEX_AUTH_INVALID/);
assert.match(worker, /\/api\/drug-search/);

const auth = read('auth-client.js');
assert.match(auth, /AUTH_TIMEOUT_MS = 3200/);
assert.match(auth, /if \(!navigator\.onLine\)/);
assert.match(auth, /offline-no-lease/);
assert.match(auth, /response\.status === 401 \|\| response\.status === 403/);
assert.match(auth, /medindex:offline-auth-invalid/);
assert.match(auth, /production-audit-v1/);

const runtime = read('offline-runtime.js');
assert.match(runtime, /clinical-workflow\.js/);
assert.match(runtime, /Përditësim gati/);
assert.match(runtime, /Sinkronizimi nuk u konfirmua/);
assert.match(runtime, /max-width:760px/);
assert.doesNotMatch(runtime, /setStatus\('ready'.*12000/s, 'Runtime-i nuk duhet të deklarojë sukses pa konfirmim');

console.log('Physician-first clinical journey audit passed.');