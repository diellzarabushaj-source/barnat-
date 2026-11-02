'use strict';
const fs=require('node:fs');
function buildCalculatorReviewRows(data,choices,protocols,core){
 const all=core.withChoiceReferences(data.antibiotics,choices,data.conditions),names=new Map(data.conditions.map(c=>[c.id,c.name])),byId=new Map(all.map(a=>[a.id,a]));
 const rows=[['Calculator ID','Substance ID','Substanca','ATC','Condition ID','Indikacioni','Produkte Active','Mayo — referenca numerike','Mayo — të lidhura me produkt','SmPC — të lidhura me produkt','Politika e burimit','Statusi','Miratimi klinik','Kalkulatori','Çfarë kërkohet']];
 for(const r of protocols.coverage(all,core)){const a=byId.get(r.substanceId),hasSource=r.mayoIds.length||r.smpcIds.length;rows.push([r.id,a.id,a.name,a.atc,r.conditionId,names.get(r.conditionId),a.products.length,r.mayoReferenceIds.join(' | '),r.mayoIds.join(' | '),r.smpcIds.join(' | '),protocols.sourcePolicy,hasSource?'Referencë — kërkohet rishikim':'Mungon skemë numerike e lidhur me produkt','Mungon verifikimi','JO','Burimi/versioni, indikacioni, popullata, produkti, rruga, forma, përqendrimi, kufizimet dhe miratimi i klinicistit.']);}
 for(const a of all.filter(a=>!a.conditionIds.length))rows.push([a.id+'::NO-INDICATION',a.id,a.name,a.atc,'','Mungon indikacion specifik i përputhshëm',a.products.length,'','','',protocols.sourcePolicy,'Mungon indikacioni','Mungon verifikimi','JO','Duhet burim me indikacion specifik dhe formë/rrugë të përputhshme.']);
 return rows;
}
module.exports={buildCalculatorReviewRows};
if(require.main===module){const out=process.argv[2];if(!out)throw Error('Usage: node scripts/export-antibiotic-calculator-review.js <output.json>');require('../antibiotiket-catalog-data');require('../antibiotiket-choices-data');require('../antibiotiket-protocols');const rows=buildCalculatorReviewRows(globalThis.DRX_ANTIBIOTIC_CATALOG,globalThis.DRX_ANTIBIOTIC_CHOICES,globalThis.DRX_ANTIBIOTIC_PROTOCOLS,require('../antibiotiket-catalog-core'));fs.writeFileSync(out,JSON.stringify(rows));console.log(`Calculator review: ${rows.length-1} rows; no patient data; no clinical approval.`);}
