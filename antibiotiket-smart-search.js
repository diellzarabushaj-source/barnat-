/* DRx Antibiotics — ranked, typo-tolerant lookup. UI-only; clinical filters remain in catalog core. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DRX_ANTIBIOTIC_SMART_SEARCH=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const fold=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const words=s=>fold(s).split(' ').filter(Boolean);
const aliases=Object.freeze({amoksicilin:'amoxicillin',amoksiciline:'amoxicillin',amoksicilina:'amoxicillin',amoksicilinae:'amoxicillin',klavulanat:'clavulanic',klavulanik:'clavulanic',ceftriakson:'ceftriaxone',ceftriaksoni:'ceftriaxone',azitromicin:'azithromycin',azitromicina:'azithromycin',ciprofloksacin:'ciprofloxacin',metronidazol:'metronidazole',klaritromicin:'clarithromycin',doksiciklin:'doxycycline'});
const expand=t=>aliases[t]||t;
function boundedDistance(a,b,limit){
 if(Math.abs(a.length-b.length)>limit)return limit+1;
 let prev=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  const row=[i];let min=i;
  for(let j=1;j<=b.length;j++){const cost=a[i-1]===b[j-1]?0:1;
   row[j]=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+cost);
   min=Math.min(min,row[j]);
  }
  if(min>limit)return limit+1;
  prev=row;
 }
 return prev[b.length];
}
function record(item){
 const products=item.products||[];
 const fields=[
  {value:item.name,weight:110},{value:item.atc,weight:115},{value:item.group,weight:22},
  {value:item.subgroup,weight:44},{value:item.generation,weight:12},
  ...products.flatMap(p=>[{value:p.brand,weight:90},{value:p.activeIngredient,weight:68},{value:p.formLabel||p.form,weight:14},{value:p.strength,weight:15},{value:p.registration,weight:30},{value:p.route,weight:9}]),
  ...(item.indications||[]).map(x=>({value:x,weight:50}))
 ].filter(x=>x.value).map(x=>({...x,text:fold(x.value),parts:words(x.value)}));
 return {item,fields};
}
const cache=new WeakMap();
function getRecord(item){let r=cache.get(item);if(!r){r=record(item);cache.set(item,r)}return r;}
function tokenScore(field,query){
 const t=expand(query),v=field.text;
 if(!t||!v)return 0;
 if(v===t)return field.weight+70;
 if(v.startsWith(t))return field.weight+42;
 if(field.parts.some(w=>w===t))return field.weight+31;
 if(field.parts.some(w=>w.startsWith(t)))return field.weight+18;
 if(v.includes(t))return field.weight+10;
 if(t.length<5||t.length>32)return 0;
 const limit=t.length>=9?2:1;
 for(const w of field.parts){
  if(w.length<4||Math.abs(w.length-t.length)>limit)continue;
  const distance=boundedDistance(w,t,limit);
  if(distance<=limit)return Math.max(2,field.weight-25*distance);
 }
 return 0;
}
function score(item,search){
 const tokens=words(search);if(!tokens.length)return 0;
 const rec=getRecord(item);
 let total=0;
 for(const q of tokens){
  let highest=0;
  for(const field of rec.fields)highest=Math.max(highest,tokenScore(field,q));
  if(!highest)return -1; // AND across fields: no fabricated diagnosis/indication mapping.
  total+=highest;
 }
 if(fold(item.name)===fold(search))total+=500;
 else if(fold(item.name).startsWith(fold(search)))total+=140;
 return total;
}
function filterAntibiotics(all,filters={},selected=[],core){
 const base=core.filterAntibiotics(all,{...filters,search:''},selected);
 if(!words(filters.search).length)return base;
 return base.map(item=>({item,rank:score(item,filters.search)})).filter(x=>x.rank>0)
  .sort((a,b)=>b.rank-a.rank||a.item.name.localeCompare(b.item.name,'sq')).map(x=>x.item);
}
function suggestions(all,filters={},selected=[],core,limit=6){
 const term=fold(filters.search);
 if(term.length<2)return [];
 const pool=core.filterAntibiotics(all,{...filters,search:''},selected);
 const seen=new Set(),candidates=[];
 function add(label,kind,weight){
  const clean=String(label||'').trim(),key=fold(clean);
  if(!key||seen.has(key))return;seen.add(key);
  const matched=tokenScore({text:key,parts:words(clean),weight},term);
  if(matched)candidates.push({value:clean,kind,score:matched});
 }
 for(const a of pool){
  add(a.name,'Substancë',120);
  add(a.atc,'ATC',95);
  for(const p of (a.products||[]))add(p.brand,'Produkt',80);
  for(const condition of (a.indications||[]))add(condition,'Indikacion në burim',65);
 }
 return candidates.sort((a,b)=>b.score-a.score||a.value.localeCompare(b.value,'sq')).slice(0,limit);
}
function optionCounts(all,filters={},selected=[],core,field,values){
 const alt={...filters,[field]:''};
 if(field==='group')alt.subgroup='';
 const pool=filterAntibiotics(all,alt,selected,core);
 return values.map(value=>{
  const f={...alt,[field]:value};
  return {value,count:core.filterAntibiotics(pool,{...f,search:''},selected).length};
 });
}
return Object.freeze({fold,words,score,filterAntibiotics,suggestions,optionCounts});
});