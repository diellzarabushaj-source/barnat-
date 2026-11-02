'use strict';
const fs=require('node:fs');
function buildChoiceReviewRows(data,choices){
 const names=new Map(data.conditions.map(c=>[c.id,c.name])),drugs=new Map(data.antibiotics.map(a=>[a.id,a]));
 const rows=[['Profile ID','Indication ID','Indikacioni','Popullata','Konteksti','Rendi','Substance ID','Substanca','ATC','Rruga','Forma','Kushti i zgjedhjes','Shënimi i profilit','Sqarimi i zgjedhjes së dytë','Source ID','URL i burimit','Burimi lexuar më','Statusi i auditimit','Miratimi klinik lokal','Kalkulatori','Fusha']];
 const ranks={first:'Zgjedhja e parë',second:'Zgjedhja e dytë',alternative:'Alternativa'};
 for(const p of choices.profiles)for(const id of p.conditionIds){
  const rr=[...p.rows];if(!rr.some(r=>r.tier==='second'))rr.push({tier:'second',note:p.secondNote});
  for(const r of rr){const a=drugs.get(r.substanceId),s=choices.sources.find(s=>s.id===p.sourceId);
   rows.push([p.id,id,names.get(id),(p.populations||[p.population]).join(' | '),p.label,ranks[r.tier],r.substanceId||'',a?.name||r.sourceSubstance||'',a?.atc||'',r.route||p.route,r.form||'',r.note||'',p.note,p.secondNote||'',s.id,s.url,s.readDate,p.auditStatus,'Mungon verifikimi','JO','Vetëm renditja; dozat Mayo ruhen veçmas']);
  }
 }
 return rows;
}
module.exports={buildChoiceReviewRows};
if(require.main===module){
 const out=process.argv[2];if(!out)throw Error('Usage: node scripts/export-antibiotic-choice-review.js <output.json>');
 require('../antibiotiket-catalog-data');require('../antibiotiket-choices-data');
 const rows=buildChoiceReviewRows(globalThis.DRX_ANTIBIOTIC_CATALOG,globalThis.DRX_ANTIBIOTIC_CHOICES);
 fs.writeFileSync(out,JSON.stringify(rows));console.log(`Choice review: ${rows.length-1} rows, ${rows[0].length} columns; calculator JO only.`);
}
