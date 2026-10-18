'use strict';
// Synthetic content exercises the source workflow; it is not clinical guidance.
const guide = (chapterNumber,orderInChapter) => ({
  _id:`qa-rx-${chapterNumber}-${orderInChapter}`,title:`Skema QA ${chapterNumber}.${orderInChapter}`,
  chapterNumber,orderInChapter,reviewStatus:'verified',sourceDocument:'QA source',version:'test',
  logicBlocks:[
    {_key:'b1',order:1,relation:'start',selection:'choose-one',note:'Shënim grupi QA',items:[{_key:'i1',kind:'active-substance',title:'Inj. QA 40 mg / 60 mg / 80 mg',genericName:'QA',strength:'40 mg / 60 mg',dose:'doza QA',route:'PO',frequency:'shpeshtësia QA',duration:'kohëzgjatja QA',sig:'Udhëzimi QA',note:'Shënim elementi QA'}]},
    {_key:'b2',order:2,relation:'or',sourceConnectorLabel:'OSE',items:[{_key:'i2',kind:'active-substance',title:'Alternativa QA',sig:'Udhëzim alternativ QA'}]},
    {_key:'b3',order:3,relation:'conditional',sourceConnectorLabel:'NËSE',condition:'Kushti QA ≤10,000',items:[{_key:'i3',kind:'procedure',title:'Procedura QA'}]},
    {_key:'b4',order:4,relation:'conditional',sourceConnectorLabel:'NËSE',condition:'UDHËZIME TË TJERA TË RX',items:[{_key:'i4',kind:'source-note',title:'UDHËZIME TË TJERA TË RX',sig:'Shënim burimor QA'}]},
  ],
});
const guides = [guide(1,1),guide(3,1),guide(3,2),guide(5,1),guide(5,2)];
module.exports = function sourceFixture(url,customGuides) {
  const route = url.searchParams.get('_route');
  if (!['prescription-library','prescription-search'].includes(route)) return null;
  const items = customGuides || guides;
  const lastChapter = Math.max(5,...items.map(item=>Number(item.chapterNumber)||0));
  const chapters = Array.from({length:lastChapter},(_,index)=>({number:index+1,title:`Kapitulli QA ${index+1}`,reviewStatus:'verified',count:items.filter(g=>g.chapterNumber===index+1).length,totalCount:items.filter(g=>g.chapterNumber===index+1).length,pendingCount:0,sourceNote:index===1 || index===3 ? 'Ky kapitull nuk përmban receta në dokumentin burimor.' : ''}));
  if (route === 'prescription-search') {
    const {prescriptionSearchDocument,rankPrescriptionGuides} = require('../api/medical-hub.js')._test;
    return {ok:true,results:rankPrescriptionGuides(items.map(prescriptionSearchDocument),url.searchParams.get('q'),url.searchParams.get('limit'),{chapter:url.searchParams.get('chapter'),filter:url.searchParams.get('filter')})};
  }
  const chapter = Number(url.searchParams.get('chapter')||1);
  return {ok:true,chapters,chapter,items:items.filter(g=>g.chapterNumber===chapter)};
};
