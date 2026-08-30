'use strict';

const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {htmlToText,extractCompositionSection,extractClinicalSections}=require('../lib/smpc-parser.js');

const ROOT=path.resolve(__dirname,'..');
const MED_URL='https://www.ema.europa.eu/en/documents/report/medicines-output-medicines_json-report_en.json';
const DOC_URL='https://www.ema.europa.eu/en/documents/report/documents-output-epar_documents_json-report_en.json';
const OUT=path.join(ROOT,'data','drx-master-ema-enrichment-v1.json');
const UA='DRx-MedIndex/1.0 EMA-public-json-enrichment';

function sha256(v){return crypto.createHash('sha256').update(String(v||''),'utf8').digest('hex');}
function ascii(v){return String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'');}
function norm(v){return ascii(v).toLowerCase().replace(/[^a-z0-9]+/g,'');}
function words(v){return new Set(ascii(v).toLowerCase().replace(/\([^)]*\)/g,' ').split(/[^a-z0-9]+/).filter(x=>x.length>2));}
function firstAtc(v){const m=String(v||'').toUpperCase().match(/[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}/);return m?m[0]:'';}
function list(v){if(Array.isArray(v))return v;if(!v||typeof v!=='object')return[];for(const k of ['data','items','results','result','medicines','documents'])if(Array.isArray(v[k]))return v[k];return Object.values(v).find(Array.isArray)||[];}
function cleanUrl(v){return String(v||'').replace(/&amp;/g,'&').trim();}
function field(o,...ks){for(const k of ks)if(o&&o[k]!==undefined&&o[k]!==null&&String(o[k]).trim()!=='')return o[k];return'';}
function overlap(a,b){const A=words(a),B=words(b);if(!A.size||!B.size)return 0;let n=0;for(const x of A)if(B.has(x))n++;return n/Math.max(A.size,B.size);}
function substanceCount(v){return String(v||'').split(/\s*;\s*|\s*\+\s*/).filter(Boolean).length;}
function ingredientList(v){
  return String(v||'').split(/\s*;\s*|\s*\+\s*/).map(x=>norm(x)).filter(Boolean);
}
function ingredientCompatible(target,source){
  const a=ingredientList(target),b=ingredientList(source);
  if(!a.length||!b.length||a.length!==b.length)return false;
  const used=new Set();
  for(const x of a){
    let found=-1;
    for(let i=0;i<b.length;i++){
      if(used.has(i))continue;
      const y=b[i];
      const ok=x===y || (Math.min(x.length,y.length)>=6 && (x.includes(y)||y.includes(x)));
      if(ok){found=i;break;}
    }
    if(found<0)return false;
    used.add(found);
  }
  return true;
}
function sectionEvidenceSane(s2,s41,s42){
  return String(s2||'').trim().length>=80 &&
         String(s41||'').trim().length>=80 &&
         String(s42||'').trim().length>=200;
}
function scoreMedicine(t,m){
  const ta=String(t.canonicalSubstance||''), ma=String(field(m,'active_substance','international_non_proprietary_name_common_name')||'');
  const nt=norm(ta), nm=norm(ma); const tatc=firstAtc(t.atcCode), matc=firstAtc(field(m,'atc_code_human'));
  let score=0;
  const exactSub=Boolean(nt&&nm&&nt===nm);
  const containsSub=Boolean(nt&&nm&&(nt.includes(nm)||nm.includes(nt))&&Math.min(nt.length,nm.length)>=6);
  const ov=overlap(ta,ma);
  if(exactSub)score+=8; else if(containsSub)score+=5; else score+=Math.round(ov*4);
  if(tatc&&matc&&tatc===matc)score+=7;
  if(String(field(m,'category')).toLowerCase().includes('human'))score+=1;
  if(substanceCount(ta)===substanceCount(ma))score+=1;
  return {score,exactSub,containsSub,overlap:ov,targetAtc:tatc,emaAtc:matc,emaSubstance:ma,ingredientCompatible:ingredientCompatible(ta,ma)};
}
function formFamily(v){
  const s=ascii(v).toLowerCase(); const has=(...xs)=>xs.some(x=>s.includes(x));
  if(has('gastro-resistant','gastro resistant','enteric'))return'tablet_gastro';
  if(has('prolonged','modified release','extended release','sustained release','retard'))return has('caps')?'capsule_modified':'tablet_modified';
  if(has('effervescent'))return'tablet_effervescent'; if(has('orodispers','bucodispers'))return'tablet_orodispersible';
  if(has('film coated','film-coated'))return'tablet_film'; if(has('tablet'))return'tablet'; if(has('capsule'))return'capsule';
  if(has('suppository'))return'suppository'; if(has('eye drops','ophthalm'))return'eye_drops'; if(has('ear drops','otic'))return'ear_drops';
  if(has('nasal spray'))return'nasal_spray'; if(has('oromucosal spray','mouth spray'))return'oromucosal_spray';
  if(has('cream'))return'cream';if(has('ointment'))return'ointment';if(has('gel'))return'gel';
  if(has('oral solution'))return'oral_solution';if(has('oral suspension'))return'oral_suspension';if(has('oral drops'))return'oral_drops';
  if(has('solution for infusion'))return'infusion_solution';if(has('concentrate for solution for infusion'))return'infusion_concentrate';
  if(has('solution for injection'))return'injection_solution';if(has('powder for solution for injection'))return'injection_powder';
  if(has('inhal','nebul'))return'inhalation';if(has('patch'))return'patch';if(has('powder'))return'powder';if(has('granules'))return'granules';
  if(has('solution'))return'solution';if(has('suspension'))return'suspension';return norm(s);
}
function formEvidence(form,text){
  const f=formFamily(form),s=ascii(text).toLowerCase();
  const map={
    tablet:['tablet'],tablet_film:['film-coated tablet','film coated tablet'],tablet_gastro:['gastro-resistant tablet','gastro resistant tablet','enteric-coated tablet'],
    tablet_modified:['prolonged-release tablet','modified-release tablet','extended-release tablet'],tablet_effervescent:['effervescent tablet'],
    tablet_orodispersible:['orodispersible tablet'],capsule:['capsule'],capsule_modified:['modified-release capsule','prolonged-release capsule'],
    suppository:['suppository'],cream:['cream'],ointment:['ointment'],gel:['gel'],eye_drops:['eye drops'],ear_drops:['ear drops'],
    nasal_spray:['nasal spray'],oromucosal_spray:['oromucosal spray','mouth spray'],oral_solution:['oral solution'],oral_suspension:['oral suspension'],
    oral_drops:['oral drops'],infusion_solution:['solution for infusion'],infusion_concentrate:['concentrate for solution for infusion'],
    injection_solution:['solution for injection'],injection_powder:['powder for solution for injection'],inhalation:['inhalation','nebuliser','nebulizer'],
    patch:['patch'],powder:['powder'],granules:['granules'],solution:['solution'],suspension:['suspension']
  };
  return (map[f]||[ascii(form).toLowerCase()]).some(n=>s.includes(n));
}
function strengthAtoms(v){
 const s=ascii(v).toLowerCase().replace(/,/g,'.');const out=[];const re=/(\d+(?:\.\d+)?)\s*(microgram(?:s)?|mcg|ug|μg|µg|mg|g|ml|iu|%)/g;let m;
 while((m=re.exec(s))){let u=m[2].replace(/micrograms?|mcg|μg|µg/,'ug');out.push(String(Number(m[1]))+u);}return[...new Set(out)];
}
function clinicalStrength(v,form){
 let s=ascii(v).toLowerCase().trim().replace(/,/g,'.').replace(/\s+/g,'');if(/[+;]/.test(s))return null;
 const f=ascii(form).toLowerCase(),semi=/cream|gel|ointment|paste|cutaneous|dermal/.test(f),liquid=/solution|spray|drops|infusion|injection|syrup|suspension|emulsion|oral/.test(f);
 let m;const fmt=n=>Number(n.toFixed(8)).toString();
 if((m=s.match(/^(\d+(?:\.\d+)?)%$/))){const p=Number(m[1]);if(semi)return fmt(p*10)+'mg/g';if(liquid)return fmt(p*10)+'mg/ml';}
 if((m=s.match(/^(\d+(?:\.\d+)?)mg\/(\d+(?:\.\d+)?)ml$/)))return fmt(Number(m[1])/Number(m[2]))+'mg/ml';
 if((m=s.match(/^(\d+(?:\.\d+)?)mg\/ml$/)))return fmt(Number(m[1]))+'mg/ml';
 if((m=s.match(/^(\d+(?:\.\d+)?)mg\/(\d+(?:\.\d+)?)g$/)))return fmt(Number(m[1])/Number(m[2]))+'mg/g';
 if((m=s.match(/^(\d+(?:\.\d+)?)mg\/g$/)))return fmt(Number(m[1]))+'mg/g';
 if((m=s.match(/^(\d+(?:\.\d+)?)g\/l$/)))return fmt(Number(m[1]))+'mg/ml';
 return null;
}
function strengthEvidence(strength,form,text){
 const s=ascii(text).toLowerCase().replace(/,/g,'.');const compact=s.replace(/\s+/g,'');
 const raw=ascii(strength).toLowerCase().replace(/,/g,'.').replace(/\s+/g,'');
 if(raw&&compact.includes(raw))return true;
 const atoms=strengthAtoms(strength);if(atoms.length&&atoms.every(a=>compact.includes(a)))return true;
 const c=clinicalStrength(strength,form);if(c&&compact.includes(c))return true;
 const m=c&&c.match(/^(\d+(?:\.\d+)?)mg\/(g|ml)$/);if(m){const n=m[1],u=m[2];if(compact.includes(n+'mgper'+u)||compact.includes(n+'mg/1'+u)||compact.includes(n+'mg/'+u))return true;}
 return false;
}
async function fetchJson(url){const r=await fetch(url,{headers:{'User-Agent':UA,Accept:'application/json'}});if(!r.ok)throw new Error('HTTP '+r.status+' '+url);return await r.json();}
async function fetchBytes(url){const r=await fetch(url,{redirect:'follow',headers:{'User-Agent':UA}});if(!r.ok)throw new Error('HTTP '+r.status+' '+url);return {url:r.url||url,contentType:r.headers.get('content-type')||'',bytes:Buffer.from(await r.arrayBuffer())};}
function toText(doc){
 const ct=doc.contentType.toLowerCase(),url=doc.url.toLowerCase();
 if(ct.includes('pdf')||url.endsWith('.pdf')){
   const dir=fs.mkdtempSync(path.join(os.tmpdir(),'drx-ema-'));const pdf=path.join(dir,'x.pdf'),txt=path.join(dir,'x.txt');
   try{fs.writeFileSync(pdf,doc.bytes);execFileSync('pdftotext',['-layout','-enc','UTF-8',pdf,txt],{stdio:'ignore'});return fs.readFileSync(txt,'utf8');}
   finally{fs.rmSync(dir,{recursive:true,force:true});}
 }
 return htmlToText(doc.bytes.toString('utf8'));
}
function loadSeed(){const out=[];for(let i=1;i<=4;i++){const p=path.join(ROOT,'data',`drx-master-source-seed-chunk-${String(i).padStart(2,'0')}.json`);out.push(...JSON.parse(fs.readFileSync(p,'utf8')).rows);}return out;}
function productDocs(docs,med){
 const pn=String(field(med,'ema_product_number')||'').trim(),name=String(field(med,'name_of_medicine')||'').toLowerCase();
 return docs.filter(d=>{
   const dp=String(field(d,'ema_product_number')||'').trim(),mn=String(field(d,'medicine_name')||'').toLowerCase(),type=String(field(d,'type')||'').toLowerCase(),dn=String(field(d,'name')||'').toLowerCase();
   const same=(pn&&dp===pn)||(!pn&&name&&mn===name);const prod=type.includes('product information')||dn.includes('product information')||dn.includes('annex i');
   return same&&prod&&cleanUrl(field(d,'document_url'));
 }).sort((a,b)=>String(field(b,'last_updated_date')).localeCompare(String(field(a,'last_updated_date'))));
}
async function mapLimit(items,limit,fn){const out=new Array(items.length);let i=0;const ws=Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const n=i++;if(n>=items.length)return;out[n]=await fn(items[n],n);}});await Promise.all(ws);return out;}
async function main(){
 const [medPayload,docPayload]=await Promise.all([fetchJson(MED_URL),fetchJson(DOC_URL)]);
 const medicines=list(medPayload).filter(m=>String(field(m,'category')).toLowerCase().includes('human'));
 const docs=list(docPayload); const seed=loadSeed(); const targets=seed.filter(r=>r.reviewState!=='EXACT');
 console.log('EMA records',medicines.length,'docs',docs.length,'targets',targets.length);
 let done=0;
 const rows=await mapLimit(targets,4,async t=>{
   const ranked=medicines.map(m=>({m,meta:scoreMedicine(t,m)})).filter(x=>x.meta.score>=6).sort((a,b)=>b.meta.score-a.meta.score).slice(0,4);
   const attempts=[];let best=null;
   for(const c of ranked){
     const ds=productDocs(docs,c.m).slice(0,2);
     for(const d of ds){
       const url=cleanUrl(field(d,'document_url'));if(!url)continue;
       try{
         const raw=await fetchBytes(url);const text=toText(raw);const comp=extractCompositionSection(text);const clinical=extractClinicalSections(text);
         const s2=comp?.text||'',s41=clinical.sections?.['4.1']?.text||'',s42=clinical.sections?.['4.2']?.text||'';
         const strengthOk=strengthEvidence(t.strength,t.pharmaceuticalForm,[s2,text.slice(0,25000)].join('\n'));
         const formOk=formEvidence(t.pharmaceuticalForm,text.slice(0,25000));
         const activeOk=Boolean(c.meta.ingredientCompatible && (c.meta.exactSub||c.meta.containsSub||(c.meta.overlap>=0.6&&c.meta.targetAtc&&c.meta.targetAtc===c.meta.emaAtc)));
         const sectionSane=sectionEvidenceSane(s2,s41,s42);
         const exact=Boolean(activeOk&&strengthOk&&formOk&&sectionSane);
         const result={matchStatus:exact?'EXACT_EMA_PI':'EMA_PI_REVIEW',emaProductNumber:String(field(c.m,'ema_product_number')||''),medicineName:String(field(c.m,'name_of_medicine')||''),activeSubstance:String(field(c.m,'active_substance')||''),atcCode:String(field(c.m,'atc_code_human')||''),medicineUrl:String(field(c.m,'medicine_url')||''),documentUrl:raw.url,documentName:String(field(d,'name')||''),documentUpdated:String(field(d,'last_updated_date')||''),medicineScore:c.meta.score,activeEvidence:activeOk,ingredientEvidence:c.meta.ingredientCompatible,strengthEvidence:strengthOk,formEvidence:formOk,sectionEvidenceSane:sectionSane,section2Sha256:s2?sha256(s2):null,section41Sha256:s41?sha256(s41):null,section42Sha256:s42?sha256(s42):null,section2Characters:s2.length,section41Characters:s41.length,section42Characters:s42.length};
         attempts.push(result);if(!best||exact||result.medicineScore>best.medicineScore)best=result;if(exact)break;
       }catch(e){attempts.push({matchStatus:'EMA_FETCH_REVIEW',documentUrl:url,error:String(e?.message||e),medicineScore:c.meta.score});}
     }
     if(best?.matchStatus==='EXACT_EMA_PI')break;
   }
   done++;if(done%40===0||done===targets.length)console.log('EMA enrichment',done,'/',targets.length);
   return {variantGroupId:t.variantGroupId,sourceVariantId:t.sourceVariantId,sourceDedupeKey:t.sourceDedupeKey,canonicalSubstance:t.canonicalSubstance,atcCode:t.atcCode,strength:t.strength,pharmaceuticalForm:t.pharmaceuticalForm,priorReviewState:t.reviewState,bestSource:best,attempts,publicationAllowed:false};
 });
 const counts={};for(const r of rows){const k=r.bestSource?.matchStatus||'NO_EMA_MATCH';counts[k]=(counts[k]||0)+1;}
 const out={schemaVersion:'drx-master-ema-enrichment-v1',generatedAt:new Date().toISOString(),source:{medicinesJson:MED_URL,documentsJson:DOC_URL,authority:'EMA'},inputRows:seed.length,targetRows:targets.length,counts,policy:{publicationAllowed:false,requiresProductInformation:true,requiresSections:['2','4.1','4.2'],crossStrengthBinding:false,saltsAutoCollapsed:false},rows};
 fs.writeFileSync(OUT,JSON.stringify(out,null,2)+'\n');
 const size=300;for(let start=0;start<rows.length;start+=size){const idx=String(Math.floor(start/size)+1).padStart(2,'0');const compact=rows.slice(start,start+size).map(r=>({variantGroupId:r.variantGroupId,sourceVariantId:r.sourceVariantId,sourceDedupeKey:r.sourceDedupeKey,priorReviewState:r.priorReviewState,bestSource:r.bestSource,publicationAllowed:false}));fs.writeFileSync(path.join(ROOT,'data',`drx-master-ema-sheet-chunk-${idx}.json`),JSON.stringify({schemaVersion:'drx-master-ema-sheet-chunk-v1',generatedAt:out.generatedAt,startRow:start,rows:compact},null,2)+'\n');}
 console.log(JSON.stringify({ok:true,targetRows:targets.length,counts},null,2));
}
main().catch(e=>{console.error(e);process.exit(1);});
