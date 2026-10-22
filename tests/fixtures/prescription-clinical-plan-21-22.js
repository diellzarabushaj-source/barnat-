'use strict';
// Clinical overlays on synthetic source shells; no private source paragraphs.
const data=require('../../data/recetat-clinical-revisions-21-22.json');
module.exports=data.coverage.map(({id,key})=>{
 const [chapterNumber,orderInChapter]=key.split('.').map(Number),p=data.guides[id];
 return {_id:id,chapterNumber,orderInChapter,title:'QA '+key,reviewStatus:'verified',logicBlocks:[{order:1,relation:'start',items:[{kind:'source-note',title:'Synthetic '+key,sig:'QA fixture only.'}]}],clinicalPlan:{...p,version:data.version,checkedAt:data.checkedAt}};
});
