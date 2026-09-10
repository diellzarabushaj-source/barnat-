'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const api=require('../api/medical-hub.js')._test;
const chapters=api.prescriptionChapters([{chapterNumber:1,title:'Kapitulli',reviewStatus:'source-imported',count:0,totalCount:4,hasPrescriptions:true}]);
assert.equal(chapters.length,1);assert.equal(chapters[0].pendingCount,4);assert.equal(chapters[0].count,0);
const backend=read('api/medical-hub.js');
for(const name of ['PRESCRIPTION_GUIDE_QUERY','PRESCRIPTION_SEARCH_INDEX_QUERY']){
 const query=backend.match(new RegExp('const '+name+' = `([\\s\\S]*?)`;'))[1];
 assert.match(query,/reviewStatus == "verified"/);
 assert.match(query,/prescriptionChapter" && reviewStatus == "verified"/);
 assert.doesNotMatch(query,/source-imported/);
}
const source=read('recetat-v2.js');
const start=source.lastIndexOf('(() => {',source.indexOf("const API = '/api/medical-hub?_route=prescription-library'"));
const end=source.indexOf("  if (document.readyState",start);
const nodes=new Map();
const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',hidden:false,setAttribute(){}});return nodes.get(id);};
const context={window:{},document:{querySelector:node},console,AbortController,setTimeout,clearTimeout};
vm.runInNewContext(source.slice(start,end)+'this.test={state,render,syncChapterPicker,syncLessonPicker,load};})();',context);
const {state,render,syncChapterPicker,syncLessonPicker,load}=context.test;
state.loading=false;state.chapters=chapters;state.chapter=1;
syncChapterPicker();syncLessonPicker();render();
assert.equal(node('#rxSourceTotal').textContent,'4');
assert.match(node('#rxSourceGuideList').innerHTML,/presin verifikimin klinik/);
assert.doesNotMatch(node('#rxSourceGuideList').innerHTML,/data-rx-source-use/);
assert.match(node('#rxSourceChapterSelect').innerHTML,/4 në verifikim/);
state.error=true;render();assert.equal(node('#rxSourceRetry').hidden,false);
assert.match(node('#rxSourceGuideList').innerHTML,/nuk u ngarkuan/);
(async()=>{
 context.fetch=async()=>({ok:true,status:200,json:async()=>({ok:true,chapters,chapter:1,items:[]})});
 await load();assert.equal(state.error,false);assert.equal(state.loading,false);assert.equal(node('#rxSourceRetry').hidden,true);
 context.fetch=async()=>({ok:false,status:401,json:async()=>({})});
 await load();assert.equal(state.error,true);assert.equal(state.loading,false);
 console.log('Recetat source availability: pending metadata, verified-only treatments, error and retry states passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
