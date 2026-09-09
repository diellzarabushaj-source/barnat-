'use strict';
// Opt-in local fixture only. Draft content is never made public by the API.
const draft = require('../content/medical-hub/chapter-01-draft.json');
const book = {title:'Doctor on Duty',language:'sq',reviewStatus:'draft'};
const items = draft.topics.map((topic,index) => ({...topic,_id:`composable-${index+1}`,contentKind:'lesson',chapterNumber:1,lessonNumber:index+1,book,chapter:{title:draft.chapterTitle,number:1}}));
module.exports = function(url) {
  const id = url.searchParams.get('id');
  if(id) {
    const item=items.find(item=>item._id===id);
    return {status:item?200:404,payload:{ok:!!item,item}};
  }
  const q=(url.searchParams.get('q')||'').toLocaleLowerCase('sq');
  const selected = q ? items.filter(item=>JSON.stringify(item).toLocaleLowerCase('sq').includes(q)) : items;
  return {status:200,payload:{ok:true,items:selected.map(({sections,...item})=>item),count:selected.length}};
};
