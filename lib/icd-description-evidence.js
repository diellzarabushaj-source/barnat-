'use strict';

// General retrieval checks. These constrain a proposed search result; they do not
// establish a diagnosis or measure clinical confidence.
const {concepts}=require('../data/icd-symptom-intents-v1.json');
const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const terms=value=>norm(value).split(' ').filter(Boolean);
const stop=new Set('other unspecified specified certain disorder disorders disease diseases symptom symptoms pain dhimbje dhembje gjate eshte jane pjesa regjionin regionin region with without and the due from for not te ne me nje ka kam dhe acute chronic akut kronike bacterial viral allergic traumatic upper lower left right gastric abdominal ear eye throat chest cervical lumbar dorsal renal kidney urinary skin muscle joint history primary secondary colic kolika colica infection infections infeksion infeksioni inflammation inflamacion inflamacioni unspecified specified'.split(' '));
const patterns={
 eye:/\b(?:sy|syri|syrit|syte|syrin|eye\w*|ocular|ophthalm\w*|visual)\b/,
 ear:/\b(?:vesh(?:i|it|in|et)?|ear\w*|otalg\w*|otitis|otit\w*)\b/,
 throat:/\b(?:fyt\w*|throat|pharyng\w*|tonsil\w*)\b/,
 neck:/\b(?:qaf\w*|neck|cervical\w*)\b/,
 head:/\b(?:kok\w*|headache|head|cephal\w*|cerebr\w*|migraine|migrene)\b/,
 chest:/\b(?:gjoks\w*|krahar\w*|kraher\w*|chest|thorac\w*|heart|zemr\w*|cardi\w*|cough|koll\w*|pneumon\w*|bronch\w*|pulmon\w*|respirat\w*|dyspn\w*)\b/,
 abdomen:/\b(?:bark\w*|abdom\w*|retroperitone\w*|stomach|gastr\w*|intestin\w*|diarrh\w*|diarre|vjell\w*|vomit\w*)\b/,
 back:/\b(?:shpin\w*|mesi|mesit|back|lumbar\w*|dorsalg\w*|dorsal\w*)\b/,
 urinary:/\b(?:urin\w*|veshk\w*|fshikez\w*|kidney|renal|ureter\w*|dysuri\w*|dizuri\w*)\b/,
 skin:/\b(?:lekur\w*|rash|skuqj\w*|pucr\w*|puqr\w*|itch\w*|kruar\w*|kruajt\w*|prurit\w*|dermat\w*)\b/,
 joint:/\b(?:nyj\w*|artikul\w*|joint\w*|arthr\w*)\b/,
 muscle:/\b(?:muskuj\w*|muskul\w*|muscl\w*|myalg\w*|mialg\w*)\b/,
};
const compatible=(a,b)=>a===b||[['head','neck'],['abdomen','urinary'],['back','urinary'],['joint','muscle']].some(pair=>pair.includes(a)&&pair.includes(b));
const pain=/\b(?:dhimb\w*|dhemb\w*|pain|dolor\w*|therje)\b/;
const symptomTitle=/\b(?:pain|headache|cough|fever|dyspnoea|dysuria|otalgia|pruritus|constipation|vomiting|nausea|dorsalgia|cervicalgia|sciatica|arthralgia|myalgia|oedema|edema|palpitations|malaise|fatigue|heartburn|haematemesis|melaena)\b/i;
const aliases=concepts.flatMap(concept=>[...new Set([concept.label_sq,...concept.aliases].map(norm))].map(alias=>({alias,id:concept.id,code:concept.id==='sore-throat'?'R07.0':concept.symptom_code}))).filter(x=>x.alias.length>=3&&!['fyt i kuq','odynophagia'].includes(x.alias));
const lexicalNegatives=new Set(aliases.filter(x=>/\b(?:nuk|not|cannot)\b/.test(x.alias)).map(x=>x.alias));
const boundary=/[,;.!?]|\b(?:por|ndersa|tani|tash|but|however|now)\b/;
function occurrences(text,phrase){
 const input=' '+text+' ',target=' '+phrase+' ',result=[];let from=0,index;
 while((index=input.indexOf(target,from))>=0){result.push({start:index,end:index+phrase.length});from=index+target.length-1;}
 return result;
}
function statusAt(text,match,excerpt){
 const before=text.slice(0,match.start).split(boundary).at(-1)||'';
 const after=text.slice(match.end).split(boundary)[0]||'';
 const prefix=terms(before).join(' '),e=norm(excerpt),suffix=terms(after).slice(0,3).join(' ');
 const family=/\b(?:nena|babai|motra|vellai|gjysh\w*|family|mother|father|sister|brother)\b/.test(prefix);
 const history=/\b(?:ka pasur|kishte|me pare|e kaluar|i kaluar|te kaluar|previous|previously|past|resolved|history of)\b/.test(prefix);
 const negation=value=>/\b(?:pa|nuk|ska|s ka|jo|without|no|not|denies|denied|negative|negativ\w*|mohon)\b/.test(value.replace(/\b(?:jo vetem|not only)\b/g,''));
 const negative=negation(prefix)||(!lexicalNegatives.has(e)&&negation(e))||/^(?:(?:is|was|are|eshte|jane) )?(?:mungon|mungojne|absent|negative|negativ\w*|denied|normal\w*|brenda normales)\b/.test(suffix)||/\bnormal\w*\s*$/.test(prefix);
 return {family,history,negative};
}
function analyze(description){
 const raw=String(description||''),text=norm(raw),signals=[];
 // Keep punctuation for scope while retaining offsets into a normalized word stream.
 const scoped=raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9,;.!?]+/g,' ').replace(/([,;.!?])/g,' $1 ').replace(/\s+/g,' ').trim();
 for(const entry of aliases)for(const match of occurrences(scoped,entry.alias))signals.push({...entry,...statusAt(scoped,match,entry.alias)});
 const positive=[...new Map(signals.filter(s=>!s.negative&&!s.family&&!s.history).map(s=>[s.id,s])).values()];
 const currentText=scoped.split(boundary).map(segment=>{
  let content=segment;const saved=[];
  for(const phrase of lexicalNegatives)if(content.includes(phrase)){const token='intrinsic'+saved.length;saved.push([token,phrase]);content=content.replace(phrase,token);}
  content=content.replace(/\b(?:jo vetem|not only)\b/g,'');
  if(/\b(?:mungon|mungojne|absent|negative|negativ\w*|denied)\s*$/.test(content))return '';
  const excluded=content.search(/\b(?:pa|nuk|ska|s ka|jo|without|no|not|denies|mohon|nena|babai|motra|vellai|gjysh\w*|family|mother|father|sister|brother|ka pasur|kishte|me pare|e kaluar|i kaluar|te kaluar|previous|previously|past|resolved|history of)\b/);
  if(excluded>=0)content=content.slice(0,excluded);
  for(const [token,phrase] of saved)content=content.replace(token,phrase);
  return content;
 }).join(' ');
 const simple=positive.length===1&&aliases.some(a=>a.id===positive[0].id&&a.alias===text);
 return {raw,text,scoped,signals,positive,currentText,simple};
}
function isSymptom(node){return /^R\d/.test(node.code)||symptomTitle.test(node.englishTitle);}
const codeRelated=(a,b)=>a===b||a.startsWith(b+'.')||b.startsWith(a+'.');
function literalMatches(context,node){
 const vocabulary=[node.englishTitle,node.albanianDraft,node.latinTitle,...(node.terminologyAliases||[])].flatMap(terms).filter(t=>t.length>=5&&!stop.has(t));
 const result=[];
 for(const word of new Set(terms(context.scoped))){
  if(word.length<5||stop.has(word)||!vocabulary.some(t=>t===word||(t.length>=6&&word.length>=6&&t.slice(0,6)===word.slice(0,6))))continue;
  for(const match of occurrences(context.scoped,word))result.push({word,...statusAt(context.scoped,match,word)});
 }
 return result;
}
function check(context,item,node){
 const evidence=String(item.evidence||'').trim(),e=norm(evidence);
 if(!e||e.length>160||terms(e).length>16)return {ok:false,why:'missing-evidence'};
 const matches=occurrences(context.scoped,e);
 if(!matches.length)return {ok:false,why:'invented-evidence'};
 if(!terms(e).some(t=>t.length>=4&&!stop.has(t)))return {ok:false,why:'empty-evidence'};
 const statuses=matches.map(match=>statusAt(context.scoped,match,e));
 const historyCode=/history of/i.test(node.englishTitle),familyCode=/family history/i.test(node.englishTitle);
 if(statuses.every(s=>s.negative))return {ok:false,why:'negated-evidence'};
 if(!statuses.some(s=>!s.negative&&(!s.family||familyCode)&&(!s.history||historyCode)))return {ok:false,why:'noncurrent-evidence'};
 const literal=literalMatches(context,node);
 if(literal.length&&literal.every(m=>m.negative||m.family||m.history)&&!historyCode&&!familyCode)return {ok:false,why:'denied-concept'};
 const denied=context.signals.filter(s=>s.negative||s.family||s.history);
 if(denied.some(s=>isSymptom(node)&&codeRelated(node.code,s.code))&&!context.positive.some(s=>codeRelated(node.code,s.code)))return {ok:false,why:'denied-symptom'};
 const title=norm(node.englishTitle),current=norm(context.currentText);
 const querySites=Object.keys(patterns).filter(key=>patterns[key].test(e)),candidateSites=Object.keys(patterns).filter(key=>patterns[key].test(title));
 if(querySites.length&&candidateSites.length&&!querySites.some(a=>candidateSites.some(b=>compatible(a,b))))return {ok:false,why:'anatomy-conflict'};
 for(const [token,query] of [['left',/\b(?:left|majt\w*)\b/],['right',/\b(?:right|djatht\w*)\b/]])if(new RegExp('\\b'+token+'\\b').test(title)&&!query.test(current))return {ok:false,why:'unsupported-side'};
 if(/\bacute\b/.test(title)&&/\b(?:chronic|kronik\w*)\b/.test(current)&&!/\b(?:acute|akut\w*)\b/.test(current))return {ok:false,why:'time-conflict'};
 if(/\bchronic\b/.test(title)&&/\b(?:acute|akut\w*)\b/.test(current)&&!/\b(?:chronic|kronik\w*)\b/.test(current))return {ok:false,why:'time-conflict'};
 for(const [qualifier,query] of [['bacterial',/\b(?:bakter\w*|bacter\w*)\b/],['viral',/\b(?:viral\w*|virus\w*)\b/],['allergic',/\b(?:alerg\w*|allerg\w*)\b/],['traumatic',/\b(?:traum\w*|lendim\w*|injur\w*)\b/]])if(title.includes(qualifier)&&!query.test(current))return {ok:false,why:'unsupported-subtype'};
 const type=title.match(/\btype ([12])\b/);if(type&&!new RegExp('\\b(?:type|tip|tipi|tipit) '+type[1]+'\\b').test(current))return {ok:false,why:'unsupported-type'};
 const complication=title.match(/\bwith(?:out)? (.+)/)?.[1]||'';
 if(/complication|coma|ketoacidosis/.test(complication)){
  const qualifiers=[['coma',/\b(?:coma|koma|kome)\b/],['ketoacidosis',/\b(?:ketoacid\w*|ketoacidoz\w*)\b/],['renal',patterns.urinary],['ophthalmic',patterns.eye],['neurological',/\b(?:neurolog\w*|neuro\w*)\b/],['peripheral circulatory',/\b(?:perifer\w*|peripher\w*|qarkull\w*|circulator\w*)\b/]];
  if(qualifiers.some(([word,query])=>complication.includes(word)&&!query.test(current)))return {ok:false,why:'unsupported-complication'};
  if(/complication/.test(complication)&&!/\b(?:komplik\w*|complic\w*)\b/.test(current))return {ok:false,why:'unspecified-complication-status'};
  if(/\bwithout\b/.test(title)&&!/\b(?:pa|without|no) komplik\w*\b|\b(?:without|no) complic\w*\b/.test(context.text))return {ok:false,why:'unconfirmed-absence'};
 }
 const named=literal.some(m=>!m.negative&&(!m.family||familyCode)&&(!m.history||historyCode)&&terms(e).includes(m.word));
 const quoted=analyze(e);
 const symptom=isSymptom(node),matchedSymptom=quoted.positive.some(s=>codeRelated(node.code,s.code));
 const painEvidence=pain.test(e)&&(/\bpain\b/.test(title)||/algia\b/.test(title));
 if(named&&candidateSites.length&&!querySites.length&&!historyCode&&!familyCode)return {ok:false,why:'unsupported-site'};
 if(symptom&&!named&&!matchedSymptom&&!painEvidence)return {ok:false,why:'unsupported-symptom'};
 if(painEvidence&&candidateSites.length&&!querySites.some(a=>candidateSites.some(b=>compatible(a,b)))&&!matchedSymptom)return {ok:false,why:'unspecified-pain-site'};
 // Multiple symptoms are still not a diagnosis. An unnamed differential must
 // also have an existing curated search relation; it always remains conditional.
 if(!symptom&&!named){
  const related=quoted.positive.filter(s=>concepts.find(c=>c.id===s.id)?.candidates.some(c=>codeRelated(c.code,node.code)));
  if(quoted.positive.length<2||!related.length)return {ok:false,why:'unsupported-cause'};
  if(candidateSites.length&&!Object.keys(patterns).some(key=>patterns[key].test(current)&&candidateSites.some(other=>compatible(key,other))))return {ok:false,why:'unsupported-site'};
 }
 return {ok:true,evidence,symptom,reason:symptom?`Nga përshkrimi: «${evidence}». Konfirmo përputhjen e kodit.`:`Mundësi për shqyrtim nga «${evidence}»; përshkrimi nuk e konfirmon diagnozën.`};
}
module.exports={analyze,check,isSymptom,norm};
