'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../recetat-v2.js'),'utf8');
const start = source.lastIndexOf('(() => {',source.indexOf("const API = '/api/medical-hub?_route=prescription-library'"));
const end = source.indexOf('  if (document.readyState',start);
const nodes = new Map();
const node = id => { if (!nodes.has(id)) nodes.set(id,{innerHTML:'',textContent:'',hidden:false,setAttribute(){}}); return nodes.get(id); };
const context = {window:{},document:{querySelector:node},console,AbortController,setTimeout,clearTimeout};
vm.runInNewContext(source.slice(start,end)+'this.test={state,render,renderGuide,itemTitle,sourceDraftText,sourceClinicalIssues,beginGuide,runSmartSearch};})();',context);
const {state,render,renderGuide,itemTitle,sourceDraftText,sourceClinicalIssues,beginGuide,runSmartSearch} = context.test;

for (const title of ['Inj. Vancomycin 500 mg-1 g','Syp. Domperidone 1 mg/mL','Inj. Lidocaine 2%, 5-10 mL','Inj. Enoxaparin sodium 40 mg / 60 mg / 80 mg','Inj. Tocilizumab 200 mg/10 mL ose 400 mg/20 mL','Tab. Dihydroartemisinin 40 mg + Piperaquine 320 mg']) {
  assert.equal(itemTitle({kind:'active-substance',title,genericName:'parsed generic',strength:'incomplete'}),title);
}
assert.equal(itemTitle({kind:'active-substance',title:'Levofloxacin',genericName:'Levofloxacin',form:'Tab.',strength:'500 mg'}),'Tab. Levofloxacin 500 mg');
const guide = {_id:'qa',title:'Transfer QA',chapterNumber:1,reviewStatus:'verified',logicBlocks:[
  {_key:'one',order:1,relation:'start',selection:'choose-one',condition:'Kushti i parë',note:'Shënim grupi',items:[{title:'QA first',kind:'active-substance',dose:'dose QA',route:'PO',frequency:'frequency QA',duration:'duration QA',sig:'sig QA',note:'Shënim elementi'}]},
  {_key:'two',order:2,relation:'or',sourceConnectorLabel:'OSE',items:[{title:'QA alternative',sig:'alternative QA'}]},
  {_key:'three',order:3,relation:'conditional',sourceConnectorLabel:'NËSE',condition:'≤10,000',items:[{title:'QA conditional'}]},
  {_key:'four',order:4,relation:'conditional',sourceConnectorLabel:'NËSE',condition:'UDHËZIME TË TJERA TË RX',items:[{title:'UDHËZIME TË TJERA TË RX',kind:'source-note',sig:'Shënim burimi'}]},
]};
const draft = sourceDraftText(guide);
for (const value of ['Zgjidh vetëm një','Kushti i parë','Doza: dose QA','Rruga: PO','Shpeshtësia: frequency QA','Kohëzgjatja: duration QA','S. sig QA','Shënim: Shënim elementi','Shënim i grupit: Shënim grupi','OSE\n','NËSE\n≤10,000']) assert.ok(draft.includes(value),value);
assert.doesNotMatch(draft,/NËSE\nUDHËZIME/, 'Editorial headings are not clinical conditions');
assert.equal((draft.match(/UDHËZIME TË TJERA TË RX/g)||[]).length,1);
const html = renderGuide(guide);
for (const value of ['dose QA','Kushti i parë','Zgjidh vetëm një','Shënim grupi','is-source-note','Vendose si draft']) assert.ok(html.includes(value),value);
assert.ok(html.includes('&lt;') === false);
const hostile = renderGuide({...guide,title:'<script>alert(1)</script>'});
assert.ok(hostile.includes('&lt;script&gt;')); assert.doesNotMatch(hostile,/<script>/);
let bridgeCalls=0;context.window.MedIndexRecetaWorkspace={beginSourceGuideDraft(){bridgeCalls++;}};
for (const item of [{genericName:'Enoxaparin sodium',title:'Inj. Enoxaparin',sig:'100 IU/kg (1.5 mg/kg), SC, OD.'},{kind:'blood-product',title:'Plazmë e freskët e ngrirë (FFP)',sig:'Sipas burimit, një njësi rrit Hb me rreth 1.0 g/dL.'}]) {
  const conflict={...guide,chapterNumber:5,logicBlocks:[{items:[item]}]};
  assert.equal(sourceClinicalIssues(conflict).length,1);
  assert.equal(sourceDraftText(conflict),'');
  assert.equal(beginGuide(conflict),false);
  assert.match(renderGuide(conflict),/disabled aria-describedby="rxSourceClinicalIssue"/);
  assert.ok(renderGuide(conflict).includes(item.sig), 'Original source remains visible');
}
assert.equal(bridgeCalls,0,'Source conflicts cannot reach the prescription bridge');
const laterConflicts = [
  ['enoxaparin-unit-conflict',16,{title:'Enoxaparin',sig:'100 IU/kg (ose 1.5 mg/kg), SC, OD.'}],
  ['enoxaparin-im-route-conflict',17,{title:'VTE PROPHYLAXIS',sig:'Inj. Enoxaparin; rruga paraqitet si IM.'}],
  ['brinzolamide-strength-conflict',18,{title:'Pika okulare Brinzolamide 0.1%',sig:'Alternativë.'}],
  ['prednisolone-source-range-conflict',16,{title:'Tab. Prednisolone 5 mg',sig:'5 mg - 1 mg, PO, OD.'}],
  ['ketoconazole-hirsutism-review',16,{title:'Cap. Ketoconazole',sig:'400 mg OD.'},'', 'HIRSUTISM'],
  ['aminoglycoside-ear-perforation-review',19,{title:'Ear drops Tobramycin + Dexamethasone',sig:'BD.'},'', 'CSOM'],
  ['bppv-vestibular-suppressant-review',19,{title:'Tab. Diazepam',sig:'HS.'},'', 'BPPV'],
  ['diazepam-injection-dilution-conflict',20,{title:'Inj. Diazepam',sig:'Në 8 mL Sodium chloride 0.9%; 5-10 mg IV.'}],
  ['ketorolac-iv-dose-conflict',14,{title:'Inj. Ketorolac 30 mg/mL',sig:'30-60 mg IV, një herë.'}],
  ['colchicine-gout-interval-conflict',13,{title:'Tab. Colchicine 0.5 mg',sig:'0.5 mg çdo 2-3 orë.'}],
  ['infliximab-source-schedule-conflict',13,{title:'Inj. Infliximab',sig:'Përsëritet pas 2, 6, 10 dhe 14 javësh.'}],
  ['aducanumab-product-status-review',14,{title:'Inf. Aducanumab 100 mg/mL',sig:'IV çdo 4 javë.'}],
  ['diazepam-injection-dilution-conflict',15,{title:'Inj. Diazepam 10 mg/2 mL',sig:'Të hollohet në 8 mL 0.9% NaCl; 4-10 mg IV.'}],
  ['lamotrigine-mania-source-conflict',15,{title:'Shënim i burimit',sig:'Ndrysho Lithium në Lamotrigine.'},'', 'MANI E RËNDË'],
  ['doxycycline-cap-dose-conflict',6,{title:'Cap. Doxycycline 200 mg',sig:'Të merret 2 herë në ditë (BD).'},'', 'CAP / PNEUMONI'],
  ['vancomycin-concentration-unit-conflict',6,{title:'Inj. Vancomycin',sig:'Target trough 15-20 mg/mL.'}],
  ['enoxaparin-prophylaxis-treatment-conflict',6,{title:'Inj. Enoxaparin',sig:'1.5 mg/kg, SC, OD.'},'TROMBOPROFILAKSI'],
  ['fondaparinux-prophylaxis-treatment-conflict',6,{title:'Inj. Fondaparinux 5-10 mg',sig:'SC, OD.'},'TROMBOPROFILAKSI'],
  ['tirofiban-bolus-unit-conflict',7,{title:'Inj. Tirofiban',sig:'0.25 mcg/kg brenda 5 minutave.'}],
  ['ivabradine-frequency-conflict',7,{title:'Tab. Ivabradine 5 mg',sig:'5 mg, OD; titro 7.5 mg, OD.'}],
  ['obeticholic-regulatory-conflict',9,{title:'Tab. Obeticholic acid',sig:'5 mg, OD.'}],
  ['insulin-frequency-source-conflict',10,{title:'Inj. Insulin regular',sig:'BD; para mëngjesit, para drekës dhe para darkës.'}],
  ['insulin-dose-unit-conflict',10,{title:'Inj. Insulin regular',sig:'0.1 mg/kg/orë IV.'}],
  ['hav-immunoglobulin-dose-conflict',9,{title:'Profilaksi HAV',sig:'Imunoglobulinë 0.01 mL/kg.'}],
  ['hcv-combination-source-conflict',9,{title:'Cap. Glecaprevir 100 mg + Pibrentasvir 40 mg',sig:'0-0-1 (OD).'}],
  ['hyperglycemic-crisis-potassium-review',10,{title:'Kalium',sig:'K⁺ <3.3 mEq/L.'},'','DIABETIC KETOACIDOSIS (DKA)'],
  ['endocarditis-prophylaxis-review',7,{title:'ALTERNATIVA',sig:'Clindamycin.'},'PROFILAKSIA E ENDOKARDITIT'],
];
for (const [code,chapterNumber,item,condition='',title='Source QA'] of laterConflicts) {
  const conflict={...guide,title,chapterNumber,logicBlocks:[{relation:'start',condition,items:[item]}]};
  assert.ok(sourceClinicalIssues(conflict).some(issue=>issue.code===code),code);
  assert.equal(sourceDraftText(conflict),'',code+' blocks source-to-draft transfer');
  assert.equal(beginGuide(conflict),false,code+' blocks the bridge');
  const rendered=renderGuide(conflict);
  assert.match(rendered,/Drafti kërkon rishikim/);
  assert.ok(rendered.includes(item.sig.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')),'Original source remains visible for '+code);
}
assert.equal(bridgeCalls,0);
const unapproved={...guide,chapterNumber:16,reviewStatus:'source-imported'};
assert.equal(sourceDraftText(unapproved),'');
assert.equal(beginGuide(unapproved),false);
assert.ok(sourceClinicalIssues(unapproved).some(i=>i.code==='source-awaiting-clinical-review'));
assert.match(renderGuide(unapproved),/Drafti kërkon rishikim/);
for (const [chapterNumber,item] of [
  [17,{title:'Enoxaparin',sig:'SC sipas produktit.'}],
  [18,{title:'Brinzolamide 1%',sig:'Sipas SmPC.'}],
  [16,{title:'Prednisolone',sig:'0.5 mg - 1 mg/kg/ditë.'}],
  [14,{title:'Inj. Ketorolac',sig:'60 mg IM, një herë.'}],
  [14,{title:'Inj. Ketorolac',sig:'30 mg IV, një herë.'}],
  [13,{title:'Tab. Colchicine',sig:'500 microgram çdo 8 orë; sipas produktit.'}],
  [13,{title:'Inj. Infliximab',sig:'Javët 0, 2, 6, pastaj çdo 8 javë.'}],
  [15,{title:'Inj. Diazepam',sig:'Injeksion pa hollim sipas SmPC.'}],
  [6,{title:'Cap. Doxycycline 100 mg',sig:'BD.'}],
  [6,{title:'Inj. Vancomycin',sig:'Target trough 15-20 mg/L.'}],
  [7,{title:'Inj. Tirofiban',sig:'25 mcg/kg.'}],
  [7,{title:'Tab. Ivabradine',sig:'5 mg, BD.'}],
  [9,{title:'HAV',sig:'Imunoglobulinë 0.1 mL/kg.'}],
  [9,{title:'Glecaprevir 100 mg + Pibrentasvir 40 mg',sig:'3 tableta OD.'}],
  [10,{title:'Insulin regular',sig:'Para mëngjesit, drekës dhe darkës.'}],
]) assert.equal(sourceClinicalIssues({...guide,chapterNumber,logicBlocks:[{items:[item]}]}).length,0,'Updated source must not retain an obsolete warning');
assert.equal(sourceClinicalIssues({...guide,chapterNumber:15,title:'Depresion bipolar',logicBlocks:[{items:[{title:'Lamotrigine',sig:'Titrim sipas SmPC.'}]}]}).length,0,'A mania warning must not block the distinct depression indication');
const orProphylaxis={...guide,chapterNumber:6,logicBlocks:[{relation:'conditional',condition:'TROMBOPROFILAKSI',items:[]},{relation:'or',items:[{title:'Fondaparinux 5-10 mg',sig:'OD.'}]}]};
assert.ok(sourceClinicalIssues(orProphylaxis).some(issue=>issue.code==='fondaparinux-prophylaxis-treatment-conflict'),'Alternatives inherit their group indication');
assert.equal(sourceClinicalIssues({...guide,logicBlocks:[{items:[{genericName:'Enoxaparin',sig:'100 IU/kg (1 mg/kg), SC.'}]}]}).length,0);
assert.equal(sourceClinicalIssues({...guide,logicBlocks:[{items:[{title:'Plazmë e freskët e ngrirë (FFP)',sig:'FFP nuk rrit Hb.'}]}]}).length,0,'A corrected negation must not trigger the old source conflict');
state.loading=false;state.chapter=2;state.chapters=[{number:2,sourceNote:'Pa Rx në dokumentin burimor.'}];
render();assert.match(node('#rxSourceGuideList').innerHTML,/Pa Rx në dokumentin burimor/);
(async()=>{
  let searchOptions;
  state.query='test';context.fetch=async(url,options)=>{searchOptions=options;throw new Error('network');};
  await runSmartSearch('test');assert.equal(state.searchError,true);
  assert.equal(searchOptions.headers['Cache-Control'],'no-cache','Search revalidates published source content');
  assert.match(node('#rxSourceGuideList').innerHTML,/Kërkimi nuk u krye/);
  assert.doesNotMatch(node('#rxSourceGuideList').innerHTML,/Nuk u gjet/);
  assert.equal(node('#rxSourceRetry').hidden,false);
  context.fetch=async()=>({ok:true,json:async()=>({ok:true,results:[]})});
  await runSmartSearch('test');assert.equal(state.searchError,false);
  assert.equal(node('#rxSourceRetry').hidden,true);
  console.log('Prescription source transfer: complete titles, fields, notes, alternatives, conditions, escaping, empty chapters and search retry passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
