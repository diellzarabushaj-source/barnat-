'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { htmlToText } = require('../lib/smpc-parser.js');

const ROOT = path.resolve(__dirname, '..');
const INPUT = path.join(ROOT, 'data', 'drx-master-registry-combos-v1.json');
const OUTPUT = path.join(ROOT, 'data', 'drx-master-cima-scrape-v1.json');
const BASE = 'https://cima.aemps.es/cima/rest';
const USER_AGENT = 'DRx-MedIndex/1.0 clinical-data-enrichment';
const limitArg = process.argv.find(x => x.startsWith('--limit='));
const LIMIT = limitArg ? Math.max(1, Number(limitArg.slice(8)) || 1) : Infinity;

function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }
function sha256(text){ return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex'); }
function stripDiacritics(s){ return String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); }
function key(s){ return stripDiacritics(s).toLowerCase().replace(/[^a-z0-9]+/g, ''); }
function firstAtc(value){
  const s=String(value||'').toUpperCase();
  const exact=s.match(/[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}/);
  if(exact) return exact[0];
  return s.split(/[;,/\s]+/).find(Boolean) || '';
}
function ingredientCount(s){
  const t=String(s||'').trim();
  if(!t) return 0;
  return t.split(/\s*;\s*|\s+\+\s+|\s+\/\s+/).filter(Boolean).length;
}
function unitNorm(u){
  return stripDiacritics(u).toLowerCase()
    .replace(/microgram(?:os?)?|mcg|ug|μg|µg/g,'ug')
    .replace(/miligramos?|milligrams?|mg/g,'mg')
    .replace(/gramos?|grams?|\bg\b/g,'g')
    .replace(/mililitros?|millilitres?|milliliters?|ml/g,'ml')
    .replace(/unidades internacionales?|international units?|u\.i\.|iu/g,'iu')
    .replace(/\s+/g,'');
}
function strengthSignature(s){
  const text=stripDiacritics(s).toLowerCase().replace(/,/g,'.');
  const out=[];
  const re=/(\d+(?:\.\d+)?)\s*(%|microgram(?:os?)?|mcg|ug|μg|µg|mg|g|ml|iu|u\.i\.)/g;
  let m;
  while((m=re.exec(text))) out.push(String(Number(m[1]))+unitNorm(m[2]));
  return out.join('|');
}
function formFamily(value){
  const s=stripDiacritics(value).toLowerCase();
  const has=(...xs)=>xs.some(x=>s.includes(x));
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
  if(has('cream','crema')) return 'cream';
  if(has('ointment','pomada','unguento','ungüento')) return 'ointment';
  if(has('gel')) return 'gel';
  if(has('syrup','jarabe')) return 'syrup';
  if(has('oral drops','gotas orales')) return 'oral_drops';
  if(has('oral solution','solucion oral','solución oral')) return 'oral_solution';
  if(has('oral suspension','suspension oral','suspensión oral')) return 'oral_suspension';
  if(has('solution for infusion','solucion para perfusion','solución para perfusión')) return 'infusion_solution';
  if(has('concentrate for solution for infusion','concentrado para solucion para perfusion','concentrado para solución para perfusión')) return 'infusion_concentrate';
  if(has('solution for injection','solucion inyectable','solución inyectable')) return 'injection_solution';
  if(has('powder for solution for injection','polvo para solucion inyectable','polvo para solución inyectable')) return 'injection_powder';
  if(has('inhal','nebul')) return 'inhalation';
  if(has('patch','parche')) return 'patch';
  if(has('powder','polvo')) return 'powder';
  if(has('granules','granulado')) return 'granules';
  if(has('solution','solucion','solución')) return 'solution';
  if(has('suspension','suspensión')) return 'suspension';
  return key(s);
}
function formCompatible(a,b){
  const x=formFamily(a), y=formFamily(b);
  if(x===y) return {exact:true,family:x};
  const tablet=new Set(['tablet','tablet_film']);
  if(tablet.has(x)&&tablet.has(y)) return {exact:false,compatible:true,family:x+'~'+y};
  return {exact:false,compatible:false,family:x+'~'+y};
}
function hasTechnicalDoc(med){
  return Array.isArray(med?.docs) && med.docs.some(d => Number(d?.tipo)===1 || /ficha|tecnica|técnica/i.test(String(d?.url||'')));
}
function extractList(payload){
  if(Array.isArray(payload)) return payload;
  for(const k of ['resultados','results','medicamentos','items','data']){
    if(Array.isArray(payload?.[k])) return payload[k];
  }
  return [];
}
function totalPages(payload){
  const candidates=[
    payload?.totalPaginas,payload?.totalPages,payload?.paginas,
    payload?.paginacion?.totalPaginas,payload?.page?.totalPages
  ].map(Number).filter(Number.isFinite);
  return candidates[0] || null;
}
async function fetchJson(url, opts={}){
  let last;
  for(let attempt=1;attempt<=4;attempt++){
    try{
      const res=await fetch(url,{...opts,headers:{Accept:'application/json','User-Agent':USER_AGENT,...opts.headers}});
      if(res.status===404) return null;
      if(res.status===429 || res.status>=500){
        last=new Error('HTTP '+res.status+' '+url);
        await sleep(500*attempt);
        continue;
      }
      if(!res.ok) throw new Error('HTTP '+res.status+' '+url);
      return await res.json();
    }catch(err){
      last=err;
      if(attempt<4) await sleep(400*attempt);
    }
  }
  throw last;
}
async function fetchMedicinesByAtc(atc){
  const all=[]; const seen=new Set();
  for(let page=1;page<=60;page++){
    const u=new URL(BASE+'/medicamentos');
    u.searchParams.set('atc',atc);
    u.searchParams.set('comerc','1');
    u.searchParams.set('autorizados','1');
    u.searchParams.set('pagina',String(page));
    const payload=await fetchJson(u);
    const items=extractList(payload);
    if(!items.length) break;
    let fresh=0;
    for(const item of items){
      const id=String(item?.nregistro||item?.cn||item?.nombre||'');
      if(id && !seen.has(id)){seen.add(id);all.push(item);fresh++;}
    }
    const pages=totalPages(payload);
    if((pages && page>=pages) || fresh===0) break;
    await sleep(60);
  }
  return all;
}
async function fetchMedicinesByIngredient(name){
  const u=new URL(BASE+'/medicamentos');
  u.searchParams.set('practiv1',name);
  u.searchParams.set('comerc','1');
  u.searchParams.set('autorizados','1');
  const payload=await fetchJson(u);
  return extractList(payload);
}
function scoreCandidate(target,c){
  const tSig=strengthSignature(target.strength);
  const cSig=strengthSignature(c?.dosis||'');
  const strengthExact=Boolean(tSig && cSig && tSig===cSig);
  const f=formCompatible(target.pharmaceuticalForm,c?.formaFarmaceutica?.nombre||c?.formaFarmaceuticaSimplificada?.nombre||'');
  const atc=firstAtc(target.atcCode);
  const candidateAtcs=(c?.atcs||[]).map(x=>String(x?.codigo||'').toUpperCase());
  const atcExact=Boolean(atc && candidateAtcs.includes(atc));
  const targetN=ingredientCount(target.activeSubstance);
  const candN=Array.isArray(c?.principiosActivos)?c.principiosActivos.length:0;
  const ingredientsCompatible=!targetN||!candN||targetN===candN;
  let score=0;
  if(atcExact) score+=4;
  if(strengthExact) score+=5;
  if(f.exact) score+=4; else if(f.compatible) score+=2;
  if(c?.comerc===true) score+=1;
  if(hasTechnicalDoc(c)) score+=1;
  if(ingredientsCompatible) score+=1;
  return {score,strengthExact,formExact:f.exact,formCompatible:f.compatible||f.exact,atcExact,ingredientsCompatible,targetStrengthSignature:tSig,candidateStrengthSignature:cSig,targetFormFamily:formFamily(target.pharmaceuticalForm),candidateFormFamily:formFamily(c?.formaFarmaceutica?.nombre||c?.formaFarmaceuticaSimplificada?.nombre||'')};
}
function matchStatus(meta){
  if(meta.atcExact && meta.strengthExact && meta.formExact) return 'EXACT_ATC_STRENGTH_FORM';
  if(meta.atcExact && meta.strengthExact && meta.formCompatible) return 'ATC_STRENGTH_FORM_COMPATIBLE_REVIEW';
  if(meta.atcExact && meta.strengthExact) return 'ATC_STRENGTH_MATCH_FORM_REVIEW';
  if(meta.atcExact && meta.formExact) return 'ATC_FORM_MATCH_STRENGTH_REVIEW';
  if(meta.atcExact) return 'ATC_CANDIDATE';
  return 'NO_MATCH';
}
async function getMedicine(nregistro){
  const u=new URL(BASE+'/medicamento');
  u.searchParams.set('nregistro',nregistro);
  return await fetchJson(u);
}
async function getSections(nregistro){
  const u=new URL(BASE+'/docSegmentado/contenido/1');
  u.searchParams.set('nregistro',nregistro);
  const payload=await fetchJson(u);
  const list=extractList(payload);
  const byCode={};
  for(const s of list){
    const code=String(s?.seccion||s?.codigo||'').trim();
    if(!code) continue;
    byCode[code]=htmlToText(s?.contenido||'');
  }
  return byCode;
}
function techDoc(med){
  return (med?.docs||[]).find(d=>Number(d?.tipo)===1) || null;
}
function compactIngredient(p){
  return {name:String(p?.nombre||''),quantity:String(p?.cantidad||''),unit:String(p?.unidad||'')};
}

