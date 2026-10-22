'use strict';
// Public clinical overlays on synthetic source shells, without private book text.
const data=require('../../data/recetat-clinical-revisions-16-20.json');
module.exports=data.coverage.map(({id,key,disposition})=>{
 const [chapterNumber,orderInChapter]=key.split('.').map(Number),p=data.guides[id];
 return {_id:id,chapterNumber,orderInChapter,title:'QA '+key,reviewStatus:disposition==='pending-editorial'?'source-imported':'verified',logicBlocks:[{order:1,relation:'start',items:[{kind:'source-note',title:'Synthetic '+key,sig:'QA fixture only.'}]}],...(p?{clinicalPlan:{...p,version:data.version,checkedAt:data.checkedAt}}:{})};
});
