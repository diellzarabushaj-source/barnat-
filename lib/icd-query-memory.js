'use strict';

// An additive terminology layer. The existing ICD dataset owns codes and titles.
const Search = require('./icd-search-engine-v3.js');
const FullIcd = require('./icd-full-hierarchy.js');
const Symptoms = require('./icd-symptom-intent.js');
const {neonRequest} = require('./medindex-data-api.js');
const VERSION = 'ICD-10-WHO 2019';
const TABLE = 'icd_query_memory_v1';
const TTL = 5 * 60 * 1000;
const vocabularyByDataset = new WeakMap();
const snapshots = new Map();
const stats = {reads:0,cacheHits:0,cacheMisses:0,lookupHits:0,aiCalls:0,aiAvoided:0,submissions:0,duplicateSubmissions:0};
const normalize = value => Search.normalize(String(value || '')).replace(/\*/g, '').replace(/\s+/g, ' ').trim();
const clean = value => String(value || '').trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function vocabulary(dataset) {
  if (vocabularyByDataset.has(dataset)) return vocabularyByDataset.get(dataset);
  const words = new Set('po pom me m mu dhemb dhem dhembet ther therje ndjej kam ka ne te e i o osht eshte sme spo kraherori kraharori majte djathte nalt poshte kur fryme marr'.split(' '));
  const add = text => normalize(text).split(' ').filter(Boolean).forEach(word => words.add(word));
  for (const node of dataset.nodes || []) {
    [node.englishTitle,node.albanianDraft,node.displayTitle,node.latinTitle,...(node.terminologyAliases || [])].forEach(add);
  }
  for (const title of FullIcd.LATIN_TITLE_BY_CODE.values()) add(title);
  for (const concept of Symptoms.DATASET.concepts || []) [concept.label_sq,...(concept.aliases || [])].forEach(add);
  vocabularyByDataset.set(dataset, words);
  return words;
}