async function main(){
  const manifest=JSON.parse(fs.readFileSync(INPUT,'utf8'));
  if(!Array.isArray(manifest.rows)) throw new Error('manifest rows missing');
  const targets=manifest.rows.slice(0,LIMIT);
  const byAtc=new Map();
  for(const t of targets){
    const atc=firstAtc(t.atcCode);
    if(atc && !byAtc.has(atc)) byAtc.set(atc,null);
  }
  let atcDone=0;
  for(const atc of byAtc.keys()){
    try{ byAtc.set(atc,await fetchMedicinesByAtc(atc)); }
    catch(err){ byAtc.set(atc,{error:String(err?.message||err),items:[]}); }
    atcDone++;
    if(atcDone%25===0) console.log('CIMA ATC cache',atcDone,'/',byAtc.size);
    await sleep(80);
  }

  const rows=[]; let i=0;
  for(const target of targets){
    i++;
    const atc=firstAtc(target.atcCode);
    const cached=byAtc.get(atc);
    let candidates=Array.isArray(cached)?cached:(cached?.items||[]);
    let searchMode='ATC';
    if(!candidates.length){
      try{candidates=await fetchMedicinesByIngredient(target.activeSubstance);searchMode='ACTIVE_INGREDIENT_FALLBACK';}
      catch{}
    }
    const ranked=candidates.map(c=>({candidate:c,meta:scoreCandidate(target,c)})).sort((a,b)=>b.meta.score-a.meta.score);
    const best=ranked[0]||null;
    const status=best?matchStatus(best.meta):'NO_MATCH';
    let detail=null,sections=null,error=null;
    if(best?.candidate?.nregistro && best.meta.score>=9){
      try{
        detail=await getMedicine(String(best.candidate.nregistro));
        sections=await getSections(String(best.candidate.nregistro));
      }catch(err){error=String(err?.message||err);}
    }
    const doc=techDoc(detail||best?.candidate||{});
    const s2=sections?.['2']||'';
    const s41=sections?.['4.1']||'';
    const s42=sections?.['4.2']||'';
    rows.push({
      dedupeKey:target.dedupeKey,
      activeSubstance:target.activeSubstance,
      atcCode:target.atcCode,
      strength:target.strength,
      pharmaceuticalForm:target.pharmaceuticalForm,
      marketProductCount:target.marketProductCount,
      searchMode,
      matchStatus:status,
      matchScore:best?.meta?.score||0,
      nregistro:String((detail||best?.candidate)?.nregistro||''),
      cimaProductName:String((detail||best?.candidate)?.nombre||''),
      cimaDose:String((detail||best?.candidate)?.dosis||''),
      cimaPharmaceuticalForm:String((detail||best?.candidate)?.formaFarmaceutica?.nombre||''),
      cimaSimplifiedForm:String((detail||best?.candidate)?.formaFarmaceuticaSimplificada?.nombre||''),
      activeIngredients:Array.isArray((detail||best?.candidate)?.principiosActivos)?(detail||best.candidate).principiosActivos.map(compactIngredient):[],
      routes:Array.isArray((detail||best?.candidate)?.viasAdministracion)?(detail||best.candidate).viasAdministracion.map(v=>String(v?.nombre||'')).filter(Boolean):[],
      sourceUrl:String(doc?.urlHtml||doc?.url||''),
      sourceDate:doc?.fecha||null,
      section2Present:Boolean(s2),section41Present:Boolean(s41),section42Present:Boolean(s42),
      section2Sha256:s2?sha256(s2):null,section41Sha256:s41?sha256(s41):null,section42Sha256:s42?sha256(s42):null,
      section2Characters:s2.length,section41Characters:s41.length,section42Characters:s42.length,
      matching:best?.meta||null,
      error,
      publicationAllowed:false
    });
    if(i%50===0) console.log('Matched',i,'/',targets.length);
    await sleep(40);
  }

  const counts={};
  for(const r of rows) counts[r.matchStatus]=(counts[r.matchStatus]||0)+1;
  const out={
    schemaVersion:'drx-master-cima-scrape-v1',
    generatedAt:new Date().toISOString(),
    source:{authority:'AEMPS',system:'CIMA REST API',baseUrl:BASE},
    input:{schemaVersion:manifest.schemaVersion,rows:targets.length},
    policy:{
      exactDefinition:'exact ATC + normalized strength signature + pharmaceutical-form family',
      crossStrengthBinding:false,
      saltsAutoCollapsed:false,
      autoPublication:false
    },
    counts,
    rows
  };
  fs.writeFileSync(OUTPUT,JSON.stringify(out,null,2)+'\n');
  console.log(JSON.stringify({ok:true,rows:rows.length,counts},null,2));
}
main().catch(err=>{console.error(err);process.exit(1);});
