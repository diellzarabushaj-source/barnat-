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
const vercel = JSON.parse(read('vercel.json'));

assert(index.includes('registry-verification-ui.css?v=20260801-1'), 'CSS-ja e verifikimit nuk është lidhur.');
assert(index.includes('registry-verification-loader.js?v=20260801-1'), 'Idle loader-i i verifikimit nuk është lidhur.');
assert(loader.includes("window.addEventListener('medindex:registry-ready'"), 'Verifikimi duhet të presë registry-ready.');
assert(loader.includes('requestIdleCallback'), 'Verifikimi duhet të ngarkohet në idle.');
assert(loader.includes('registry-verification-ui.js?v=20260801-1'), 'Loader-i nuk e ngarkon kontrolluesin e verifikimit.');
assert(index.includes('data-registry-ui-release="20260801-11"'), 'Release-i i tabelës nuk u rrit.');
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

console.log('Strict adult/pediatric population verification and compact pencil UI audit passed.');
