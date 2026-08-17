'use strict';

/* Faza 2 — porta e API-së së kalkulatorit pediatrik.
 *
 * Mbron tri gjëra, sipas rendit të rrezikut:
 *
 *   1. Asgjë nga shfletuesi nuk hyn e pafiltruar te një query i Neon-it. Vargu
 *      i kërkimit dhe identifikuesi i barit janë të vetmet hyrje, dhe të dyja
 *      pastrohen para se të prekin `ilike` ose `eq.`.
 *   2. Të gjitha leximet kalojnë portën e egresit te `lib/neon-data-api.js` —
 *      pra asnjëri prej tyre nuk është lexim i gjerë pa kufi.
 *   3. Gatishmëria vjen nga i njëjti klasifikues si auditi, që lista e kërkimit
 *      dhe faqja e produktit të mos thonë dy gjëra për të njëjtin bar.
 *
 * Nuk prek rrjetin: `neonRequest` zëvendësohet me një dyfish që kthen rreshta
 * të njohur dhe i mban shtigjet e kërkuara për t'i kontrolluar.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const dataApiPath = require.resolve(path.join(ROOT, 'lib/neon-data-api.js'));

/* Porta e vërtetë e egresit mbahet para se moduli të zëvendësohet, që shtigjet
   e ndërtuara të maten me rregullin e prodhimit, jo me një kopje. */
const { assertEgressSafeRead } = require(dataApiPath);

const READY_ROW = {
  id:'11111111-2222-4333-8444-555555555555',
  registry_number:42,
  pdid:'PD-42',
  trade_name:'Amoksicilinë',
  active_substance:'amoxicillinum',
  strength:'250 mg/5 mL',
  pharmaceutical_form:'suspension',
  pediatric_dose_summary:'25–50 mg/kg/ditë, e ndarë në 3 doza',
  pediatric_indication:'Infeksion i rrugëve të frymëmarrjes',
  pediatric_use_status:'LEJOHET',
  pediatric_min_age_value:1, pediatric_min_age_unit:'muaj',
  pediatric_dose_min:25, pediatric_dose_max:50, pediatric_dose_unit:'mg',
  pediatric_dose_basis:'kg/ditë', pediatric_doses_per_day:3,
  pediatric_max_single_value:1000, pediatric_max_single_unit:'mg',
  pediatric_max_daily_value:3000, pediatric_max_daily_unit:'mg',
  pediatric_route:'oral',
  pediatric_concentration_value:250, pediatric_concentration_unit:'mg',
  pediatric_concentration_per_value:5, pediatric_concentration_per_unit:'mL',
  pediatric_source_url:'https://www.bnf.org/', pediatric_source_section:'Infections',
  pediatric_verification_status:'verified', pediatric_verified_at:'2026-08-01',
  pediatric_primary_regimen_id:'reg-42',
};

const TEXT_ROW = {
  ...READY_ROW,
  id:'99999999-8888-4777-8666-555555555555',
  registry_number:43,
  trade_name:'Amoksiklav',
  pediatric_verification_status:'in_review',
};

const REGIMEN_ROW = {
  id:'reg-42',
  population:'Pediatric',
  dose_text:'25–50 mg/kg/ditë',
  route:'oral',
  frequency_text:'çdo 8 orë',
  duration_text:'5–7 ditë',
  maximum_text:'maks. 3 g/ditë',
  warnings:'Alergji ndaj penicilinave.',
  indication_text:'Otitis media',
  source_url:'https://www.bnf.org/',
  reviewed_at:'2026-07-20',
  source_key:'card:42:pediatric',
  calculation_status:'calculable_verified',
};

const requestedPaths = [];
let drugRows = [READY_ROW, TEXT_ROW];
let regimenRows = [REGIMEN_ROW];
let regimenShouldFail = false;

require.cache[dataApiPath] = {
  id:dataApiPath,
  filename:dataApiPath,
  loaded:true,
  exports:{
    neonRequest:async requestPath => {
      requestedPaths.push(requestPath);
      if (requestPath.startsWith('dosage_regimens?')) {
        if (regimenShouldFail) throw new Error('Neon Data API 500: regjimet dështuan.');
        return { data:regimenRows };
      }
      return { data:drugRows };
    },
  },
};

