(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DRX_ANTIBIOTIC_CATALOG_CORE=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('sq').replace(/\s+/g,' ').trim();
 const sortText=(a,b)=>String(a).localeCompare(String(b),'sq');
 const routeMatches=(product,route)=>!route||(route==='Parenterale — për verifikim'?product.route.startsWith('PARENTERAL'):route==='Injeksion — për verifikim'?product.route.includes('injeksion'):product.route.split(' / ').some(x=>x===route||x.startsWith(route+' (')));
 function filterAntibiotics(antibiotics,filters={},selected=[]){
  const chosen=new Set(selected),term=normalize(filters.search);
  return (Array.isArray(antibiotics)?antibiotics:[]).filter(item=>{
   if(!item.products?.some(p=>p.status==='Active'))return false;
   if(filters.group&&item.group!==filters.group)return false;
   if(filters.subgroup&&item.subgroup!==filters.subgroup)return false;
   if(filters.generation&&item.generation!==filters.generation)return false;
   if(filters.indication&&!(item.conditionIds||[]).includes(filters.indication))return false;
   if(filters.population&&!(item.populations||[]).includes(filters.population))return false;
   // A route and form must match the same registered product, not two unrelated presentations.
   if((filters.route||filters.form)&&!item.products.some(p=>p.status==='Active'&&routeMatches(p,filters.route)&&(!filters.form||p.formLabel===filters.form)))return false;
   if((filters.indication||filters.population)&&item.indicationReferences?.length&&!item.indicationReferences.some(ref=>(!filters.indication||ref.conditionIds.includes(filters.indication))&&(!filters.population||ref.populations.includes(filters.population))&&item.products.some(p=>referenceMatchesProduct(ref,p)&&routeMatches(p,filters.route)&&(!filters.form||p.formLabel===filters.form))))return false;
   if(filters.selectedOnly&&!chosen.has(item.id))return false;
   if(!term)return true;
   return normalize([item.name,item.atc,item.group,item.subgroup,...item.indications,...item.products.flatMap(p=>[p.brand,p.activeIngredient,p.form,p.strength,p.registration])].join(' ')).includes(term);
  }).sort((a,b)=>sortText(a.name,b.name)||sortText(a.atc,b.atc));
 }
 function readSelected(raw,allowedIds){let parsed;try{parsed=JSON.parse(raw||'[]');}catch{return [];}const allowed=new Set(allowedIds);return Array.isArray(parsed)?[...new Set(parsed.filter(x=>typeof x==='string'&&allowed.has(x)))]:[];}
 // Phase 1 is reference-only. Neither favorites nor imported statuses can enable math.
 const isCalculatorApproved=()=>false;
 function sourceFormMatches(sourceForm,productForm){
  const source=normalize(sourceForm),product=normalize(productForm);if(!source)return true;
  const kinds=[/krem|cream/,/pomad|ointment/,/tablet/,/kapsul|capsul/,/suspens/,/ovul|pessary/,/pika|drops/,/xhel|gel/,/pulber|powder|pluhur/,/granul/];
  const ss=kinds.filter(r=>r.test(source)),pp=kinds.filter(r=>r.test(product));if(ss.length&&pp.length&&!ss.some(r=>pp.includes(r)))return false;
  const extended=/zgjatur|extended|modified|prolonged|sustained|retard|\bxr\b|\ber\b/;
  if(extended.test(source)!==extended.test(product))return false;
  return true;
 }
 function referenceMatchesProduct(ref,product){
  if(product.status!=='Active')return false;
  if(Array.isArray(ref.presentations)){
   const strength=normalize(product.strength).replace(/\s/g,'');
   if(!ref.presentations.some(p=>sourceFormMatches(p.form,product.form)&&(!p.strengthExact||strength===normalize(p.strengthExact).replace(/\s/g,''))&&(!p.strengthPrefix||strength===p.strengthPrefix||strength.startsWith(p.strengthPrefix+'('))))return false;
  }else if(!sourceFormMatches(ref.form||ref.formulation,product.form))return false;
  const s=ref.route||'',p=product.route||'';
  if(s==='PO')return p==='PO';
  if(/IV|IM|PARENTERAL/.test(s))return /IV|IM|PARENTERAL/.test(p);
  if(s.startsWith('TOP'))return p.startsWith('TOP');
  return ['OPH','OTIC','NASAL','VAG','INH','PR','OROMUC'].some(r=>s.includes(r)&&p.split(' / ').some(x=>x===r));
 }
 function matchingRegimens(item,filters={}){return (item.regimens||[]).filter(r=>r.conditionIds.length&&item.products.some(p=>referenceMatchesProduct(r,p)&&(!filters.form||p.formLabel===filters.form))&&(!filters.indication||r.conditionIds.includes(filters.indication))&&(!filters.population||r.populations.includes(filters.population))&&(!filters.route||r.route.split(' / ').includes(filters.route)));}
 function withChoiceReferences(items,choiceData,conditions){
  const names=new Map(conditions.map(c=>[c.id,c.name])),sources=new Map((choiceData.sources||[]).map(s=>[s.id,s]));
  return items.map(item=>{
   const extra=[];
   for(const p of choiceData.profiles||[])for(const [index,row]of p.rows.entries()){
    const s=sources.get(p.sourceId);if(row.substanceId!==item.id||!s||!item.products.some(product=>referenceMatchesProduct(row,product)))continue;
    extra.push({id:p.id+'-'+index,sourceId:s.id,url:s.url,readDate:s.readDate,conditionIds:p.conditionIds.filter(id=>names.has(id)),route:row.route,form:row.form,presentations:row.presentations,population:p.label,populations:p.populations||[p.population],originalText:p.label+' · '+row.note,note:p.note,calculatorApproved:false,origin:'Renditja e udhëzimit; pa dozë'});
   }
   const refs=[...item.indicationReferences,...extra],ids=[...new Set(refs.flatMap(r=>r.conditionIds))];
   return {...item,indicationReferences:refs,conditionIds:ids,indications:ids.map(id=>names.get(id)),populations:[...new Set([...item.populations,...extra.flatMap(r=>r.populations)])]};
  });
 }
 const choiceProfiles=(choices,conditionId,population='')=>(choices.profiles||[]).filter(p=>p.conditionIds.includes(conditionId)&&(!population||(p.populations||[p.population]).includes(population)));
 function calculatorState(item,{conditionId='',productId='',regimenId=''}={}){
  const product=item.products.find(p=>p.id===productId),regimen=item.regimens.find(r=>r.id===regimenId),reasons=[];
  if(!conditionId)reasons.push('Zgjidh indikacionin konkret.');
  if(!product)reasons.push('Zgjidh produktin dhe fortësinë konkrete.');
  if(!regimen)reasons.push('Mungon skema Mayo e përzgjedhur për këtë indikacion dhe produkt.');
  if(/^bllokuar/i.test(item.clinicalStatus)||/^bllokuar/i.test(product?.clinicalStatus||'')||/^bllokuar/i.test(regimen?.qaStatus||''))reasons.push('Bllokuar — kërkohet rishikim klinik.');
  if(regimen&&(!regimen.conditionIds.includes(conditionId)||!product||regimen.route!==product.route||!referenceMatchesProduct(regimen,product)))reasons.push('Skema nuk përputhet saktësisht me indikacionin, rrugën dhe formën e produktit.');
  if(product&&!product.registryVerifiedAt)reasons.push('Mungon verifikimi lokal i produktit dhe përqendrimit.');
  if(!isCalculatorApproved(regimen))reasons.push('Llogaritja nuk është miratuar klinikisht.');
  return {enabled:false,result:null,reasons,product,regimen};
 }
 return Object.freeze({filterAntibiotics,readSelected,isCalculatorApproved,normalize,routeMatches,matchingRegimens,sourceFormMatches,referenceMatchesProduct,withChoiceReferences,choiceProfiles,calculatorState});
});
