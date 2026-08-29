'use strict';

/* Kontrata e API-së pediatrike: klienti dërgon vetëm pacientin + identifikuesin
 * server-owned të regjimit. Formula typed nuk mund të përdoret me një regjim
 * tjetër, edhe kur ai regjim i përket të njëjtit bar.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const dataApiPath = require.resolve(path.join(ROOT, 'lib/medindex-data-api.js'));
const { assertEgressSafeRead } = require(dataApiPath);

const READY_ROW = {
  id:'11111111-2222-4333-8444-555555555555',
  registry_number:42,
  pdid:'PD-42',
  trade_name:'Amoksicilinë',
  active_substance:'amoxicillinum',
  strength:'250 mg/5 mL',
  pharmaceutical_form:'suspension',
  atc_code:'J01CA04',
  registry_search_text:'amoksiciline amoxicillin suspension 250 mg 5 ml J01CA04',
  pediatric_dose_summary:'25–50 mg/kg/ditë, e ndarë në 3 doza',
  pediatric_indication:'Infeksion i rrugëve të frymëmarrjes',
  pediatric_use_status:'LEJOHET',
  pediatric_min_age_value:1,
  pediatric_min_age_unit:'muaj',
  pediatric_dose_min:25,
  pediatric_dose_max:50,
  pediatric_dose_unit:'mg',
  pediatric_dose_basis:'kg/ditë',
  pediatric_doses_per_day:3,
  pediatric_max_single_value:1000,
  pediatric_max_single_unit:'mg',
  pediatric_max_daily_value:3000,
  pediatric_max_daily_unit:'mg',
  pediatric_route:'oral',
  pediatric_concentration_value:250,
  pediatric_concentration_unit:'mg',
  pediatric_concentration_per_value:5,
  pediatric_concentration_per_unit:'mL',
  pediatric_source_url:'https://www.bnf.org/',
  pediatric_source_section:'Infections',
  pediatric_verification_status:'verified',
  pediatric_verified_at:'2026-08-01',
  /* Në prodhim kjo fushë mban source_key, jo UUID. */
  pediatric_primary_regimen_id:'card:42:pediatric',
};

const TEXT_ROW = {
  ...READY_ROW,
  id:'99999999-8888-4777-8666-555555555555',
  registry_number:43,
  trade_name:'Amoksiklav',
  atc_code:'J01CR02',
  registry_search_text:'amoksiklav amoxicillin clavulanate J01CR02',
  pediatric_primary_regimen_id:'card:43:pediatric',
  pediatric_verification_status:'in_review',
};

const REGIMEN_ROW = {
  id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  drug_id:READY_ROW.id,
  source_key:'card:42:pediatric',
  population:'pediatric',
  dose_text:'25–50 mg/kg/ditë',
  route:'oral',
  frequency_text:'çdo 8 orë',
  duration_text:'5–7 ditë',
  maximum_text:'maks. 3 g/ditë',
  warnings:'Alergji ndaj penicilinave.',
  indication_text:'Infeksion i rrugëve të frymëmarrjes',
  source_url:'https://www.bnf.org/',
  reviewed_at:'2026-07-20',
  calculation_status:'text_verified',
};

const SECONDARY_REGIMEN_ROW = {
  ...REGIMEN_ROW,
  id:'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
  source_key:'card:42:pediatric:secondary',
  indication_text:'Otitis media – regjim tjetër informues',
};

const TEXT_REGIMEN_ROW = {
  ...REGIMEN_ROW,
  id:'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa',
  source_key:'card:43:pediatric',
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
        if (regimenShouldFail) throw new Error('Supabase Data API 500: regjimet dështuan.');
        return { data:regimenRows };
      }
      return { data:drugRows };
    },
  },
};

const handler = require(path.join(ROOT, 'lib/pediatric-dosage-handler.js'));
const { STATUS } = require(path.join(ROOT, 'lib/pediatric-readiness.js'));
const {
  searchTokens, searchToken, rowMatchesTokens, searchFacets,
  drugSelector, limitOf, searchPath, productPath, regimenPath, searchBindingPath,
  rankSearchRow, typedRegimen, publicRegimen, calculationBinding,
} = handler._test;

