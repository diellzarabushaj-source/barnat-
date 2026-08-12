'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const Verification = require('../lib/population-verification.js')._test;

const positive = {
  population:'adult', source_key:'card:12:adult', editorial_status:'published', calculation_status:'text_verified',
  dose_text:'500 mg dy herë në ditë', route:'PO', source_url:'https://example.org/smpc', reviewed_at:'2026-08-01T10:00:00Z',
};
const negative = {
  population:'adult', source_key:'population:12:adult', editorial_status:'published', calculation_status:'contraindicated',
  dose_text:'Kundërindikuar: rrezik i dokumentuar', warnings:'Rrezik i dokumentuar në burimin zyrtar.',
  source_url:'https://example.org/contraindication', reviewed_at:'2026-08-01T11:00:00Z',
};

assert.strictEqual(Verification.populationDecision([positive], 'adult').state, 'yes', 'Doza e plotë dhe burimi HTTPS duhet të japin Po.');
assert.strictEqual(Verification.populationDecision([{ ...positive, source_url:'http://example.org' }], 'adult').state, 'unknown', 'Burimi jo-HTTPS nuk duhet të japë Po.');
assert.strictEqual(Verification.populationDecision([{ ...positive, route:'' }], 'adult').state, 'unknown', 'Mungesa e rrugës nuk duhet të japë Po.');
assert.strictEqual(Verification.populationDecision([negative], 'adult').state, 'no', 'Vendimi negativ i dokumentuar duhet të japë Jo.');
assert.strictEqual(Verification.populationDecision([{ ...negative, source_key:'card:12:adult' }], 'adult').state, 'unknown', 'Një kartelë doze nuk mund të përdoret si vendim negativ eksplicit.');
assert.strictEqual(Verification.populationDecision([positive, negative], 'adult').state, 'conflict', 'Po dhe Jo së bashku duhet të bllokohen si konflikt.');
assert.strictEqual(Verification.populationDecision([], 'pediatric').state, 'unknown', 'Mungesa e të dhënave nuk duhet të shndërrohet në Jo.');

assert.throws(
  () => Verification.normalizeDecisionPayload({ registryNumber:12, population:'pediatric', decision:'contraindicated', sourceUrl:'', evidence:'arsyetim i mjaftueshëm' }),
  /burim HTTPS/i,
  'Vendimi negativ pa burim duhet të refuzohet.'
);
assert.strictEqual(
  Verification.normalizeDecisionPayload({ registryNumber:12, population:'pediatric', decision:'auto' }).decision,
  'auto',
  'Rikthimi në vendim automatik duhet të lejohet.'
);
assert.deepStrictEqual(Verification.parseRegistryNumbers('12,12,13'), [12, 13], 'Numrat duhet të deduplikohen.');

const index = read('index.html');
const loader = read('registry-verification-loader.js');
const ui = read('registry-verification-ui.js');
const styles = read('registry-verification-ui.css');
const endpoint = read('api/clinical-editor.js');
const dosageGatewaySource = read('api/dosage.js');
const approvedPopulationEndpointSource = read('lib/approved-population-handler.js');
const approvedPopulationEndpoint = require('../lib/approved-population-handler.js');
const approvedPopulationSnapshot = require('../data/approved-population-snapshot.json');
const vercel = JSON.parse(read('vercel.json'));