// Unknown words are deliberately rejected: patient names are not terminology.
// No raw search log is kept. A caller must also explicitly attest term-only input.
function safeExpression(value, dataset) {
  const raw = clean(value);
  if (raw.length < 3 || raw.length > 80 || !/^[\p{L}\s'’-]+$/u.test(raw)) return '';
  const normalized = normalize(raw), tokens = normalized.split(' ');
  if (tokens.length > 12 || !tokens.every(token => vocabulary(dataset).has(token))) return '';
  return normalized;
}

function codeNode(dataset, code) {
  if (dataset.version !== VERSION) return null;
  const node = FullIcd.attachIndexes(dataset).byCode.get(clean(code).toUpperCase());
  return node && ['category','subcategory'].includes(node.level) ? node : null;
}

function symptomQuery(query) {
  const match = Symptoms.intentPayload(query);
  return Boolean(match || /\b(dhimb|dhemb|dolor|therje|symptom|simptom|pain)\w*/i.test(normalize(query)));
}

function validMapping(dataset, query, code, kind = 'alias') {
  const node = codeNode(dataset, code);
  if (!node) return null;
  if (kind === 'alias' && symptomQuery(query) && !/^R\d/.test(node.code) && Symptoms.intentPayload(query)?.symptom_code !== node.code) return null;
  if (kind === 'latin' && (node.latinTitle || FullIcd.LATIN_TITLE_BY_CODE.get(node.code))) return null;
  return node;
}

function publicRow(row, dataset) {
  if (row.classification !== VERSION || !['verified','personal'].includes(row.status)) return null;
  const node = validMapping(dataset,row.expression,row.code,row.kind);
  if (!node) return null;
  return {expression:row.expression,normalized:normalize(row.expression),code:node.code,kind:row.kind,scope:row.scope,verification:row.status};
}

async function readAliases(dataset, owner = '', request = neonRequest) {
  if (dataset.version !== VERSION) return [];
  const key = VERSION + '|' + owner;
  const cached = snapshots.get(key);
  if (cached && cached.until > Date.now()) { stats.cacheHits++; return cached.promise; }
  stats.cacheMisses++;
  const promise = (async () => {
    const rows = [];
    const filter = owner
      ? `scope=eq.personal&status=eq.personal&owner_id=eq.${encodeURIComponent(owner)}`
      : 'scope=eq.global&status=eq.verified';
    for (let offset=0; offset<5000;) {
      stats.reads++;
      const {data} = await request(`${TABLE}?select=expression,code,kind,scope,status,classification&classification=eq.${encodeURIComponent(VERSION)}&${filter}&order=id.asc&limit=250&offset=${offset}`, {timeoutMs:1800,maxAttempts:1});
      const page = Array.isArray(data) ? data : [];
      rows.push(...page.map(row=>publicRow(row,dataset)).filter(Boolean));
      if (!page.length) break;
      offset += page.length;
    }
    return rows;
  })().catch(()=>{ const cached=snapshots.get(key);if(cached)cached.until=Date.now()+30000;return []; });
  snapshots.set(key,{until:Date.now()+TTL,promise});
  while(snapshots.size>40)snapshots.delete(snapshots.keys().next().value);
  return promise;
}

function clearCache() { snapshots.clear(); }
function matchAliases(rows, query, dataset, allowed = null) {
  const key = normalize(query), seen = new Set(), hits = [];
  if (!key) return hits;
  for (const row of rows) {
    if (row.kind !== 'alias' || row.normalized !== key || seen.has(row.code) || (allowed && !allowed.has(row.code))) continue;
    const node=validMapping(dataset,query,row.code);
    if(!node)continue;
    seen.add(row.code);
    hits.push({...node,searchMatch:{type:row.verification==='verified'?'verified-query-alias':'personal-query-alias',label:row.verification==='verified'?'Shprehje e verifikuar':'Preferencë personale',field:'alias',score:1350},memoryVerification:row.verification});
  }
  if(hits.length)stats.lookupHits++;
  return hits;
}

function applyLatin(node, aliases) {
  if (!node || node.latinTitle || FullIcd.LATIN_TITLE_BY_CODE.get(node.code)) return node;
  const row=aliases.find(row=>row.kind==='latin'&&row.code===node.code&&row.verification==='verified');
  return row ? {...node,latinTitle:row.expression,latinVerification:'reviewed-memory'} : node;
}

function strongResult(result) {
  if(result?.symptomIntent?.ambiguous)return false;
  return Boolean(result?.rows?.some(node=>['code-exact','code-normalized','editorial-alias-exact','editorial-alias-prefix','title-sq-exact','title-sq-prefix','title-en-exact','title-en-prefix','title-la-exact','title-la-prefix','symptom-code','verified-query-alias','personal-query-alias'].includes(node.searchMatch?.type)));
}

async function submit({dataset,expression,code,kind='alias',scope='global',actor,source='user'},request=neonRequest) {
  const term=safeExpression(expression,dataset);
  if(!term || !UUID.test(actor) || !['alias','latin'].includes(kind) || !['global','personal'].includes(scope) || !validMapping(dataset,term,code,kind)) throw Object.assign(new Error('Përdor vetëm një shprehje mjekësore pa të dhëna pacienti dhe një kod ekzistues.'),{status:400});
  const {data}=await request('rpc/icd_submit_query_memory_v1',{method:'POST',body:{p_expression:term,p_code:clean(code).toUpperCase(),p_kind:kind,p_scope:scope,p_actor:actor,p_source:source},timeoutMs:3500});
  stats.submissions++;
  if(data?.duplicate)stats.duplicateSubmissions++;
  clearCache();return data;
}

function validateAi(payload,dataset,query) {
  if(!payload || !['symptom','diagnosis','ambiguous'].includes(payload.intent) || !Array.isArray(payload.candidates)) return {candidates:[],ambiguous:true,clarification:'Përshkruaj më saktë simptomën ose diagnozën.'};
  const candidates=[],seen=new Set();
  for(const item of payload.candidates.slice(0,5)) {
    const node=validMapping(dataset,query,item?.code);
    if(!node || seen.has(node.code) || (payload.intent==='symptom' && !/^R\d/.test(node.code) && Symptoms.intentPayload(query)?.symptom_code !== node.code))continue;
    seen.add(node.code);
    const latin=!node.latinTitle&&!FullIcd.LATIN_TITLE_BY_CODE.get(node.code)?safeExpression(item.latinProposal,dataset):'';
    candidates.push({node,latinProposal:latin,verified:false});
  }
  return {candidates,clarification:!candidates.length?'Shkruaj më qartë simptomën ose diagnozën që kërkon.':payload.intent==='ambiguous'||candidates.length!==1?'Zgjidh konceptin që përputhet me shprehjen; diagnoza nuk vendoset automatikisht.':'Kontrollo përputhjen përpara përdorimit.',ambiguous:payload.intent==='ambiguous'||candidates.length!==1};
}

module.exports={VERSION,TABLE,normalize,safeExpression,codeNode,validMapping,symptomQuery,readAliases,matchAliases,applyLatin,strongResult,submit,validateAi,clearCache,stats,UUID,_test:{vocabulary,publicRow,snapshots}};
