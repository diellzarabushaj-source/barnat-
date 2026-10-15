'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../api/medical-hub.js')._test;
const item = (id,chapter,blocks) => ({_id:id,title:'Filter QA',chapterNumber:chapter,orderInChapter:1,logicBlocks:blocks});
const guides = [
  item('plain',1,[{relation:'start',items:[{kind:'procedure',title:'QA'}]}]),
  item('drug',1,[{relation:'start',items:[{kind:'active-substance',title:'QA'}]}]),
  item('choice',3,[{relation:'start',selection:'choose-one',items:[{kind:'active-substance',title:'QA'}]}]),
  item('condition',3,[{relation:'conditional',condition:'QA condition',items:[{kind:'procedure',title:'QA'}]}]),
  item('annotation',3,[{relation:'conditional',condition:'UDHËZIME TË TJERA TË RX',items:[{kind:'source-note',title:'UDHËZIME TË TJERA TË RX'}]}]),
];
const docs = guides.map(api.prescriptionSearchDocument);
const ids = results => Array.from(results,entry=>entry._id);
assert.deepEqual(ids(api.rankPrescriptionGuides(docs,'QA',1,{filter:'alternatives'})),['choice'],'Facet is applied before limit, including choose-one groups');
assert.deepEqual(ids(api.rankPrescriptionGuides(docs,'QA',60,{filter:'medication',chapter:1})),['drug']);
assert.deepEqual(ids(api.rankPrescriptionGuides(docs,'QA',60,{filter:'conditional'})),['condition'],'Editorial annotations are not clinical conditions');
assert.equal(api.rankPrescriptionGuides(docs,'QA',60,{chapter:2}).length,0);
assert.equal(api.rankPrescriptionGuides(docs,'Q',60).length,0);
assert.equal(api.rankPrescriptionGuides(docs,'QA',60,{filter:'unknown'}).length,5);

const source = fs.readFileSync(require('node:path').join(__dirname,'../recetat-v2.js'),'utf8');
const start = source.lastIndexOf('(() => {',source.indexOf("const API = '/api/medical-hub?_route=prescription-library'"));
const end = source.indexOf('  if (document.readyState',start);
const nodes=new Map();
const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',hidden:false,setAttribute(){}});return nodes.get(id);};
const context={window:{},document:{querySelector:node},console,AbortController,setTimeout,clearTimeout};
vm.runInNewContext(source.slice(start,end)+'this.test={state,filteredItems,render,runSmartSearch};})();',context);
const {state,filteredItems,render,runSmartSearch}=context.test;
state.loading=false;state.items=guides;state.chapter=1;
for(const filter of ['all','medication','alternatives','conditional']) {
  state.filter=filter;
  assert.deepEqual(ids(filteredItems()).sort(),ids(api.rankPrescriptionGuides(docs,'QA',60,{filter})).sort(),filter+' agrees in browser and API');
}
state.activeGuideId='plain';state.filter='alternatives';render();
assert.equal(state.activeGuideId,'choice');
assert.match(node('#rxSourceActiveTitle').textContent,/Skema 1 nga 1/);
assert.equal(node('#rxSourceNext').disabled,true);
assert.doesNotMatch(node('#rxSourceLessonSelect').innerHTML,/value="plain"/);
state.filter='conditional';state.items=[guides[4]];render();
assert.match(node('#rxSourceGuideList').innerHTML,/Nuk ka skema me këta filtra/);

(async()=>{
  state.items=guides;state.query='QA';state.filter='medication';state.searchScope='chapter';state.chapter=1;
  let finish;
  let requestURL;
  context.fetch=(url,options)=>{requestURL=new URL(url,'https://qa.test');assert.equal(options.headers['Cache-Control'],'no-cache');return new Promise(resolve=>{finish=()=>resolve({ok:true,status:200,json:async()=>({ok:true,results:[{_id:'stale'}]})});});};
  const pending=runSmartSearch('QA');
  assert.equal(requestURL.searchParams.get('chapter'),'1');assert.equal(requestURL.searchParams.get('filter'),'medication');
  state.filter='alternatives';finish();await pending;
  assert.equal(state.searchResults.length,0,'An old response cannot replace a newer filter');
  console.log('Recetat filters: API limit ordering, scope, editorial exclusions, navigation, empty states and stale responses passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
