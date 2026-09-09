'use strict';
// Produces an import file only. Never changes Sanity or replaces an existing lesson.
const {randomUUID} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const [bookId, chapterId] = process.argv.slice(2);
if (![bookId, chapterId].every(id => id && /^[a-zA-Z0-9_-]+$/.test(id))) {
  console.error('Usage: node scripts/prepare-medical-hub-drafts.js BOOK_ID CHAPTER_ID > chapter-drafts.ndjson');
  process.exit(1);
}
const draft = JSON.parse(fs.readFileSync(path.join(__dirname,'../content/medical-hub/chapter-01-draft.json'),'utf8'));
const reference = (id,type) => ({_type:'reference',_ref:id,_weak:true,_strengthenOnPublish:{type}});
for (const topic of draft.topics) {
  const slug=topic.title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  console.log(JSON.stringify({...topic,_id:`drafts.${randomUUID()}`,slug:{_type:'slug',current:slug},
    book:reference(bookId,'medicalBook'),chapter:reference(chapterId,'medicalChapter'),reviewStatus:'draft'}));
}
