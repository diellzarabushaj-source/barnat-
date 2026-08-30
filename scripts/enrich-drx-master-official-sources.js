'use strict';

const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const SmPC=require('../lib/smpc-parser.js');
const Archive=require('../lib/dose-source-archive.js');

const ROOT=path.resolve(__dirname,'..');
const OUTDIR=path.join(ROOT,'data','drx-master-official-enrichment');
const CIMA='https://cima.aemps.es/cima/rest';
const UA='DRx-MedIndex/1.0 official-source-enrichment';

function sha256(s){return crypto.createHash('sha256').update(String(s||''),'utf8').digest('hex');}
function strip(s){return String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'');}
function unitNorm(u){return strip(u).toLowerCase().replace(/microgram(?:os?)?|mcg|ug|μg|µg/g,'ug').replace(/miligramos?|milligrams?|mg/g,'mg').replace(/gramos?|grams?|\bg\b/g,'g').replace(/mililitros?|millilitres?|milliliters?|ml/g,'ml').replace(/\s+/g,'');}
function strengthSignature(s){
  const t=strip(s).toLowerCase().replace(/,/g,'.');
  const out=[]; const re=/(\d+(?:\.\d+)?)\s*(%|microgram(?:os?)?|mcg|ug|μg|µg|mg|g|ml)/g; let m;
  while((m=re.exec(t))) out.push(String(Number(m[1]))+unitNorm(m[2]));
  return out.join('|');
}
function formFamily(v){
  const s=strip(v).toLowerCase(); const has=(...x)=>x.some(y=>s.includes(y));
  if(has('gastro-resistant','gastro resistant','gastroresistant','enteric','gastrorresistente')) return 'tablet_gastro';
  if(has('prolonged','modified release','extended release','sustained release','liberacion prolongada','liberación prolongada','liberacion modificada','liberación modificada','retard')) return has('caps','capsul')?'capsule_modified':'tablet_modified';
  if(has('effervescent','efervescente')) return 'tablet_effervescent';
  if(has('orodispers','bucodispers')) return 'tablet_orodispersible';
  if(has('dispersible','dispersable')) return 'tablet_dispersible';
  if(has('chewable','masticable')) return 'tablet_chewable';
  if(has('film coated','film-coated','recubierto con pelicula','recubierto con película')) return 'tablet_film';
  if(has('tablet','comprimido')) return 'tablet';
  if(has('capsule','capsula','cápsula')) return 'capsule';
  if(has('suppository','supositorio')) return 'suppository';
  if(has('eye drops','colirio','oftalm')) return 'eye_drops';
  if(has('ear drops','otico','ótico')) return 'ear_drops';
  if(has('nasal spray','pulverizacion nasal','pulverización nasal')) return 'nasal_spray';
  if(has('oromucosal spray','buccal spray','spray bucal','pulverizacion bucal','pulverización bucal')) return 'oromucosal_spray';
  if(has('cream','crema')) return 'cream';
  if(has('ointment','pomada','unguento','ungüento')) return 'ointment';
  if(has('gel')) return 'gel';
  if(has('syrup','jarabe')) return 'syrup';
  if(has('oral drops','gotas orales')) return 'oral_drops';
  if(has('oral solution','solucion oral','solución oral')) return 'oral_solution';
  if(has('oral suspension','suspension oral','suspensión oral')) return 'oral_suspension';
  if(has('solution for infusion','solucion para perfusion','solución para perfusión')) return 'infusion_solution';
  if(has('solution for injection','solucion inyectable','solución inyectable')) return 'injection_solution';
  if(has('inhal','nebul')) return 'inhalation';
  if(has('patch','parche')) return 'patch';
  if(has('solution','solucion','solución')) return 'solution';
  if(has('suspension','suspensión')) return 'suspension';
  return strip(s).replace(/[^a-z0-9]+/g,'');
}
function loadInputs(){
  const rows=[];
  for(let i=1;i<=4;i++){
    const p=path.join(ROOT,'data',`drx-master-enrichment-input-${String(i).padStart(2,'0')}.json`);
    rows.push(...JSON.parse(fs.readFileSync(p,'utf8')).rows);
  }
  return rows;
}
function urlsFrom(s){return [...new Set((String(s||'').match(/https?:\/\/[^;\s|]+/g)||[]).map(u=>u.replace(/[),.]+$/,'')))];}
async function fetchJson(url){
  for(let a=1;a<=4;a++){
    const r=await fetch(url,{headers:{Accept:'application/json','User-Agent':UA},redirect:'follow'});
    if(r.ok) return r.json();
    if(r.status===429||r.status>=500){await new Promise(x=>setTimeout(x,400*a));continue;}
    throw new Error('HTTP '+r.status+' '+url);
  }
  throw new Error('retry_exhausted '+url);
}
function extractList(p){
  if(Array.isArray(p)) return p;
  for(const k of ['resultados','results','items','data']) if(Array.isArray(p?.[k])) return p[k];
  return [];
}
async function cimaSections(nregistro){
  const u=new URL(CIMA+'/docSegmentado/contenido/1'); u.searchParams.set('nregistro',nregistro);
  const p=await fetchJson(u); const list=extractList(p); const out={};
  for(const s of list){
    const code=String(s?.seccion||s?.codigo||'').trim();
    if(code) out[code]=SmPC.htmlToText(s?.contenido||'');
  }
  return out;
}
function evidenceMatch(row, text){
  const t=strip(text).toLowerCase();
  const targetSig=strengthSignature(row.strength);
  const evidenceSig=strengthSignature(t);
  const strengthOk=Boolean(targetSig && evidenceSig && evidenceSig.split('|').some(x=>targetSig.split('|').includes(x)));
  const targetForm=formFamily(row.pharmaceuticalForm);
  const formOk=targetForm && targetForm.length>2 && (
    formFamily(t)===targetForm ||
    t.includes(strip(row.pharmaceuticalForm).toLowerCase())
  );
  return {strengthOk,formOk,targetSig,evidenceSig,targetForm};
}
async function enrichCimaExact(row){
  if(row.reviewState!=='EXACT'||row.seedReady==='READY'||!row.cimaRegistro) return null;
  try{
    const s=await cimaSections(row.cimaRegistro);
    const s2=s['2']||'',s41=s['4.1']||'',s42=s['4.2']||'';
    return {
      dedupeKey:row.dedupeKey,mode:'CIMA_EXACT_TEXT',status:(s41&&s42)?'SOURCE_TEXT_READY':'SOURCE_TEXT_INCOMPLETE',
      sourceUrl:row.cimaSourceUrl||'',sourceTier:'AEMPS_CIMA',
      section2Text:s2,section41Text:s41,section42Text:s42,
      section2Hash:s2?sha256(s2):null,section41Hash:s41?sha256(s41):null,section42Hash:s42?sha256(s42):null,
      exactEligible:false,reason:'dose_text_requires_structured_normalization'
    };
  }catch(e){return {dedupeKey:row.dedupeKey,mode:'CIMA_EXACT_TEXT',status:'FETCH_ERROR',error:String(e.message||e)};}
}
async function enrichSeedFallback(row){
  if(row.seedReady!=='READY'||row.reviewState==='EXACT') return null;
  const urls=urlsFrom(row.sourceUrls);
  for(const url of urls){
    try{
      const snap=await Archive.fetchSourceSnapshot(url,{authoritativeOnly:false});
      const s2=String(snap.composition?.text||'');
      const s41=String(snap.parsed?.sections?.['4.1']?.text||'');
      const s42=String(snap.parsed?.sections?.['4.2']?.text||'');
      if(!s41||!s42) continue;
      const rawText=snap.raw?.toString('utf8')||'';
      const match=evidenceMatch(row,[snap.sourceDocument?.productName,s2,s41,s42,SmPC.htmlToText(rawText.slice(0,120000))].join('\n'));
      const sourceTier=snap.sourceTier||'';
      const autoTier=['EMA','EMC','AEMPS_CIMA','EU_NATIONAL','KOSOVO_AKPPM'].includes(sourceTier);
      const exact=Boolean(autoTier&&match.strengthOk&&match.formOk);
      return {
        dedupeKey:row.dedupeKey,mode:'SEED_OFFICIAL_FALLBACK',
        status:exact?'EXACT_OFFICIAL_SOURCE':'OFFICIAL_SOURCE_REVIEW',
        sourceUrl:snap.finalUrl,sourceTier,productName:snap.sourceDocument?.productName||'',
        documentDate:snap.sourceDocument?.documentDate||null,
        section2Text:s2,section41Text:s41,section42Text:s42,
        section2Hash:snap.sectionSha256?.['2']||null,section41Hash:snap.sectionSha256?.['4.1']||null,section42Hash:snap.sectionSha256?.['4.2']||null,
        match,exactEligible:exact,reason:exact?'authoritative_exact_strength_form_sections':'source_or_match_requires_review'
      };
    }catch(e){}
  }
  return {dedupeKey:row.dedupeKey,mode:'SEED_OFFICIAL_FALLBACK',status:'NO_VALIDATED_OFFICIAL_SOURCE',exactEligible:false};
}
async function mapLimit(items,limit,fn){
  const out=new Array(items.length); let cursor=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const i=cursor++;if(i>=items.length)return;out[i]=await fn(items[i],i);}}));
  return out;
}
async function main(){
  fs.mkdirSync(OUTDIR,{recursive:true});
  const input=loadInputs();
  const targets=input.filter(r=>(r.reviewState==='EXACT'&&r.seedReady!=='READY')||(r.seedReady==='READY'&&r.reviewState!=='EXACT'));
  let done=0;
  const results=await mapLimit(targets,6,async row=>{
    let x=null;
    if(row.reviewState==='EXACT'&&row.seedReady!=='READY') x=await enrichCimaExact(row);
    else x=await enrichSeedFallback(row);
    done++; if(done%50===0||done===targets.length) console.log('enriched',done,'/',targets.length);
    return x;
  });
  const clean=results.filter(Boolean);
  const counts={}; for(const r of clean) counts[r.status]=(counts[r.status]||0)+1;
  for(let start=0;start<clean.length;start+=75){
    const idx=String(Math.floor(start/75)+1).padStart(2,'0');
    fs.writeFileSync(path.join(OUTDIR,`chunk-${idx}.json`),JSON.stringify({
      schemaVersion:'drx-master-official-enrichment-v1',generatedAt:new Date().toISOString(),startRow:start,rows:clean.slice(start,start+75)
    },null,2)+'\n');
  }
  fs.writeFileSync(path.join(OUTDIR,'summary.json'),JSON.stringify({schemaVersion:'drx-master-official-enrichment-summary-v1',generatedAt:new Date().toISOString(),targets:targets.length,counts},null,2)+'\n');
  console.log(JSON.stringify({ok:true,targets:targets.length,counts},null,2));
}
main().catch(e=>{console.error(e);process.exit(1);});