const handler = require(path.join(ROOT, 'lib/pediatric-dosage-handler.js'));
const { STATUS } = require(path.join(ROOT, 'lib/pediatric-readiness.js'));
const {
  searchToken, drugSelector, limitOf, searchPath, productPath, regimenPath,
  rankSearchRow, typedRegimen,
} = handler._test;

// ------------------------------------------------------ pastrimi i vargut

/* Shenjat që kanë kuptim te PostgREST: `%` dhe `*` janë xhoker, presja i ndan
   argumentet e `or(...)`, kllapat e mbyllin atë. Asnjëra nuk guxon të kalojë. */
for (const evil of [
  'amoks*', 'amoks%', 'amoks,active_substance.ilike.*', 'amoks)', 'amoks(x',
  'amoks%25', '*,*', 'a%b*c(d)e,f',
]) {
  const token = searchToken(evil);
  assert.ok(!/[%*(),]/.test(token), `Tokeni "${token}" mbajti një shenjë kontrolli nga "${evil}".`);
}

assert.equal(searchToken('  amoksicilinë  '), 'amoksicilinë');
assert.equal(searchToken('a'), '', 'Një shkronjë e vetme nuk kërkon.');
assert.equal(searchToken(''), '');
assert.equal(searchToken(null), '');
assert.equal(searchToken('mg amoksicilinë'), 'amoksicilinë', 'Merret tokeni më i gjatë, jo i pari.');
assert.ok(searchToken('x'.repeat(200)).length <= 48, 'Tokeni pritet te 48 shenja.');

/* Edhe pasi tokeni pastrohet, shtegu i ndërtuar duhet kontrolluar — po jo duke
   kërkuar tekstin e injektuar brenda tij. Provova ashtu në fillim dhe pohimi
   ra: teksti *është* aty, si vlerë e `ilike`, dhe aty nuk bën dëm. Ajo që ka
   rëndësi është struktura: sa filtra ka query-ja dhe kush i vendos. Prandaj
   shtegu analizohet, jo lexohet si varg. */
const injectedToken = searchToken('amoks,is_published.eq.false');
const injected = new URLSearchParams(searchPath(injectedToken, 20).split('?')[1]);

assert.equal(injected.get('is_published'), 'eq.true',
  'Filtri i publikimit vendoset nga serveri dhe nuk ndryshohet nga kërkimi.');
assert.equal(injected.get('editorial_status'), 'eq.published');
assert.equal(
  injected.get('or'),
  `(trade_name.ilike.*${injectedToken}*,active_substance.ilike.*${injectedToken}*)`,
  'Grupi `or` duhet të mbetet me dy argumente — teksti i përdoruesit nuk del dot prej tyre.',
);
assert.equal([...injected.keys()].length, 6,
  'Query-ja e kërkimit ka gjashtë parametra fiks; asnjë i shtatë nuk vjen nga jashtë.');

// ------------------------------------------------- identifikuesi i produktit

assert.deepEqual(drugSelector('11111111-2222-4333-8444-555555555555'),
  { column:'id', value:'11111111-2222-4333-8444-555555555555' });
assert.deepEqual(drugSelector('42'), { column:'registry_number', value:'42' });
assert.deepEqual(drugSelector(' 42 '), { column:'registry_number', value:'42' });

for (const evil of [
  '', 'abc', '42 or 1=1', 'eq.42', '*', '42,43', '42)', 'null', '-1', '4.2',
  '11111111-2222-4333-8444-555555555555 ; drop', '9'.repeat(20),
]) {
  assert.equal(drugSelector(evil), null, `Identifikuesi "${evil}" nuk duhet pranuar.`);
}

// ------------------------------------------------------------- kufijtë

assert.equal(limitOf(undefined), 20);
assert.equal(limitOf('5'), 5);
assert.equal(limitOf('9999'), 40, 'Kufiri pritet te maksimumi.');
assert.equal(limitOf('0'), 1);
assert.equal(limitOf('-7'), 1);
assert.equal(limitOf('jo numër'), 20);

// ------------------------------------------------- porta e egresit të Neon-it

/* Të tre shtigjet kalojnë nëpër rregullin e vërtetë të egresit. Një lexim i
   gjerë pa kufi te `drugs` do të hidhte gabim këtu — dhe do ta hidhte edhe në
   prodhim, prandaj kapet tani. */
