'use strict';
// Synthetic source shells exercise the public correction plans. Private DOCX
// source text is kept outside the repository and compared read-only locally.
const revisions=require('../../data/recetat-clinical-revisions-11-15.json');
module.exports=revisions.coverage.map(({id,key})=>{
 const [chapterNumber,orderInChapter]=key.split('.').map(Number);
 return {_id:id,chapterNumber,orderInChapter,title:'QA '+key,reviewStatus:'verified',
  logicBlocks:[{order:1,relation:'start',items:[{kind:'source-note',title:'Synthetic original '+key,sig:'QA source text; not clinical guidance.'}]}],
  clinicalPlan:{...revisions.guides[id],version:revisions.version,checkedAt:revisions.checkedAt}};
});
