'use strict';
// Rebuild the public bundle from the verified, versioned snapshot of the native Sheet.
// Never infer an indication from a dose or copy an oral dose to an injectable product.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const core=require('../antibiotiket-catalog-core');
const root=path.resolve(__dirname,'..');
const snapshot=JSON.parse(fs.readFileSync(path.join(root,'data/antibiotics/sheet-snapshot-2026-11-02.json'),'utf8'));
const grid=name=>snapshot.sheets.find(s=>s.title===name).rows.slice(1);
const split=s=>String(s||'').split(' | ').filter(Boolean);
const uniq=a=>[...new Set(a)].sort((a,b)=>a.localeCompare(b,'sq'));
const n=v=>v===''||v==null?null:v;
function populations(raw){
 const t=String(raw).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),out=[];
 if(/nuk rekomandohet.*femij|jo per femij|kunderindiko.*femij/.test(t))return [];
 if(/rritur|adulte|te moshuar|≥18|>=18/.test(t))out.push('Të rritur');
 if(/pediatr|femij|adolesh|muaj|<18|nen 18/.test(t))out.push('Fëmijë / adoleshentë');
 if(/porsalind|neonat/.test(t))out.push('Të porsalindur');
 // Lower age limits are source restrictions, not proof of a local product approval.
 if(/≥[12]\s*vjec|mbi [268] vjec|≥14 vjec|nen (2|12|15) vjec/.test(t))out.push('Fëmijë / adoleshentë','Të rritur');
 return uniq(out);
}
const conditions=grid('Fjalori indikacioneve').map(r=>({id:r[0],name:r[1]}));
const conditionMap=new Map(conditions.map(c=>[c.id,c.name]));
const sources=grid('Burimet').map(r=>({id:r[0],type:r[1],url:r[2],scope:r[3],readDate:r[4],publicationDate:r[5],localApprovalDate:r[6],note:r[7],context:r[8]}));
const sourceMap=new Map(sources.map(s=>[s.id,s]));
const references=grid('Indikacionet').map(r=>({id:r[0],substanceId:r[1],originalText:r[4],route:r[5],form:r[6],population:r[7],populations:populations(r[7]),sourceId:r[8],url:r[9],readDate:r[10],origin:r[11],localStatus:r[12],legacyIds:split(r[13]),note:r[14],calculatorApproved:false,conditionIds:split(r[17]),filterEligible:r[19]==='PO'}));
const products=grid('Produktet').map(r=>({id:r[0],substanceId:r[1],brand:r[3],activeIngredient:r[4],strength:r[5],form:r[6],packaging:r[7],atc:r[8],legalStatus:r[9],applicationType:r[10],authorizationHolder:r[11],manufacturer:r[12],registration:r[13],status:r[14],withdrawalNote:r[15],authorizationType:r[16],route:r[17],routeVerification:r[18],clinicalStatus:r[23],calculatorApproved:false,stock:r[25],sourceId:r[26],sourceTab:r[27],sourceRow:r[28],importedAt:r[29],registryVerifiedAt:r[30],issues:r[31],recordId:r[32],formLabel:r[33]}));
function routeCodes(raw){if(raw.startsWith('PARENTERAL'))return ['Parenterale — për verifikim'];return String(raw||'').split(' / ').flatMap(x=>x.includes('IV (infuzion)')?['IV','Injeksion — për verifikim']:[x]);}
const allMayo=snapshot.legacyMayo.slice(1).map(r=>({id:r[0],name:r[1],route:r[2],formulation:r[3],originalIndication:r[4],population:r[5],populations:populations(r[5]),doseMin:n(r[6]),doseMax:n(r[7]),doseUnit:r[8],interval:r[9],daysMin:n(r[10]),daysMax:n(r[11]),note:r[12],maxDaily:n(r[13]),sourceType:r[14],mayoUrl:r[15],clinicalStatus:r[16],qaStatus:r[17],calculatorApproved:false,qaReason:r[19]}));
const antibiotics=grid('Antibiotiket').filter(r=>r[24]==='PO').map(r=>{
 const pp=products.filter(p=>p.substanceId===r[0]&&p.status==='Active');
 const refs=references.filter(i=>i.substanceId===r[0]);
 const displayRefs=refs.filter(i=>i.filterEligible&&pp.some(p=>core.referenceMatchesProduct(i,p)));
 const conditionIds=uniq(displayRefs.flatMap(i=>i.conditionIds));
 const legacyIds=new Set(refs.flatMap(i=>i.legacyIds));
 const regimens=allMayo.filter(m=>legacyIds.has(m.id)).map(m=>({...m,conditionIds:uniq(refs.filter(ref=>ref.legacyIds.includes(m.id)&&ref.filterEligible).flatMap(ref=>ref.conditionIds))}));
 const sourceIds=uniq(refs.map(i=>i.sourceId).filter(Boolean));
 return {id:r[0],name:r[1],atc:r[2],group:r[3],subgroup:r[4],generation:r[22],conditionIds,indications:conditionIds.map(id=>conditionMap.get(id)),routes:uniq(pp.flatMap(p=>routeCodes(p.route))),forms:uniq(pp.map(p=>p.formLabel)),populations:uniq([...displayRefs.flatMap(i=>i.populations),...regimens.filter(m=>m.conditionIds.length&&pp.some(p=>core.referenceMatchesProduct(m,p))).flatMap(m=>m.populations)]),products:pp,indicationReferences:displayRefs,regimens,sourceIds,clinicalStatus:r[15],calculatorApproved:false,issues:r[20]};
});
assert.equal(antibiotics.length,135);assert.equal(antibiotics.flatMap(a=>a.products).length,660);assert.equal(new Set(antibiotics.map(a=>a.id)).size,antibiotics.length);
for(const a of antibiotics){assert(a.products.every(p=>p.status==='Active'));assert(a.conditionIds.every(id=>conditionMap.has(id)));assert(a.indicationReferences.every(ref=>sourceMap.has(ref.sourceId)));assert(a.regimens.every(r=>r.calculatorApproved===false));}
const data={version:'2026-11-02.2',sourceSheet:`https://docs.google.com/spreadsheets/d/${snapshot.spreadsheetId}/edit`,akppmRegistry:'https://akppm.rks-gov.net/',importFile:snapshot.importFile,importSummary:{...snapshot.metrics,activeSubstances:135,activeProducts:660},clinicalApprovedCount:0,conditions,sources,antibiotics,audit:{unmatchedMayo:allMayo.filter(m=>!antibiotics.some(a=>a.regimens.some(r=>r.id===m.id))),historicalProducts:products.filter(p=>p.status!=='Active'),nonSpecificReferences:references.filter(r=>!r.filterEligible)}};
fs.writeFileSync(path.join(root,'antibiotiket-catalog-data.js'),`/* Generated by scripts/build-antibiotics-catalog.js. Clinical calculation is disabled. */\n(function(root){root.DRX_ANTIBIOTIC_CATALOG=${JSON.stringify(data)};})(typeof window==='object'?window:globalThis);\n`);
console.log(`Antibiotics bundle: ${antibiotics.length} active substance contexts, 660 products, ${conditions.length} controlled indication names. No calculators.`);