for (const built of [
  searchPath('amoks', 40),
  searchPath('amoks', 20),
  productPath({ column:'id', value:READY_ROW.id }),
  productPath({ column:'registry_number', value:'42' }),
  regimenPath(READY_ROW.id),
]) {
  assert.doesNotThrow(() => assertEgressSafeRead(built, { method:'GET' }),
    `Porta e egresit e bllokoi ${built}.`);
}

// Vetëm barnat e publikuara dhe regjimet e verifikuara.
assert.ok(searchPath('amoks', 20).includes('editorial_status=eq.published'));
assert.ok(productPath({ column:'id', value:READY_ROW.id }).includes('is_published=eq.true'));
assert.ok(regimenPath(READY_ROW.id).includes('calculation_status=in.%28text_verified%2Ccalculable_verified%29'));
assert.ok(regimenPath(READY_ROW.id).includes('population=ilike.*pediatric*'),
  'Faqja e produktit pediatrik nuk guxon të tërheqë regjime të të rriturve.');

async function main() {
// ------------------------------------------------------------------ kërkimi

requestedPaths.length = 0;
const search = await handler.searchDrugs('amoksicilinë', '10');
assert.equal(search.token, 'amoksicilinë');
assert.equal(search.results.length, 2);
assert.equal(requestedPaths.length, 1, 'Kërkimi bën një lexim të vetëm.');

const [first, second] = search.results;
assert.equal(first.name, 'Amoksicilinë');
assert.equal(first.readiness, STATUS.CALCULATOR_READY);
assert.equal(first.calculable, true);
assert.equal(first.registryNumber, 42);
assert.deepEqual(first.requires, { weight:true, height:false, age:true, indication:true });

assert.equal(second.readiness, STATUS.TEXT_ONLY, 'Një regjim i paverifikuar mbetet tekst edhe te lista.');
assert.equal(second.calculable, false);

/* Rendi ndjek emrin, jo gatishmërinë: mjeku që shkruan një emër pret atë bar. */
assert.equal(rankSearchRow(READY_ROW, 'amoks'), 0);
assert.equal(rankSearchRow({ trade_name:'X', active_substance:'amoxicillinum' }, 'amox'), 2);
assert.equal(rankSearchRow({ trade_name:'X', active_substance:'Y' }, 'amox'), 4);

// Një varg shumë i shkurtër nuk e prek fare bazën.
requestedPaths.length = 0;
const empty = await handler.searchDrugs('a');
assert.deepEqual(empty, { token:'', results:[] });
assert.equal(requestedPaths.length, 0, 'Kërkimi bosh nuk guxon të prekë Neon-in.');

// ----------------------------------------------------------------- produkti

drugRows = [READY_ROW];
requestedPaths.length = 0;
const { product } = await handler.loadProduct('42');
assert.equal(product.drugId, READY_ROW.id);
assert.equal(product.readiness, STATUS.CALCULATOR_READY);
assert.equal(product.calculable, true);
assert.equal(product.regimen.basis, 'kg/ditë');
assert.equal(product.regimen.dosesPerDay, 3);
assert.deepEqual(product.regimen.caps, {
  maxSingle:1000, maxSingleUnit:'mg', maxDaily:3000, maxDailyUnit:'mg',
});
assert.equal(product.regimen.concentration.value, 250);
assert.equal(product.source.verificationStatus, 'verified');
assert.equal(product.textRegimens.length, 1);
assert.equal(product.textRegimens[0].regimenId, 'reg-42');
assert.equal(product.textRegimens[0].warnings, 'Alergji ndaj penicilinave.');
assert.equal(requestedPaths.length, 2, 'Produkti lexon barin dhe regjimet e tij.');

const missingProduct = await handler.loadProduct('nuk-është-id');
assert.equal(missingProduct.status, 400);
drugRows = [];
const notFound = await handler.loadProduct('42');
assert.equal(notFound.status, 404);

/* Regjimet tekstuale janë shtesë, jo kusht: nëse tabela e tyre bie, produkti
   duhet të kthehet prapëseprapë me dozimin e typed-uar. Ndryshe një defekt te
   një tabelë dytësore do ta zbrazte kalkulatorin. */
drugRows = [READY_ROW];
regimenShouldFail = true;
const resilient = await handler.loadProduct('42');
assert.equal(resilient.product.readiness, STATUS.CALCULATOR_READY);
assert.deepEqual(resilient.product.textRegimens, []);
regimenShouldFail = false;

// Përqendrimi i paplotë nuk kthehet si i plotë.
const noConcentration = typedRegimen(
  { ...READY_ROW, pediatric_concentration_per_value:null },
  { caps:{}, volume:{ canConvertToVolume:false } },
);
assert.equal(noConcentration.concentration, null);

// --------------------------------------------------------------- porta HTTP

function fakeRes() {
  const res = { statusCode:0, headers:{}, body:null, ended:false };
  res.setHeader = (key, value) => { res.headers[key] = value; };
  res.status = code => { res.statusCode = code; return res; };
  res.json = body => { res.body = body; return res; };
  res.end = () => { res.ended = true; return res; };
  return res;
}

const rejected = fakeRes();
await handler({ method:'POST', url:'/api/dosage?view=pediatric-search', headers:{} }, rejected);
assert.equal(rejected.statusCode, 405);
assert.equal(rejected.headers.Allow, 'GET, HEAD');

/* Pa sesion nuk kthehet asnjë e dhënë bari. Kjo mbrohet edhe te
   `middleware.ts`, po porta e dytë këtu e mban të vërtetë edhe nëse rishkrimi
   ndryshon nesër. */
const anonymous = fakeRes();
await handler({ method:'GET', url:'/api/dosage?view=pediatric-search&q=amoks', headers:{} }, anonymous);
assert.equal(anonymous.statusCode, 401);
assert.equal(anonymous.body.ok, false);
assert.equal(anonymous.headers['Cache-Control'], 'private, no-cache, max-age=0');

} // main

