(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DRX_ANTIBIOTIC_DOSE_ENGINE=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
// The UI supplies only the reviewed, versioned release registry, never patient approval flags.
function createApprovedCalculator(reviewedRegistry){
 const registry=JSON.parse(JSON.stringify(reviewedRegistry||{}));
 const numeric=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
 const blocked=reasons=>({status:'blocked',result:null,reasons});
 function prepare(bindingId,patient){
  const b=registry[bindingId],a=b?.approval,m=b?.model,p=patient||{},reasons=[];
  if(!b||!a||a.status!=='approved'||!a.reviewer||!a.reviewedAt||!a.sourceVersion||!a.productVerified||!a.routeVerified||!a.formVerified||!a.concentrationVerified)return blocked(['Mungon miratimi i dokumentuar i skemës dhe produktit.']);
  if(['productId','conditionId','route','form','strength','sourceId','sourceVersion'].some(k=>typeof b[k]!=='string'||!b[k])||a.sourceVersion!==b.sourceVersion)return blocked(['Lidhja e produktit/burimit nuk është e plotë ose versioni ka ndryshuar.']);
  if(b.sourceConflict)return blocked(['Bllokuar — kërkohet rishikim klinik.']);
  if(!b.sourceId||!numeric(b.minAgeYears,0,120)||!numeric(b.maxAgeYears,b.minAgeYears,120)||!numeric(b.minWeightKg,0.1,350)||!numeric(b.maxWeightKg,b.minWeightKg,350))return blocked(['Profili nuk ka kufij të plotë të rishikuar.']);
  if(p.productId!==b.productId||p.conditionId!==b.conditionId||p.route!==b.route)return blocked(['Produkti, indikacioni ose rruga nuk përputhet me miratimin.']);
  if(!numeric(p.ageYears,0,120)||!numeric(p.weightKg,0.1,350))return blocked(['Mosha dhe pesha duhen dhënë si vlera të vlefshme.']);
  if(p.ageYears<b.minAgeYears||p.ageYears>b.maxAgeYears||p.weightKg<b.minWeightKg||p.weightKg>b.maxWeightKg)reasons.push('Mosha/pesha është jashtë profilit të miratuar.');
  if(b.requiresRenal&&(!numeric(b.minCrclExclusive,0,250)||!numeric(p.crclMlMin,0,250)||p.crclMlMin<=b.minCrclExclusive||p.dialysis!==false))reasons.push('Funksioni renal/dializa kërkon skemë tjetër të rishikuar.');
  if(!m||!['fixed','mg_per_kg_day','mg_per_kg_dose'].includes(m.kind)||!numeric(m.intervalHours,1,24)||24%m.intervalHours!==0)reasons.push('Modeli i skemës ose intervali nuk është i mbështetur.');
  if(m&&['maxDailyMg','maxDoseMg'].some(k=>m[k]!=null&&!numeric(m[k],0.001,1e6)))reasons.push('Maksimumi i skemës nuk është i vlefshëm.');
  if(reasons.length)return blocked(reasons);
  if(m.kind==='fixed'&&!numeric(m.doseMg,0.001,1e6))return blocked(['Doza fikse nuk është e vlefshme.']);
  if(m.kind!=='fixed'&&!numeric(m.coefficient,0.001,1e5))return blocked(['Koeficienti nuk është i vlefshëm.']);
  return {b,m,p,times:24/m.intervalHours};
 }
 function calculate(bindingId,patient){
  const prepared=prepare(bindingId,patient);if(prepared.result===null)return prepared;const {b,m,p,times}=prepared,a=b.approval;let perDose,daily;
  if(m.kind==='fixed'){if(!numeric(m.doseMg,0.001,1e6))return blocked(['Doza fikse nuk është e vlefshme.']);perDose=m.doseMg;daily=perDose*times;}
  else{if(!numeric(m.coefficient,0.001,1e5))return blocked(['Koeficienti i peshës nuk është i vlefshëm.']);daily=m.kind==='mg_per_kg_day'?m.coefficient*p.weightKg:m.coefficient*p.weightKg*times;if(m.maxDailyMg!=null){if(!numeric(m.maxDailyMg,0.001,1e6))return blocked(['Maksimumi ditor nuk është i vlefshëm.']);daily=Math.min(daily,m.maxDailyMg);}perDose=daily/times;}
  if(m.maxDoseMg!=null&&(!numeric(m.maxDoseMg,0.001,1e6)||perDose>m.maxDoseMg))return blocked(['Doza tejkalon maksimumin e miratuar për dozë.']);
  if(m.kind==='fixed'&&m.maxDailyMg!=null&&(!numeric(m.maxDailyMg,0.001,1e6)||daily>m.maxDailyMg))return blocked(['Doza fikse tejkalon maksimumin ditor të miratuar.']);
  // No volume, vial rounding, reconstitution, duration or renal adjustment is inferred.
  return {status:'calculated',result:{perDoseMg:perDose,dailyMg:daily,intervalHours:m.intervalHours,dosesPerDay:times},sourceId:b.sourceId,reviewer:a.reviewer};
 }
 calculate.assess=(bindingId,patient)=>{const x=prepare(bindingId,patient);return x.result===null?{enabled:false,reasons:x.reasons}:{enabled:true,reasons:[]};};
 return calculate;
}
return {createApprovedCalculator};
});