// ----------------------------------------------------------- query safety
for (const evil of [
  'amoks*', 'amoks%', 'amoks,active_substance.ilike.*', 'amoks)', 'amoks(x',
  'amoks%25', '*,*', 'a%b*c(d)e,f',
]) {
  assert.ok(!/[%*(),]/.test(searchToken(evil)));
}
assert.equal(searchToken('  amoksicilinë  '), 'amoksicilinë');
assert.equal(searchToken('a'), '');
assert.equal(searchToken('mg amoksicilinë'), 'amoksicilinë');
assert.deepEqual(searchTokens('amoksicilinë 250 mg'), ['amoksicilinë', '250', 'mg']);
assert.equal(searchTokens('amoks amoks 250').length, 2);
assert.equal(rowMatchesTokens(READY_ROW, ['amoksicilinë','250']), true);
assert.equal(rowMatchesTokens(READY_ROW, ['J01CA04','suspension']), true);
assert.equal(rowMatchesTokens(TEXT_ROW, ['J01CA04']), false);
assert.ok(searchToken('x'.repeat(200)).length <= 48);

assert.deepEqual(drugSelector(READY_ROW.id), { column:'id', value:READY_ROW.id });
assert.deepEqual(drugSelector('42'), { column:'registry_number', value:'42' });
for (const evil of ['', 'abc', '42 or 1=1', 'eq.42', '*', '42,43', '-1', '4.2']) {
  assert.equal(drugSelector(evil), null);
}
assert.equal(limitOf(undefined), 30);
assert.equal(limitOf('9999'), 50);
assert.equal(limitOf('0'), 1);

const injectedToken = searchToken('amoks,is_published.eq.false');
const injected = new URLSearchParams(searchPath(injectedToken, 20).split('?')[1]);
assert.equal(injected.get('is_published'), 'eq.true');
assert.equal(injected.get('editorial_status'), 'eq.published');
assert.equal([...injected.keys()].length, 6);
assert.match(injected.get('or') || '', /atc_code\.ilike/);
assert.match(injected.get('or') || '', /strength\.ilike/);
assert.match(injected.get('or') || '', /pharmaceutical_form\.ilike/);
assert.match(injected.get('or') || '', /registry_search_text\.ilike/);

for (const built of [
  searchPath('amoks', 40),
  productPath({ column:'id', value:READY_ROW.id }),
  regimenPath(READY_ROW.id),
  searchBindingPath([READY_ROW]),
]) {
  assert.doesNotThrow(() => assertEgressSafeRead(built, { method:'GET' }));
}
assert.ok(regimenPath(READY_ROW.id).includes('calculation_status=in.%28text_verified%2Ccalculable_verified%29'));
assert.ok(regimenPath(READY_ROW.id).includes('population=ilike.*pediatric*'));

// ----------------------------------------------------------- binding pure
const mapped = publicRegimen(REGIMEN_ROW);
assert.equal(mapped.sourceKey, 'card:42:pediatric');
assert.equal(mapped.regimenId, REGIMEN_ROW.id);

const readyVerdict = require(path.join(ROOT, 'lib/pediatric-readiness.js')).classify(READY_ROW);
const bound = calculationBinding(READY_ROW, readyVerdict, [mapped]);
assert.equal(bound.valid, true);
assert.equal(bound.autoSelected, true);
assert.equal(bound.selectionId, 'card:42:pediatric');
assert.equal(bound.regimenUuid, REGIMEN_ROW.id);
assert.equal(bound.indication, READY_ROW.pediatric_indication);

const orphan = calculationBinding(READY_ROW, readyVerdict, []);
assert.equal(orphan.valid, false);
assert.match(orphan.reason, /Regjimi primar/);

const noTypedIndication = calculationBinding(
  { ...READY_ROW, pediatric_indication:'' },
  { ...readyVerdict, requires:{ ...readyVerdict.requires, indication:true } },
  [mapped],
);
assert.equal(noTypedIndication.valid, false);

process.env.SESSION_SECRET = process.env.SESSION_SECRET
  || 'test-session-secret-qe-eshte-mjaftueshem-i-gjate-32';

