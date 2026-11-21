/* DRx Antibiotics — ranked, typo-tolerant lookup. UI-only; clinical filters remain in catalog core. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DRX_ANTIBIOTIC_SMART_SEARCH=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const fold=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const stop=new Set(['e','te','ne','per','me','dhe','the','for','of']);
const words=s=>{
 const parts=fold(s).split(' ').filter(Boolean);
 const meaningful=parts.filter(x=>!stop.has(x));
 return meaningful.length?meaningful:parts;
};
const aliases=Object.freeze({amoksicilin:'amoxicillin',amoksiciline:'amoxicillin',amoksicilina:'amoxicillin',amoksicilinae:'amoxicillin',klavulanat:'clavulanic',klavulanik:'clavulanic',ceftriakson:'ceftriaxone',ceftriaksoni:'ceftriaxone',azitromicin:'azithromycin',azitromicina:'azithromycin',ciprofloksacin:'ciprofloxacin',metronidazol:'metronidazole',klaritromicin:'clarithromycin',doksiciklin:'doxycycline',amoksiklav:'amoxicillin clavulanic',amoxiclav:'amoxicillin clavulanic',koamoksiklav:'amoxicillin clavulanic',ciprofloksacine:'ciprofloxacin',gentamicine:'gentamicin',cefaleksine:'cephalexin',cefuroksim:'cefuroxime'});
const expand=t=>aliases[t]||t;
const queryWords=s=>words(s).flatMap(x=>words(expand(x)));
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
  {value:item.name,weight:110,scope:'substance'},
  {value:item.atc,weight:115,scope:'substance'},
  {value:item.group,weight:22,scope:'meta'},
  {value:item.subgroup,weight:44,scope:'meta'},
  {value:item.generation,weight:12,scope:'meta'},
  ...products.flatMap(p=>[
   {value:p.brand,weight:90,scope:'product'},
   {value:p.activeIngredient,weight:68,scope:'substance'},
   {value:p.formLabel||p.form,weight:14,scope:'product'},
   {value:p.strength,weight:15,scope:'product'},
   {value:p.registration,weight:30,scope:'product'},
   {value:p.route,weight:9,scope:'product'}
  ]),
  ...(item.indications||[]).map(x=>({value:x,weight:50,scope:'indication'}))
 ].filter(x=>x.value).map(x=>({...x,text:fold(x.value),parts:words(x.value)}));
 return {item,fields};
}
const cache=new WeakMap();
function getRecord(item){let r=cache.get(item);if(!r){r=record(item);cache.set(item,r)}return r;}
function tokenScore(field,query){
 const t=query,v=field.text;
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
function score(item,search,scope='all'){
 const tokens=scope==='product'||scope==='indication'?words(search):queryWords(search);if(!tokens.length)return 0;
 const rec=getRecord(item);
 const eligible=scope==='all'?rec.fields:rec.fields.filter(f=>f.scope===scope);
 let total=0;
 for(const q of tokens){
  let highest=0;
  for(const field of eligible)highest=Math.max(highest,tokenScore(field,q));
  if(!highest)return -1; // AND across fields: no fabricated diagnosis/indication mapping.
  total+=highest;
 }
 if((scope==='all'||scope==='substance')&&fold(item.name)===fold(search))total+=500;
 else if((scope==='all'||scope==='substance')&&fold(item.name).startsWith(fold(search)))total+=140;
 return total;
}
function filterAntibiotics(all,filters={},selected=[],core){
 const base=core.filterAntibiotics(all,{...filters,search:''},selected);
 if(!queryWords(filters.search).length)return base;
 return base.map(item=>({item,rank:score(item,filters.search,filters.scope||'all')})).filter(x=>x.rank>0)
  .sort((a,b)=>b.rank-a.rank||a.item.name.localeCompare(b.item.name,'sq')).map(x=>x.item);
}
function suggestions(all,filters={},selected=[],core,limit=6){
 const scope=filters.scope||'all',terms=scope==='product'||scope==='indication'?words(filters.search):queryWords(filters.search);
 if(fold(filters.search).length<2||!terms.length)return [];
 const pool=core.filterAntibiotics(all,{...filters,search:''},selected);
 const seen=new Set(),candidates=[];
 function add(label,kind,weight){
  const clean=String(label||'').trim(),key=fold(clean);
  if(!key||seen.has(key))return;
  const field={text:key,parts:words(clean),weight};
  let total=0;
  for(const term of terms){
   const value=tokenScore(field,term);
   if(!value)return; // all words must match same displayed suggestion
   total+=value;
  }
  seen.add(key);candidates.push({value:clean,kind,score:total+(key===fold(filters.search)?150:0)});
 }
 for(const a of pool){
  if(scope==='all'||scope==='substance'){
   add(a.name,'Substancë',120);
   add(a.atc,'ATC',95);
  }
  if(scope==='all'||scope==='product')for(const p of (a.products||[]))add(p.brand,'Produkt',80);
  if(scope==='all'||scope==='indication')for(const condition of (a.indications||[]))add(condition,'Indikacion në burim',65);
 }
 return candidates.sort((a,b)=>b.score-a.score||a.value.localeCompare(b.value,'sq')).slice(0,limit);
}
function matchContext(item,search,scope='all'){
 if(!search||!String(search).trim())return null;
 const tokens=scope==='product'||scope==='indication'?words(search):queryWords(search);
 if(!tokens.length)return null;
 const fields=getRecord(item).fields.filter(f=>(
  (scope==='product'||scope==='all')&&f.scope==='product'||
  (scope==='indication'||scope==='all')&&f.scope==='indication'
 ));
 let best=null;
 for(const field of fields){
  let points=0,valid=true;
  for(const word of tokens){const rank=tokenScore(field,word);if(!rank){valid=false;break;}points+=rank;}
  if(valid&&(!best||points>best.rank)){
   best={scope:field.scope,value:field.value,rank:points};
  }
 }
 return best?{scope:best.scope,label:String(best.value)}:null;
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
return Object.freeze({fold,words,queryWords,score,filterAntibiotics,suggestions,optionCounts,matchContext});
});