'use strict';

const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {htmlToText,extractCompositionSection,extractClinicalSections}=require('../lib/smpc-parser.js');

const ROOT=path.resolve(__dirname,'..');
const OUT=path.join(ROOT,'data','drx-master-secondary-source-enrichment-v1.json');
const UA='DRx-MedIndex/1.0 official-source-enrichment';

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function mapLimit(items,limit,worker){
  const out=new Array(items.length); let cursor=0;
  const workers=Array.from({length:Math.min(limit,items.length)},async()=>{
    while(true){const i=cursor++;if(i>=items.length)return;out[i]=await worker(items[i],i);}
  });
  await Promise.all(workers); return out;
}
function sha256(s){return crypto.createHash('sha256').update(String(s||''),'utf8').digest('hex');}
function ascii(s){return String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'');}
function squash(s){return ascii(s).toLowerCase().replace(/[^a-z0-9%+/.]+/g,'');}
function hostname(url){const m=String(url||'').match(/^https?:\/\/([^/]+)/i);return m?m[1].toLowerCase():'';}
function sourceTier(url){
  const d=hostname(url);
  if(d==='cima.aemps.es') return 100;
  if(d==='www.medicines.org.uk'||d==='medicines.org.uk') return -1000;
  if(d.endsWith('ema.europa.eu')) return 90;
  if(d==='dailymed.nlm.nih.gov') return 70;
  if(d==='lekovi.zdravstvo.gov.mk') return 65;
  if(d.includes('patienteninfo-service.de')) return 60;
  return 40;
}
function exactEligible(url){
  const d=hostname(url);
  return d==='cima.aemps.es';
}
function isHtmlContentType(v){return /text\/html|application\/xhtml/i.test(String(v||''));}
function titleFromHtml(html){const m=String(html||'').match(/<title[^>]*>([\s\S]*?)<\/title>/i);return m?htmlToText(m[1]).trim():'';}
function formFamily(v){
  const s=ascii(v).toLowerCase();
  const has=(...xs)=>xs.some(x=>s.includes(x));
  if(has('gastro-resistant','gastro resistant','gastroresistant','enteric'))return 'tablet_gastro';
  if(has('prolonged','modified release','extended release','sustained release','retard'))return has('caps')?'capsule_modified':'tablet_modified';
  if(has('effervescent'))return 'tablet_effervescent';
  if(has('orodispers','bucodispers'))return 'tablet_orodispersible';
  if(has('film coated','film-coated'))return 'tablet_film';
  if(has('tablet'))return 'tablet';
  if(has('capsule'))return 'capsule';
  if(has('suppository'))return 'suppository';
  if(has('eye drops','ophthalm'))return 'eye_drops';
  if(has('ear drops','otic'))return 'ear_drops';
  if(has('nasal spray'))return 'nasal_spray';
  if(has('oromucosal spray','mouth spray'))return 'oromucosal_spray';
  if(has('cream'))return 'cream';
  if(has('ointment'))return 'ointment';
  if(has('gel'))return 'gel';
  if(has('syrup'))return 'syrup';
  if(has('oral drops'))return 'oral_drops';
  if(has('oral solution'))return 'oral_solution';
  if(has('oral suspension'))return 'oral_suspension';
  if(has('solution for infusion'))return 'infusion_solution';
  if(has('concentrate for solution for infusion'))return 'infusion_concentrate';
  if(has('solution for injection'))return 'injection_solution';
  if(has('powder for solution for injection'))return 'injection_powder';
  if(has('inhal','nebul'))return 'inhalation';
  if(has('patch'))return 'patch';
  if(has('powder'))return 'powder';
  if(has('granules'))return 'granules';
  if(has('solution'))return 'solution';
  if(has('suspension'))return 'suspension';
  return squash(s);
}
function formEvidence(target,text){
  const f=formFamily(target),s=ascii(text).toLowerCase();
  const map={
    tablet:['tablet','tablets'],tablet_film:['film-coated tablet','film coated tablet','tablet'],
    tablet_gastro:['gastro-resistant tablet','gastro resistant tablet','enteric-coated tablet'],
    tablet_modified:['prolonged-release tablet','modified-release tablet','extended-release tablet','sustained-release tablet'],
    tablet_effervescent:['effervescent tablet'],tablet_orodispersible:['orodispersible tablet'],
    capsule:['capsule'],capsule_modified:['modified-release capsule','prolonged-release capsule'],
    suppository:['suppository'],cream:['cream'],ointment:['ointment'],gel:['gel'],
    eye_drops:['eye drops'],ear_drops:['ear drops'],nasal_spray:['nasal spray'],oromucosal_spray:['oromucosal spray','mouth spray'],
    oral_solution:['oral solution'],oral_suspension:['oral suspension'],oral_drops:['oral drops'],
    injection_solution:['solution for injection'],infusion_solution:['solution for infusion'],infusion_concentrate:['concentrate for solution for infusion'],
    injection_powder:['powder for solution for injection'],inhalation:['inhalation','nebuliser','nebulizer'],patch:['patch'],powder:['powder'],granules:['granules'],solution:['solution'],suspension:['suspension']
  };
  const needles=map[f]||[ascii(target).toLowerCase()];
  return needles.some(n=>s.includes(n));
}
function clinicalStrength(strength,form){
  let s=ascii(strength).toLowerCase().trim().replace(/,/g,'.').replace(/\s+/g,'');
  const f=ascii(form).toLowerCase();
  const semi=/cream|gel|ointment|paste|cutaneous|dermal/.test(f);
  const liquid=/solution|spray|drops|infusion|injection|syrup|suspension|emulsion|oral/.test(f);
  let m; const fmt=n=>Number(n.toFixed(6)).toString();
  if((m=s.match(/^(\d+(?:\.\d+)?)%$/))){const p=Number(m[1]);if(semi)return `${fmt(p*10)}mg/g`;if(liquid)return `${fmt(p*10)}mg/ml`;return `${fmt(p)}pct`;}
  if((m=s.match(/^(0?\.\d+)$/))){const p=Number(m[1])*100;if(semi)return `${fmt(p*10)}mg/g`;if(liquid)return `${fmt(p*10)}mg/ml`;return `${fmt(p)}pct`;}
  if((m=s.match(/^(\d+(?:\.\d+)?)mg\/(?:1)?ml$/)))return `${fmt(Number(m[1]))}mg/ml`;
  if((m=s.match(/^(\d+(?:\.\d+)?)g\/(?:1)?l$/)))return `${fmt(Number(m[1]))}mg/ml`;
  if((m=s.match(/^(\d+(?:\.\d+)?)mg\/(?:1)?g$/)))return `${fmt(Number(m[1]))}mg/g`;
  return s;
}
function strengthAtoms(v){
  const s=ascii(v).toLowerCase().replace(/,/g,'.');
  const out=[]; const re=/(\d+(?:\.\d+)?)\s*(microgram(?:s)?|mcg|ug|μg|µg|mg|g|ml|iu|%)/g; let m;
  while((m=re.exec(s))){
    let u=m[2].replace(/micrograms?|mcg|μg|µg/,'ug');
    out.push(String(Number(m[1]))+u);
  }
  return [...new Set(out)];
}
function strengthEvidence(targetStrength,targetForm,text){
  const s=squash(text);
  const raw=squash(targetStrength);
  if(raw && s.includes(raw)) return true;
  const atoms=strengthAtoms(targetStrength);
  if(atoms.length && atoms.every(a=>s.includes(squash(a)))) return true;
  const c=clinicalStrength(targetStrength,targetForm);
  if(c && s.includes(squash(c))) return true;
  const cm=c.match(/^(\d+(?:\.\d+)?)mg\/(g|ml)$/);
  if(cm){
    const n=cm[1],unit=cm[2];
    if(unit==='g' && (s.includes(`${n}mgpergram`)||s.includes(`${n}mgin1g`)||s.includes(`eachgramcontains${n}mg`))) return true;
    if(unit==='ml' && (s.includes(`${n}mgperml`)||s.includes(`${n}mgin1ml`)||s.includes(`eachmlcontains${n}mg`))) return true;
  }
  return false;
}
async function fetchHtml(url){
  let last=null;
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const res=await fetch(url,{redirect:'follow',headers:{'User-Agent':UA,Accept:'text/html,application/xhtml+xml;q=0.9,*/*;q=0.2'}});
      if(res.status===429||res.status>=500){last=new Error('HTTP '+res.status);await sleep(400*attempt);continue;}
      if(!res.ok)return {ok:false,status:res.status,url:res.url||url,error:'HTTP '+res.status};
      const ct=res.headers.get('content-type')||'';
      if(!isHtmlContentType(ct)) return {ok:false,status:res.status,url:res.url||url,error:'non_html:'+ct};
      const html=await res.text();
      if(html.length>8_000_000)return {ok:false,status:res.status,url:res.url||url,error:'html_too_large'};
      return {ok:true,status:res.status,url:res.url||url,html,contentType:ct};
    }catch(e){last=e;await sleep(300*attempt);}
  }
  return {ok:false,status:null,url,error:String(last?.message||last||'fetch_failed')};
}
function candidateUrls(row){
  const urls=[...(row.sourceUrls||[])].filter(u=>{
    if(!/^https?:\/\//i.test(String(u||''))) return false;
    const d=hostname(u);
    if(d==='www.medicines.org.uk'||d==='medicines.org.uk') return false;
    return true;
  });
  const uniq=[...new Set(urls)];
  return uniq.sort((a,b)=>sourceTier(b)-sourceTier(a)).slice(0,4);
}
function parseSource(row,url,html,finalUrl){
  const title=titleFromHtml(html);
  const text=htmlToText(html);
  const composition=extractCompositionSection(text);
  const clinical=extractClinicalSections(text);
  const s2=composition?.text||'';
  const s41=clinical.sections?.['4.1']?.text||'';
  const s42=clinical.sections?.['4.2']?.text||'';
  const matchText=[title,text.slice(0,12000),s2].join('\n');
  const strengthOk=strengthEvidence(row.strength,row.pharmaceuticalForm,matchText);
  const formOk=formEvidence(row.pharmaceuticalForm,[title,text.slice(0,12000)].join('\n'));
  const required=Boolean(s41&&s42);
  const exact=exactEligible(finalUrl||url)&&required&&Boolean(s2)&&strengthOk&&formOk;
  let status='SOURCE_REACHABLE_REVIEW';
  if(exact) status='EXACT_SECONDARY_SMPC';
  else if(required) status='SMPC_PROVENANCE_REVIEW';
  return {
    sourceUrl:url,finalUrl:finalUrl||url,sourceDomain:hostname(finalUrl||url),sourceTier:sourceTier(finalUrl||url),
    title,matchStatus:status,exactEligible:exactEligible(finalUrl||url),strengthEvidence:strengthOk,formEvidence:formOk,
    section2Present:Boolean(s2),section41Present:Boolean(s41),section42Present:Boolean(s42),
    section2Sha256:s2?sha256(s2):null,section41Sha256:s41?sha256(s41):null,section42Sha256:s42?sha256(s42):null,
    section2Characters:s2.length,section41Characters:s41.length,section42Characters:s42.length
  };
}
function loadRows(){
  const all=[];
  for(let i=1;i<=4;i++){
    const p=path.join(ROOT,'data',`drx-master-source-seed-chunk-${String(i).padStart(2,'0')}.json`);
    const x=JSON.parse(fs.readFileSync(p,'utf8')); all.push(...(x.rows||[]));
  }
  return all;
}
async function main(){
  const input=loadRows();
  const targets=input.filter(r=>r.reviewState!=='EXACT');
  const cache=new Map(); let done=0;
  async function fetchCached(url){
    if(!cache.has(url)) cache.set(url,fetchHtml(url));
    return await cache.get(url);
  }
  const rows=await mapLimit(targets,6,async row=>{
    const candidates=candidateUrls(row); const attempts=[]; let best=null;
    for(const url of candidates){
      const fetched=await fetchCached(url);
      if(!fetched.ok){attempts.push({sourceUrl:url,status:'FETCH_FAILED',error:fetched.error||('HTTP '+fetched.status)});continue;}
      const parsed=parseSource(row,url,fetched.html,fetched.url);
      attempts.push(parsed);
      if(!best || parsed.sourceTier>best.sourceTier || (parsed.matchStatus==='EXACT_SECONDARY_SMPC'&&best.matchStatus!=='EXACT_SECONDARY_SMPC')) best=parsed;
      if(parsed.matchStatus==='EXACT_SECONDARY_SMPC')break;
    }
    done++; if(done%50===0||done===targets.length)console.log('Secondary source',done,'/',targets.length);
    await sleep(25);
    return {
      variantGroupId:row.variantGroupId,sourceVariantId:row.sourceVariantId,canonicalSubstance:row.canonicalSubstance,
      canonicalKey:row.canonicalKey,atcCode:row.atcCode,strength:row.strength,pharmaceuticalForm:row.pharmaceuticalForm,
      priorReviewState:row.reviewState,seedRegistryStatus:row.seedRegistryStatus,bestSource:best,attempts,
      publicationAllowed:false
    };
  });
  const counts={}; for(const r of rows){const k=r.bestSource?.matchStatus||'NO_USABLE_SOURCE';counts[k]=(counts[k]||0)+1;}
  const out={schemaVersion:'drx-master-secondary-source-enrichment-v1',generatedAt:new Date().toISOString(),inputRows:input.length,targetRows:targets.length,counts,policy:{autoPublication:false,exactDomains:['cima.aemps.es'],requiresSections:['2','4.1','4.2'],crossStrengthBinding:false,saltsAutoCollapsed:false},rows};
  fs.writeFileSync(OUT,JSON.stringify(out,null,2)+'\n');
  const size=350;
  for(let start=0;start<rows.length;start+=size){
    const idx=String(Math.floor(start/size)+1).padStart(2,'0');
    const compact=rows.slice(start,start+size).map(r=>({variantGroupId:r.variantGroupId,sourceVariantId:r.sourceVariantId,priorReviewState:r.priorReviewState,bestSource:r.bestSource,publicationAllowed:false}));
    fs.writeFileSync(path.join(ROOT,'data',`drx-master-secondary-sheet-chunk-${idx}.json`),JSON.stringify({schemaVersion:'drx-master-secondary-sheet-chunk-v1',generatedAt:out.generatedAt,startRow:start,rows:compact},null,2)+'\n');
  }
  console.log(JSON.stringify({ok:true,targetRows:targets.length,uniqueFetchedUrls:cache.size,counts},null,2));
}
main().catch(e=>{console.error(e);process.exit(1);});