async function main() {
  const auth = await import(pathToFileURL(path.join(ROOT, 'lib/auth.mjs')).href);
  const sessionCookie = auth.createSessionToken({ email:'diellzarabushaj@gmail.com', role:'editor' });
  assert.equal(auth.verifySessionToken(sessionCookie), true);

  // --------------------------------------------------------- search
  requestedPaths.length = 0;
  const search = await handler.searchDrugs('amoksicilinë', '10');
  assert.equal(search.results.length, 1);
  assert.equal(search.results[0].readiness, STATUS.CALCULATOR_READY);
  assert.equal(search.results[0].calculable, true);
  assert.equal(search.results[0].atcCode, 'J01CA04');
  assert.deepEqual(search.results[0].requires, { weight:true, height:false, age:true, indication:true });
  assert.deepEqual(search.facets, { all:1, ready:1, text:0, blocked:0 });
  assert.equal(rankSearchRow(READY_ROW, 'amoks'), 1);

  const byAtc = await handler.searchDrugs('J01CA04', '10');
  assert.equal(byAtc.results.length, 1);
  assert.equal(byAtc.results[0].drugId, READY_ROW.id);

  const multiToken = await handler.searchDrugs('amoksicilinë 250', '10');
  assert.equal(multiToken.results.length, 1);
  assert.equal(multiToken.results[0].drugId, READY_ROW.id);

  const bySubstance = await handler.searchDrugs('amoxicillinum', '10');
  assert.equal(bySubstance.results.length, 2);
  assert.deepEqual(searchFacets(bySubstance.results), { all:2, ready:1, text:1, blocked:0 });

  regimenRows = [];
  const unboundSearch = await handler.searchDrugs('amoksicilinë', '10');
  assert.equal(unboundSearch.results.length, 1);
  assert.equal(unboundSearch.results[0].readiness, STATUS.CALCULATOR_READY);
  assert.equal(unboundSearch.results[0].calculable, false);
  assert.equal(unboundSearch.results[0].bindingState, 'missing');
  assert.deepEqual(unboundSearch.facets, { all:1, ready:0, text:0, blocked:1 });
  regimenRows = [REGIMEN_ROW];

  assert.equal((await handler.searchDrugs('a')).results.length, 0);

  // --------------------------------------------------------- product binding
  drugRows = [READY_ROW];
  regimenRows = [REGIMEN_ROW, SECONDARY_REGIMEN_ROW];
  requestedPaths.length = 0;
  const { product } = await handler.loadProduct('42');
  assert.equal(product.readiness, STATUS.CALCULATOR_READY);
  assert.equal(product.calculable, true);
  assert.equal(product.regimen.primaryRegimenId, 'card:42:pediatric');
  assert.equal(product.calculationRegimen.valid, true);
  assert.equal(product.calculationRegimen.selectionId, 'card:42:pediatric');
  assert.equal(product.calculationRegimen.regimenUuid, REGIMEN_ROW.id);
  assert.equal(product.calculationRegimen.indication, READY_ROW.pediatric_indication);
  assert.equal(product.textRegimens.length, 2);
  assert.equal(product.textRegimens[1].sourceKey, SECONDARY_REGIMEN_ROW.source_key);
  assert.equal(requestedPaths.length, 2);

  const noConcentration = typedRegimen(
    { ...READY_ROW, pediatric_concentration_per_value:null },
    { caps:{}, volume:{ canConvertToVolume:false } },
  );
  assert.equal(noConcentration.concentration, null);

  // Në këtë fazë, dështimi i regjimeve është fail-closed për formulë me indikacion.
  regimenShouldFail = true;
  const unavailableBinding = await handler.loadProduct('42');
  assert.equal(unavailableBinding.product.readiness, STATUS.CALCULATOR_READY);
  assert.equal(unavailableBinding.product.calculable, false);
  assert.equal(unavailableBinding.product.calculationRegimen.valid, false);
  assert.ok(unavailableBinding.product.reasons.some(reason => /Regjimi primar/.test(reason)));
  regimenShouldFail = false;

  // Një source_key orphan nuk kalkulohet.
  regimenRows = [];
  const orphanProduct = await handler.loadProduct('42');
  assert.equal(orphanProduct.product.calculable, false);
  const orphanCalculation = await handler.calculateDose({ drugId:READY_ROW.id, weightKg:18, age:{ value:5, unit:'vjet' } });
  assert.equal(orphanCalculation.calculation.outcome, 'NOT_CALCULABLE');
  assert.equal(orphanCalculation.calculation.perDose, undefined,
    'Formula nuk guxon të ekzekutohet kur binding-u mungon.');

  // --------------------------------------------------------- calculation
  regimenRows = [REGIMEN_ROW, SECONDARY_REGIMEN_ROW];
  const calculated = await handler.calculateDose({
    drugId:READY_ROW.id,
    weightKg:18,
    age:{ value:5, unit:'vjet' },
  });
  assert.equal(calculated.calculation.outcome, 'CALCULATED');
  assert.equal(calculated.calculation.daily.min, 450);
  assert.equal(calculated.calculation.daily.max, 900);
  assert.equal(calculated.calculation.perDose.min, 150);
  assert.equal(calculated.calculation.regimenId, 'card:42:pediatric',
    'Kur ka një formulë typed, regjimi primar zgjidhet automatikisht.');
  assert.equal(calculated.calculation.regimenUuid, REGIMEN_ROW.id);
  assert.equal(calculated.calculation.indication, READY_ROW.pediatric_indication);

  // Source key kanonik ose UUID i po atij regjimi pranohet.
  const bySourceKey = await handler.calculateDose({
    drugId:READY_ROW.id,
    regimenId:'card:42:pediatric',
    weightKg:18,
    age:{ value:5, unit:'vjet' },
  });
  assert.equal(bySourceKey.calculation.outcome, 'CALCULATED');
  const byUuid = await handler.calculateDose({
    drugId:READY_ROW.id,
    regimenId:REGIMEN_ROW.id,
    weightKg:18,
    age:{ value:5, unit:'vjet' },
  });
  assert.equal(byUuid.calculation.regimenId, 'card:42:pediatric');

  // Regjimi tjetër i të njëjtit bar NUK mund ta huazojë formulën typed.
  const secondary = await handler.calculateDose({
    drugId:READY_ROW.id,
    regimenId:SECONDARY_REGIMEN_ROW.source_key,
    weightKg:18,
    age:{ value:5, unit:'vjet' },
  });
  assert.equal(secondary.status, 400);
  assert.match(secondary.error, /nuk është regjimi primar/);

  const secondaryUuid = await handler.calculateDose({
    drugId:READY_ROW.id,
    regimenId:SECONDARY_REGIMEN_ROW.id,
    weightKg:18,
    age:{ value:5, unit:'vjet' },
  });
  assert.equal(secondaryUuid.status, 400);

  // Indikacioni nuk dërgohet nga shfletuesi si tekst ose ID.
  for (const forbidden of [
    { pediatric_dose_min:9999 },
    { doseMin:9999 },
    { concentration:'1000 mg/mL' },
    { maxSingle:99999 },
    { indication:'Otitis media' },
    { indicationId:'free-text-or-id' },
  ]) {
    const rejected = await handler.calculateDose({
      drugId:READY_ROW.id,
      weightKg:18,
      age:{ value:5, unit:'vjet' },
      ...forbidden,
    });
    assert.equal(rejected.status, 400, `Duhej refuzuar ${JSON.stringify(forbidden)}.`);
    assert.match(rejected.error, /vijnë nga baza/);
  }

  const needsData = await handler.calculateDose({ drugId:READY_ROW.id });
  assert.equal(needsData.calculation.outcome, 'NEEDS_PATIENT_DATA');
  assert.deepEqual(needsData.calculation.missing, ['weightKg', 'age']);

  // Bari i paverifikuar mbetet NOT_CALCULABLE edhe kur ka regjim tekstual.
  drugRows = [TEXT_ROW];
  regimenRows = [TEXT_REGIMEN_ROW];
  const textOnly = await handler.calculateDose({ drugId:TEXT_ROW.id, weightKg:18 });
  assert.equal(textOnly.calculation.outcome, 'NOT_CALCULABLE');
  assert.equal(textOnly.calculation.readiness, STATUS.TEXT_ONLY);
  drugRows = [READY_ROW];
  regimenRows = [REGIMEN_ROW];

  // --------------------------------------------------------- HTTP gate
  function fakeRes() {
    const res = { statusCode:0, headers:{}, body:null, ended:false };
    res.setHeader = (key, value) => { res.headers[key] = value; };
    res.status = code => { res.statusCode = code; return res; };
    res.json = body => { res.body = body; return res; };
    res.end = () => { res.ended = true; return res; };
    return res;
  }

  const rejectedMethod = fakeRes();
  await handler({ method:'POST', url:'/api/dosage?view=pediatric-search', headers:{} }, rejectedMethod);
  assert.equal(rejectedMethod.statusCode, 405);
  assert.equal(rejectedMethod.headers.Allow, 'GET, HEAD');

  const wrongMethod = fakeRes();
  await handler({ method:'GET', url:'/api/dosage?view=pediatric-calculate', headers:{} }, wrongMethod);
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(wrongMethod.headers.Allow, 'POST');

  const productResponse = fakeRes();
  await handler({
    method:'GET',
    url:'/api/dosage?view=pediatric-product&drugId=42',
    headers:{ cookie:`medindex_session=${sessionCookie}` },
  }, productResponse);
  assert.equal(productResponse.statusCode, 200);
  assert.ok(productResponse.body.product);
  assert.equal(productResponse.body.row, undefined);

  const oversized = fakeRes();
  await handler({
    method:'POST',
    url:'/api/dosage?view=pediatric-calculate',
    headers:{ cookie:`medindex_session=${sessionCookie}` },
    body:'x'.repeat(handler._test.MAX_BODY_BYTES + 1),
  }, oversized);
  assert.equal(oversized.statusCode, 400);

  const anonymous = fakeRes();
  await handler({ method:'GET', url:'/api/dosage?view=pediatric-search&q=amoks', headers:{} }, anonymous);
  assert.equal(anonymous.statusCode, 401);
  assert.equal(anonymous.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.equal(anonymous.headers.Vary, 'Cookie');
  assert.equal(anonymous.headers['X-MedIndex-Data-Source'], 'Supabase');
  assert.equal(anonymous.headers['X-MedIndex-Dosage-Policy'], 'fail-closed');
}

main().then(() => {
  const dosageSource = fs.readFileSync(path.join(ROOT, 'api/dosage.js'), 'utf8');
  assert.match(dosageSource, /require\('\.\.\/lib\/pediatric-dosage-handler\.js'\)/);
  assert.match(dosageSource, /function isPediatricRequest\(req\)/);
  assert.match(dosageSource, /if \(isPediatricRequest\(req\)\) return pediatricDosageHandler\(req, res\);/);

  const pediatricDispatch = dosageSource.indexOf('if (isPediatricRequest(req))');
  const calculatorDispatch = dosageSource.indexOf('if (isCalculatorRequest(req))');
  const defaultDispatch = dosageSource.indexOf('return dosageHandler(req, res);');
  assert.ok(calculatorDispatch < pediatricDispatch && pediatricDispatch < defaultDispatch);

  const vercel = require(path.join(ROOT, 'vercel.json'));
  const rewriteFor = source => vercel.rewrites.find(rule => rule.source === source);
  assert.equal(rewriteFor('/api/dosage/search')?.destination, '/api/dosage?view=pediatric-search');
  assert.equal(rewriteFor('/api/dosage/product/:drugId')?.destination,
    '/api/dosage?view=pediatric-product&drugId=:drugId');
  assert.equal(rewriteFor('/api/dosage/calculate')?.destination, '/api/dosage?view=pediatric-calculate');

  console.log(
    'Pediatric dosage API passed: formula typed lidhet vetëm me primary source_key; indikacioni '
    + 'zgjidhet automatikisht nga serveri; regjimet tjera dhe free-text indication refuzohen; '
    + 'binding-u i munguar është fail-closed para aritmetikës.',
  );
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
