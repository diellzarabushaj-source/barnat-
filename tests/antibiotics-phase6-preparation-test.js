'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const sandbox = { window:{ addEventListener(){} } };
const load = f => { new Function('window', read(f))(sandbox.window); }; // eslint-disable-line no-new-func
load('antibiotiket-data.js');
load('antibiotiket-hospital-data.js');
load('antibiotiket-parenteral-prep-data.js');

const fakeDocument = { querySelector(){return null;}, getElementById(){return null;}, querySelectorAll(){return [];}, createElement(){return {};} };
new Function('window','document', read('antibiotiket-parenteral-bridge.js'))(sandbox.window, fakeDocument); // eslint-disable-line no-new-func
new Function('window','document','MutationObserver', read('antibiotiket-parenteral-prep.js'))(sandbox.window, fakeDocument, function(){}); // eslint-disable-line no-new-func

const data = sandbox.window.DRX_ANTIBIOTIC_PARENTERAL_PREP;
const hospital = sandbox.window.DRX_ANTIBIOTIC_HOSPITAL;
const engine = sandbox.window.DRX_ANTIBIOTIC_PREP_ENGINE;
const prep = id => data.preparations.find(x=>x.id===id);
const regimen = id => hospital.regimens.find(x=>x.id===id);

for(const item of hospital.regimens){
  assert.equal(engine.doseForRegimen(item,20,item.drug,null),null,item.id+' requires confirmed age');
  assert.equal(engine.doseForRegimen(item,3.3,item.drug,0),null,item.id+' is not a neonatal schedule');
}
for(const [id,drug,mg20,mg80] of [
  ['H001','Ceftriaxone',1000,1000], ['H004','Ampicillin',1000,2000],
  ['H005','Ceftriaxone',1000,2000], ['H006','Ampicillin/sulbactam',1000,2000],
  ['H007','Ampicillin/sulbactam',1000,2000], ['H008','Ceftriaxone',1000,2000],
  ['H009','Ciprofloxacin',200,400], ['H010','Cefazolin',500,2000],
  ['H011','Clindamycin',200,600], ['H012','Clindamycin',200,600],
  ['H013','Ampicillin/sulbactam',1000,2000], ['H014','Ceftriaxone',1000,2000],
  ['H014','Clindamycin',200,600], ['H015','Ampicillin/sulbactam',1000,2000],
]){
  assert.equal(engine.doseForRegimen(regimen(id),20,drug,12).value,mg20,id+' at 20 kg');
  assert.equal(engine.doseForRegimen(regimen(id),80,drug,144).value,mg80,id+' at 80 kg');
}
assert.equal(engine.doseForRegimen(regimen('H002'),27,'Benzathine penicillin G',144),null);
assert.equal(engine.doseForRegimen(regimen('H003'),27,'Benzathine penicillin G',144).value,1200000);