main().then(() => {
/* ------------------------------------------------------ lidhja me /api/dosage

   `api/dosage.js` lexohet si tekst, jo si modul: zinxhiri i tij i kërkesave
   përfshin `xlsx`, dhe kjo portë duhet të xhirojë edhe pa `node_modules` — aty
   ku ka më shumë gjasa të xhirojë, dhe ku ka më shumë vlerë. */
const dosageSource = fs.readFileSync(path.join(ROOT, 'api/dosage.js'), 'utf8');
assert.match(dosageSource, /require\('\.\.\/lib\/pediatric-dosage-handler\.js'\)/);
assert.match(dosageSource, /function isPediatricRequest\(req\)/);
assert.match(dosageSource, /if \(isPediatricRequest\(req\)\) return pediatricDosageHandler\(req, res\);/);

/* Dërgesa pediatrike duhet të vijë pas atyre ekzistuese dhe para dërgesës
   parazgjedhëse, ndryshe ose i mbulon ato ose nuk arrihet kurrë. */
const pediatricDispatch = dosageSource.indexOf('if (isPediatricRequest(req))');
const calculatorDispatch = dosageSource.indexOf('if (isCalculatorRequest(req))');
const defaultDispatch = dosageSource.indexOf('return dosageHandler(req, res);');
assert.ok(calculatorDispatch < pediatricDispatch && pediatricDispatch < defaultDispatch,
  'Dërgesa pediatrike duhet të rrijë mes pamjeve ekzistuese dhe asaj parazgjedhëse.');

// ---------------------------------------------------- rishkrimet te vercel.json

const vercel = require(path.join(ROOT, 'vercel.json'));
const rewriteFor = source => vercel.rewrites.find(rule => rule.source === source);

assert.equal(rewriteFor('/api/dosage/search')?.destination, '/api/dosage?view=pediatric-search');
assert.equal(rewriteFor('/api/dosage/product/:drugId')?.destination,
  '/api/dosage?view=pediatric-product&drugId=:drugId');

/* Buxheti i Hobby-t është arsyeja pse këto janë rishkrime. Nëse dikush i kthen
   në skedarë te `api/`, ky pohim bie para se ta bëjë deploy-i. */
const functionFiles = fs.readdirSync(path.join(ROOT, 'api')).filter(name => name.endsWith('.js'));
assert.ok(!functionFiles.includes('dosage-search.js') && !functionFiles.includes('dosage-product.js'),
  'API-ja pediatrike duhet të mbetet rishkrim mbi /api/dosage, jo funksion i ri.');

console.log(
  'Pediatric dosage API passed: vargu dhe identifikuesi pastrohen para query-t, të tre shtigjet '
  + 'kalojnë portën e egresit, gatishmëria vjen nga i njëjti klasifikues, dhe rrugët mbeten '
  + 'rishkrime mbi /api/dosage.',
);
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