assert(index.includes('registry-verification-ui.css?v=20260801-1'), 'CSS-ja e verifikimit nuk është lidhur.');
assert(index.includes('registry-verification-loader.js?v=20260810-1'), 'Idle loader-i i verifikimit nuk është lidhur.');
assert(loader.includes("window.addEventListener('medindex:registry-ready'"), 'Verifikimi duhet të presë registry-ready.');
assert(loader.includes('requestIdleCallback'), 'Verifikimi duhet të ngarkohet në idle.');
assert(loader.includes('registry-verification-ui.js?v=20260810-1'), 'Loader-i nuk e ngarkon kontrolluesin e verifikimit.');
assert(ui.includes('FAILURE_BACKOFF_BASE_MS = 15000'), 'Retry i verifikimit duhet të ketë backoff fillestar.');
assert(ui.includes('FAILURE_BACKOFF_MAX_MS = 5 * 60 * 1000'), 'Retry i verifikimit duhet të ketë kufi maksimal.');
assert(ui.includes("tableObserver.observe(tbody, { childList:true })"), 'Observer-i nuk duhet të shohë mutacionet e veta në subtree.');
assert(!ui.includes("tableObserver.observe(tbody, { childList:true, subtree:true })"), 'Observer-i rekursiv krijon cikël kërkesash.');
assert(ui.includes('endpointBackoffUntil'), 'Dështimi i endpoint-it duhet të bllokojë retry storm-in.');
assert(ui.includes('metrics:() => Object.freeze'), 'UI-ja duhet të ekspozojë metrikat e retry-ve për audit browser.');
assert(index.includes('data-registry-ui-release="20260809-1"'), 'Release-i unik i tabelës nuk u rrit.');
assert(index.includes('registry-unified-table.js?v=20260812-population-column-1'), 'Kontrolluesi unik i tabelës me kolonën Popullata mungon.');
assert(index.includes('registry-unified-table.css?v=20260812-population-column-1'), 'CSS-ja e tabelës me kolonën Popullata mungon.');
assert(index.includes('registry-dose-clinical-row-markers.js?v=20260812-population-column-1'), 'Runtime-i i klasifikimit të popullatës mungon.');
assert(index.includes('registry-full-text-expansion.css?v=20260805-2'), 'Kontrata e tekstit të plotë mungon.');
assert(ui.includes('data-population-pencil'), 'Ikona e vetme e lapsit mungon.');
assert(ui.includes("state:'unknown'"), 'Gjendja pa të dhëna mungon.');
assert(read('lib/population-verification.js').includes('Mungesa e dozës nuk interpretohet si kundërindikacion'), 'Rregulli fail-closed mungon.');
assert(styles.includes('position:static!important'), 'Kolonat e verifikimit dhe redaktimit duhet të jenë jo-sticky.');
assert(styles.includes('.state-no'), 'Gjendja e kuqe Jo mungon.');
assert(styles.includes('.state-yes'), 'Gjendja e gjelbër Po mungon.');
assert(endpoint.includes("require('../lib/population-verification.js')"), 'Endpoint-i ekzistues nuk përdor backend-in strikt.');
assert(vercel.rewrites.some(item => item.source === '/api/population-verification' && item.destination === '/api/clinical-editor?populationVerification=1'), 'Routing-u i verifikimit mungon.');
assert(!fs.existsSync(path.join(root, 'api/population-verification.js')), 'Verifikimi nuk duhet të konsumojë funksion të ri Vercel.');
assert(!/https?:\/\//.test(ui), 'UI-ja nuk duhet të ngarkojë asete të jashtme.');

assert(dosageGatewaySource.includes("requestView(req) === 'approved-population'"), 'Gateway-i i dozimit duhet ta ekspozojë popullatën e aprovuar.');
assert(dosageGatewaySource.includes('approvedPopulationHandler(req, res)'), 'Gateway-i duhet ta delegojë kërkesën te handler-i i snapshot-it.');
assert(vercel.rewrites.some(item => item.source === '/api/pediatric-only-population' && item.destination === '/api/dosage?view=approved-population'), 'URL-ja kompatibile e popullatës duhet të ripërdorë /api/dosage.');
assert(!fs.existsSync(path.join(root, 'api/pediatric-only-population.js')), 'Popullata e aprovuar nuk duhet të konsumojë funksion të 12-të Vercel.');

const rawSnapshotItems = approvedPopulationEndpoint.snapshotItems(approvedPopulationSnapshot, []);
const rawPediatricOnlyItems = rawSnapshotItems.filter(item => item.approvedPopulation === 'Pediatric only');
const approvedPopulationItems = approvedPopulationEndpoint.snapshotItems(approvedPopulationSnapshot);
const pediatricOnlyItems = approvedPopulationItems.filter(item => item.approvedPopulation === 'Pediatric only');
const allowedPopulations = new Set(['Adult only', 'Pediatric only', 'Pediatric and adult both']);
assert(!approvedPopulationEndpointSource.includes('neonRequest'), 'Handler-i i popullatës duhet të mbetet Neon-free gjatë outage-it.');
assert(approvedPopulationEndpointSource.includes("require('../data/approved-population-snapshot.json')"), 'Handler-i i popullatës duhet të përdorë snapshot-in e Sheet-it.');
assert(approvedPopulationEndpointSource.includes("require('../data/approved-population-overrides-1-500.json')"), 'Handler-i duhet të ruajë override-in 1-500.');
assert(approvedPopulationEndpointSource.includes("require('../data/approved-population-overrides-501-600.json')"), 'Handler-i duhet të ruajë override-in 501-600.');
assert.strictEqual(approvedPopulationSnapshot?.source?.spreadsheetId, '17cuXg5qORIIWkvAxLZ7uz2FMmGvzwjr850cubUcIgLE');
assert.strictEqual(approvedPopulationSnapshot?.source?.sheet, 'KARTELA_BARNAVE');
assert.strictEqual(approvedPopulationSnapshot?.source?.approvedPopulationColumn, 'S');
assert.strictEqual(rawSnapshotItems.length, approvedPopulationSnapshot?.counts?.classified, 'Numri i klasifikimeve në snapshot-in bazë nuk përputhet.');
assert.strictEqual(rawPediatricOnlyItems.length, approvedPopulationSnapshot?.counts?.pediatricOnly, 'Numri Pediatric only në snapshot-in bazë nuk përputhet.');
assert.strictEqual(new Set(approvedPopulationItems.map(item => item.registryNumber)).size, approvedPopulationItems.length, 'Nr rendor duhet të jetë unik pas bashkimit të override-ve.');
assert(approvedPopulationItems.every(item => allowedPopulations.has(item.approvedPopulation)), 'Katalogu i bashkuar përmban kategori popullate të palejuar.');
assert.deepStrictEqual(
  approvedPopulationEndpoint.DEFAULT_OVERRIDE_SETS.map(overrides => overrides?.source?.range),
  ['1-500', '501-600'],
  'Override-et e audituara 1-600 duhet të aplikohen në rendin e deklaruar.'
);
assert(pediatricOnlyItems.length >= 40, 'Katalogu i bashkuar duhet të ruajë kartat pediatrike të audituara 1-600.');
for (const registryNumber of [44, 45, 46, 504]) {
  assert.strictEqual(
    approvedPopulationItems.find(item => item.registryNumber === registryNumber)?.approvedPopulation,
    'Pediatric only',
    `Karta ${registryNumber} duhet të mbetet Pediatric only.`,
  );
}

console.log('Strict adult/pediatric verification + raw Sheet snapshot integrity + approved-population overrides 1-600 passed.');
