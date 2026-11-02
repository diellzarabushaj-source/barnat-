(function(root){
 'use strict';
 const sources=[{id:'SMPC-CIMA-83901',type:'SmPC · AEMPS/CIMA',url:'https://cima.aemps.es/cima/dochtml/ft/83901/FT_83901.html',version:'2025-10',readDate:'2026-11-02',product:'Ceftazidima Qilu 1 g',scope:'Seksionet 4.1, 4.2; administrim intermitent IV; për rishikim lokal.'}];
 // A deliberately bounded source profile. It is not approval for CEFIN or for local use.
 const protocols=[{id:'SMPC-QILU-CUTI-ADULT-IV',substanceId:'ABX-7f2058bb1770',conditionIds:['COND-a0e2f0c60ab2'],productIds:['PRD-a6635e18e00533'],sourceId:'SMPC-CIMA-83901',sourceKind:'SmPC',sourceVersion:'2025-10',registration:'MA-0061/06/03/2023',atc:'J01DD02',population:'18–80 vjeç, ≥40 kg; funksion renal normal',route:'IV',form:'Powder for solution for injection or infusion',strength:'1 g',doseMin:1,doseMax:2,doseUnit:'g/dozë',interval:'çdo 8 ose 12 orë',daysMin:null,daysMax:null,maxDaily:null,requiresRenal:true,referenceOnly:true,clinicalApproved:false,localProductApproved:false,note:'Profil i kufizuar për rishikim: jo fëmijë, >80 vjeç, <40 kg, insuficiencë renale, dializë ose perfuzion i vazhdueshëm. Intervali/doza nuk zgjidhen automatikisht.',models:[{id:'QILU-CUTI-1G-Q8',kind:'fixed',doseMg:1000,intervalHours:8},{id:'QILU-CUTI-1G-Q12',kind:'fixed',doseMg:1000,intervalHours:12},{id:'QILU-CUTI-2G-Q8',kind:'fixed',doseMg:2000,intervalHours:8},{id:'QILU-CUTI-2G-Q12',kind:'fixed',doseMg:2000,intervalHours:12}]}];
 function candidates(item,conditionId,product,core){
  if(!conditionId||!product)return [];
  const mayo=item.regimens.filter(r=>r.conditionIds.includes(conditionId)&&core.referenceMatchesProduct(r,product)&&r.route===product.route&&Number.isFinite(r.doseMin)).map(r=>({...r,sourceKind:'Mayo',sourceUrl:r.mayoUrl,sourceLabel:r.sourceType,clinicalApproved:false,localProductApproved:false,requiresRenal:false}));
  const smpc=protocols.filter(r=>r.substanceId===item.id&&r.conditionIds.includes(conditionId)&&r.productIds.includes(product.id)&&product.status==='Active'&&product.registration===r.registration&&product.atc===r.atc&&core.normalize(product.strength).replace(/\s/g,'')===core.normalize(r.strength).replace(/\s/g,'')&&core.sourceFormMatches(r.form,product.form)&&core.routeMatches(product,r.route)).map(r=>({...r,sourceUrl:sources.find(s=>s.id===r.sourceId).url,sourceLabel:sources.find(s=>s.id===r.sourceId).type}));
  const variants=[];
  for(const source of [...smpc,...mayo])for(const [id,binding]of Object.entries(approvedBindings))if(binding.protocolId===source.id&&binding.productId===product.id&&binding.conditionId===conditionId&&source.sourceVersion&&binding.sourceVersion===source.sourceVersion&&binding.approval?.sourceVersion===binding.sourceVersion)variants.push({...source,id,modelBindingId:id,originalIndication:binding.label,clinicalApproved:true,localProductApproved:true,route:binding.route});
  return [...variants,...[...smpc,...mayo].filter(source=>!variants.some(v=>v.modelBindingId&&approvedBindings[v.modelBindingId].protocolId===source.id))];
 }
 function coverage(items,core=root.DRX_ANTIBIOTIC_CATALOG_CORE){return items.flatMap(item=>item.conditionIds.map(conditionId=>{const linked=core?item.products.flatMap(p=>candidates(item,conditionId,p,core)):[];return {id:item.id+'::'+conditionId,substanceId:item.id,conditionId,mayoReferenceIds:item.regimens.filter(r=>r.conditionIds.includes(conditionId)&&Number.isFinite(r.doseMin)).map(r=>r.id),mayoIds:[...new Set(linked.filter(r=>r.sourceKind==='Mayo').map(r=>r.id))],smpcIds:[...new Set(linked.filter(r=>r.sourceKind==='SmPC').map(r=>r.id))],clinicalApproved:false};}));}
 function workspaceState(item,draft,core){
  const product=item.products.find(p=>p.id===draft.productId),available=candidates(item,draft.conditionId,product,core),selected=available.find(r=>r.id===draft.regimenId)||(available.length===1?available[0]:null),reasons=[];
  if(!draft.conditionId)reasons.push('Zgjidh indikacionin konkret.');
  if(!product)reasons.push('Zgjidh produktin konkret.');
  if(product&&!available.length)reasons.push('Mungon skemë numerike Mayo/SmPC e lidhur me këtë produkt dhe indikacion.');
  if(available.length>1&&!selected)reasons.push('Zgjidh skemën për popullatën dhe kontekstin përkatës.');
  if(/^bllokuar/i.test(item.clinicalStatus)||/^bllokuar/i.test(product?.clinicalStatus||'')||/^bllokuar/i.test(selected?.qaStatus||''))reasons.push('Bllokuar — kërkohet rishikim klinik.');
  if(item.id==='ABX-7f2058bb1770'&&draft.crcl==='')reasons.push('Kërkohet vlerësimi i funksionit renal; nuk supozohet normal nga mosha/pesha.');
  if(draft.crcl!==''&&(!Number.isFinite(Number(draft.crcl))||Number(draft.crcl)<0||Number(draft.crcl)>250))reasons.push('Vlera CrCl nuk është e vlefshme.');
  if(selected?.requiresRenal&&draft.crcl!==''&&Number(draft.crcl)<=50)reasons.push('Ky profil nuk mbulon insuficiencën renale; kërkohet skemë tjetër e verifikuar.');
  if(!product?.registryVerifiedAt||!selected?.localProductApproved)reasons.push('Mungon verifikimi/miratimi lokal i produktit, rrugës, formës dhe përqendrimit.');
  reasons.push('Llogaritja nuk është miratuar klinikisht.');
  return {enabled:false,result:null,product,available,selected,reasons};
 }
 const approvedBindings=Object.freeze({});
 root.DRX_ANTIBIOTIC_PROTOCOLS={sources,protocols,candidates,coverage,workspaceState,sourcePolicy:'SmPC i produktit konkret + Mayo; pa transferim midis produkteve',approvedBindings};
})(typeof window==='object'?window:globalThis);
