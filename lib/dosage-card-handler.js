'use strict';

const { supabaseRequest } = require('./supabase-data-api.js');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REGISTRY_NUMBER_RE = /^\d{1,6}$/;
const MAX_REGIMENS = 16;
const MAX_BATCH_DRUGS = 100;
const MAX_BATCH_REGIMENS = MAX_BATCH_DRUGS * 2 + 20;

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const safeUrl = value => /^https:\/\/[^\s]+$/i.test(clean(value)) ? clean(value) : '';

async function authorized(req) {
  const auth = await import('./auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

function requestUrl(req) {
  try { return new URL(req?.url || '/api/dosage', 'http://medindex.local'); }
  catch { return new URL('/api/dosage', 'http://medindex.local'); }
}
function requestDrugId(req) { return clean(requestUrl(req).searchParams.get('id')); }
function requestRegistryNumbers(req) {
  const raw = clean(requestUrl(req).searchParams.get('nr') || requestUrl(req).searchParams.get('nrs'));
  if (!raw) return [];
  const tokens = raw.split(',').map(clean).filter(Boolean);
  if (!tokens.length || tokens.length > MAX_BATCH_DRUGS || tokens.some(value => !REGISTRY_NUMBER_RE.test(value))) return null;
  return [...new Set(tokens)];
}
function isBatchRequest(req) { return requestUrl(req).searchParams.get('view') === 'cards'; }

async function readRows(path, label) {
  const { data } = await supabaseRequest(path, { timeoutMs:4500, label });
  if (!Array.isArray(data)) throw new Error(`${label}: Supabase nuk ktheu listë.`);
  return data;
}

function regimenPath(drugId) {
  const params = new URLSearchParams();
  params.set('select', ['population','dose_text','route','frequency_text','duration_text','maximum_text','warnings','indication_text','source_url','reviewed_at','source_key','calculation_status'].join(','));
  params.set('drug_id', `eq.${drugId}`);
  params.set('editorial_status', 'eq.published');
  params.set('calculation_status', 'in.(text_verified,calculable_verified)');
  params.set('order', 'population.asc,source_key.asc');
  params.set('limit', String(MAX_REGIMENS));
  return `dosage_regimens?${params.toString()}`;
}
function profilePath(drugId) {
  const params = new URLSearchParams();
  params.set('select', ['verification_status','clinical_summary','indications_text','contraindications','warnings','interactions','pregnancy_lactation','renal_adjustment','hepatic_adjustment','monitoring','administration_notes','source_urls','reviewed_at'].join(','));
  params.set('drug_id', `eq.${drugId}`);
  params.set('limit', '1');
  return `drug_clinical_profiles?${params.toString()}`;
}
function drugsByRegistryPath(numbers) {
  const params = new URLSearchParams();
  params.set('select', 'id,registry_number,pdid,trade_name,strength,drug_class,use_text');
  params.set('registry_number', `in.(${numbers.join(',')})`);
  params.set('is_published', 'eq.true');
  params.set('editorial_status', 'eq.published');
  params.set('order', 'registry_number.asc');
  params.set('limit', String(MAX_BATCH_DRUGS));
  return `drugs?${params.toString()}`;
}
function batchRegimenPath(drugIds) {
  const params = new URLSearchParams();
  params.set('select', 'drug_id,population,dose_text,route,indication_text,source_url,reviewed_at,source_key,calculation_status');
  params.set('drug_id', `in.(${drugIds.join(',')})`);
  params.set('editorial_status', 'eq.published');
  params.set('calculation_status', 'in.(text_verified,calculable_verified)');
  params.set('source_key', 'like.card:*');
  params.set('order', 'drug_id.asc,population.asc,source_key.asc');
  params.set('limit', String(MAX_BATCH_REGIMENS));
  return `dosage_regimens?${params.toString()}`;
}
function publicRegimen(row) {
  if (!row) return null;
  return { population:clean(row.population), dose:clean(row.dose_text), route:clean(row.route), frequency:clean(row.frequency_text), duration:clean(row.duration_text), maximum:clean(row.maximum_text), warnings:clean(row.warnings), indication:clean(row.indication_text), sourceUrl:safeUrl(row.source_url), reviewedAt:row.reviewed_at || null, verification:clean(row.calculation_status) };
}
function chooseRegimen(rows, population) {
  const candidates = rows.filter(row => clean(row.population) === population);
  if (!candidates.length) return null;
  const card = candidates.find(row => /^card:/i.test(clean(row.source_key)) && clean(row.dose_text));
  return publicRegimen(card || candidates.find(row => clean(row.dose_text)) || candidates[0]);
}
function publicProfile(row) {
  const value = row || {};
  return { verificationStatus:clean(value.verification_status), summary:clean(value.clinical_summary), indications:clean(value.indications_text), contraindications:clean(value.contraindications), warnings:clean(value.warnings), interactions:clean(value.interactions), pregnancyLactation:clean(value.pregnancy_lactation), renalAdjustment:clean(value.renal_adjustment), hepaticAdjustment:clean(value.hepatic_adjustment), monitoring:clean(value.monitoring), administrationNotes:clean(value.administration_notes), sourceUrls:Array.isArray(value.source_urls) ? value.source_urls.map(safeUrl).filter(Boolean).slice(0,8) : [], reviewedAt:value.reviewed_at || null };
}
function sourceList(adult, pediatric, profile = { sourceUrls:[] }) { return [...new Set([adult?.sourceUrl,pediatric?.sourceUrl,...(profile.sourceUrls || [])].map(safeUrl).filter(Boolean))].slice(0,8); }
function publicBatchCard(drug, rows) {
  const adult = chooseRegimen(rows, 'adult');
  const pediatric = chooseRegimen(rows, 'pediatric');
  return { registryNumber:clean(drug.registry_number), drugId:clean(drug.id), pdid:clean(drug.pdid), tradeName:clean(drug.trade_name), strength:clean(drug.strength), drugClass:clean(drug.drug_class), use:clean(drug.use_text), cardKey:[clean(drug.pdid),clean(drug.trade_name),clean(drug.strength)].join('|'), adultDose:clean(adult?.dose), adultRoute:clean(adult?.route), pediatricDose:clean(pediatric?.dose), pediatricRoute:clean(pediatric?.route), sourceUrls:sourceList(adult,pediatric) };
}
function setCommonHeaders(res, startedAt, timingName) {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','private, max-age=60, stale-while-revalidate=300');
  res.setHeader('Vary','Cookie');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-MedIndex-Data-Source','Supabase');
  res.setHeader('Server-Timing',`${timingName};dur=${Date.now()-startedAt}`);
}
async function handleBatch(req,res,startedAt) {
  const numbers=requestRegistryNumbers(req);
  if(numbers===null || !numbers.length){res.setHeader('Cache-Control','no-store');return res.status(400).json({error:`Jep 1–${MAX_BATCH_DRUGS} numra validë të regjistrit.`});}
  const drugs=await readRows(drugsByRegistryPath(numbers),'Supabase visible registry dosage drugs');
  const ids=drugs.map(row=>clean(row.id)).filter(UUID_RE.test.bind(UUID_RE));
  const regimens=ids.length ? await readRows(batchRegimenPath(ids),'Supabase visible registry dosage cards') : [];
  const byDrug=new Map();
  for(const row of regimens){const drugId=clean(row.drug_id);if(!byDrug.has(drugId))byDrug.set(drugId,[]);byDrug.get(drugId).push(row);}
  const cards=drugs.map(drug=>publicBatchCard(drug,byDrug.get(clean(drug.id)) || []));
  setCommonHeaders(res,startedAt,'supabase-dosagecards');
  if(req.method==='HEAD') return res.status(200).end();
  return res.status(200).json({ok:true,cards,meta:{dataSource:'supabase',targeted:true,batch:true,requested:numbers.length,drugs:drugs.length,regimenRows:regimens.length}});
}
async function handleSingle(req,res,startedAt) {
  const drugId=requestDrugId(req);
  if(!UUID_RE.test(drugId)){res.setHeader('Cache-Control','no-store');return res.status(400).json({error:'ID e barit është e pavlefshme.'});}
  const [regimens,profiles]=await Promise.all([readRows(regimenPath(drugId),'Supabase clinical card dosage'),readRows(profilePath(drugId),'Supabase clinical card profile')]);
  const adult=chooseRegimen(regimens,'adult'), pediatric=chooseRegimen(regimens,'pediatric'), profile=publicProfile(profiles[0]), sources=sourceList(adult,pediatric,profile);
  setCommonHeaders(res,startedAt,'supabase-clinicalcard');
  if(req.method==='HEAD') return res.status(200).end();
  return res.status(200).json({ok:true,drugId,adult,pediatric,profile,sources,meta:{dataSource:'supabase',regimenRows:regimens.length,targeted:true}});
}
async function handler(req,res){
  const startedAt=Date.now();
  try{
    if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return res.status(405).json({error:'Lejohet vetëm GET/HEAD.'});}
    if(!(await authorized(req))){res.setHeader('Cache-Control','no-store');return res.status(401).json({error:'Sesioni nuk është aktiv.'});}
    return isBatchRequest(req) ? handleBatch(req,res,startedAt) : handleSingle(req,res,startedAt);
  }catch(error){console.error(isBatchRequest(req)?'Supabase visible registry dosage cards error:':'Supabase targeted clinical card error:',error);res.setHeader('Cache-Control','no-store');return res.status(500).json({error:'Detajet klinike nuk u ngarkuan.',ok:false});}
}
handler._test=Object.freeze({requestDrugId,requestRegistryNumbers,isBatchRequest,regimenPath,profilePath,drugsByRegistryPath,batchRegimenPath,chooseRegimen,publicRegimen,publicProfile,sourceList,publicBatchCard});
module.exports=handler;