assert.equal(data.preparations.length,20);
for(let i=1;i<=20;i+=1){
  const id=`IV${String(i).padStart(3,'0')}`;
  const p=prep(id);
  assert.ok(p,`${id} missing`);
  assert.ok(['IV','IM'].includes(p.route));
  assert.equal(p.exactProduct,true);
  assert.match(p.sourceUrl,/^https:\/\//);
}
assert.equal(prep('IV007').publishable,false);
assert.equal(prep('IV014').publishable,false);
assert.equal(prep('IV015').publishable,false);
assert.equal(prep('IV018').publishable,false);
assert.equal(prep('IV019').drug,'Benzathine penicillin G','Bridge must normalize master display-name ordering');

const ctxDose=engine.doseForRegimen(regimen('H005'),20,'Ceftriaxone',12);
assert.equal(ctxDose.value,1000);
let r=engine.calculatePreparation({prep:prep('IV001'),regimenRoute:'IV',dose:ctxDose,exactProductConfirmed:true});
assert.equal(r.gate,'ALLOW');
assert.equal(r.rawStockMl,10);
assert.equal(r.targetRequired,true);
r=engine.calculatePreparation({prep:prep('IV001'),regimenRoute:'IV',dose:ctxDose,exactProductConfirmed:true,targetConcentration:20});
assert.equal(r.rawFinalVolumeMl,50);
r=engine.calculatePreparation({prep:prep('IV002'),regimenRoute:'IV',dose:ctxDose,exactProductConfirmed:true,stockChoiceMgPerMl:250});
assert.equal(r.gate,'HARD_BLOCK_ROUTE');

const imDose=engine.doseForRegimen(regimen('H001'),20,'Ceftriaxone',12);
r=engine.calculatePreparation({prep:prep('IV002'),regimenRoute:'IM',dose:imDose,exactProductConfirmed:true});
assert.equal(r.gate,'SELECT_STOCK_PATH');
r=engine.calculatePreparation({prep:prep('IV002'),regimenRoute:'IM',dose:imDose,exactProductConfirmed:true,stockChoiceMgPerMl:250});
assert.equal(r.rawStockMl,4);

const penDose=engine.doseForRegimen(regimen('H002'),20,'Benzathine penicillin G',12);
r=engine.calculatePreparation({prep:prep('IV019'),regimenRoute:'IM',dose:penDose,exactProductConfirmed:true});
assert.equal(r.wholeSyringes,1);
assert.equal(r.doseUnits,600000);
assert.equal(r.rawVolumeMl,undefined,'Nominal Bicillin syringe size must not become a partial-volume withdrawal');
r=engine.calculatePreparation({prep:prep('IV019'),regimenRoute:'IV',dose:penDose,exactProductConfirmed:true});
assert.equal(r.gate,'HARD_BLOCK_ROUTE');

const ampDose=engine.doseForRegimen(regimen('H004'),20,'Ampicillin',12);
r=engine.calculatePreparation({prep:prep('IV003'),regimenRoute:'IV',dose:ampDose,exactProductConfirmed:true});
assert.equal(r.gate,'MANUAL_STOCK_VERIFY','Ampicillin must not invent a stock mL');

const ampsulDose=engine.doseForRegimen(regimen('H006'),20,'Ampicillin/sulbactam',12);
r=engine.calculatePreparation({prep:prep('IV005'),regimenRoute:'IV',dose:ampsulDose,exactProductConfirmed:true,targetConcentration:15});
assert.equal(ampsulDose.value,1000);
assert.equal(r.rawStockMl,4);
assert.equal(r.totalDrugMg,1500);
assert.equal(r.rawFinalVolumeMl,100);

const clindaDose=engine.doseForRegimen(regimen('H011'),20,'Clindamycin',12);
r=engine.calculatePreparation({prep:prep('IV011'),regimenRoute:'IV',dose:clindaDose,exactProductConfirmed:true});
assert.ok(Math.abs(r.rawStockMl-(200/150))<1e-12);
assert.ok(Math.abs(r.rawMinimumFinalVolumeMl-(200/18))<1e-12);
assert.ok(Math.abs(r.rawMinimumInfusionMinutes-(200/30))<1e-12);

const ciproDose=engine.doseForRegimen(regimen('H009'),20,'Ciprofloxacin',12);
r=engine.calculatePreparation({prep:prep('IV013'),regimenRoute:'IV',dose:ciproDose,exactProductConfirmed:true});
assert.equal(r.rawStockMl,100);

r=engine.calculatePreparation({prep:prep('IV014'),regimenRoute:'IV',dose:{kind:'mg',value:500},exactProductConfirmed:true});
assert.equal(r.gate,'HARD_BLOCK_PREP');
assert.equal(regimen('H016').autoVisible,false);

const runtime=read('antibiotiket-parenteral-prep.js');
assert.match(runtime,/Si përgatitet/);
assert.match(runtime,/produkti\/presentation dhe route përputhen saktë/);
assert.match(runtime,/pa rounding klinik/);
const shell=read('antibiotiket-shell.js');
assert.doesNotMatch(shell,/antibiotiket-parenteral-prep-data\.js|antibiotiket-parenteral-bridge\.js|antibiotiket-parenteral-prep\.js/,
  'The archived IV preparation tool must not load on the catalog-only page');

console.log('Antibiotics Phase 6 gate passed: 20/20 preparation records + route/product safeguards + bridge.');
