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
assert.equal(sourceClinicalIssues({...guide,logicBlocks:[{items:[{genericName:'Enoxaparin',sig:'100 IU/kg (1 mg/kg), SC.'}]}]}).length,0);
assert.equal(sourceClinicalIssues({...guide,logicBlocks:[{items:[{title:'Plazmë e freskët e ngrirë (FFP)',sig:'FFP nuk rrit Hb.'}]}]}).length,0,'A corrected negation must not trigger the old source conflict');
state.loading=false;state.chapter=2;state.chapters=[{number:2,sourceNote:'Pa Rx në dokumentin burimor.'}];
render();assert.match(node('#rxSourceGuideList').innerHTML,/Pa Rx në dokumentin burimor/);
(async()=>{
  state.query='test';context.fetch=async()=>{throw new Error('network');};
  await runSmartSearch('test');assert.equal(state.searchError,true);
  assert.match(node('#rxSourceGuideList').innerHTML,/Kërkimi nuk u krye/);
  assert.doesNotMatch(node('#rxSourceGuideList').innerHTML,/Nuk u gjet/);
  assert.equal(node('#rxSourceRetry').hidden,false);
  context.fetch=async()=>({ok:true,json:async()=>({ok:true,results:[]})});
  await runSmartSearch('test');assert.equal(state.searchError,false);
  assert.equal(node('#rxSourceRetry').hidden,true);
  console.log('Prescription source transfer: complete titles, fields, notes, alternatives, conditions, escaping, empty chapters and search retry passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
