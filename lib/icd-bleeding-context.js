'use strict';

// Retrieval constraints, not diagnosis. References and scope are documented in
// docs/icd-bleeding-context-20261025.md. No patient data is stored here.
const word={
 blood:/^(?:gjak\p{L}*|blood\p{L}*|bleed\p{L}*|ha?emorrhag\p{L}*|hemorag\p{L}*)$/u,
 cough:/^(?:koll\p{L}*|cough\p{L}*|sputum|gelbaz\p{L}*|phlegm|expectora\p{L}*)$/u,
 spit:/^(?:p(?:er|e)?sht(?:ym|y)\p{L}*|saliv\p{L}*|spit\p{L}*)$/u,
 vomit:/^(?:vjell\p{L}*|vomit\p{L}*|emes[ei]\p{L}*)$/u,
 oral:/^(?:goj\p{L}*|mishra\p{L}*|dhemb\p{L}*|gingiv\p{L}*|gum\p{L}*|mouth|dental)$/u,
 stool:/^(?:fece\p{L}*|feces|feqe\p{L}*|jasht\p{L}*|stool\p{L}*|faece\p{L}*|poo|rekt\p{L}*|rect\p{L}*|anus|anal\p{L}*)$/u,
 respiratoryName:/^(?:ha?emopty\p{L}*|hemoptiz\p{L}*)$/u,
 vomitingName:/^(?:ha?ematemes\p{L}*|hematemez\p{L}*)$/u,
 melena:/^(?:melena|melaena|melene)$/u,
 red:/^(?:kuq\p{L}*|fresket|fresk|bright|red|fresh)$/u,
 black:/^(?:zez\p{L}*|zi|katran\p{L}*|black|tarry|tar)$/u,
 occult:/^(?:okult\p{L}*|occult|fob|fobt|fit)$/u,
};
const filler=new Set('kam ka kemi po me ne te e i nga del dalin nxjerr nxjerrje gjate pas para vetem pak shume nje disa dhe apo ose por eshte osht qe si femija femije i am have has with in up on the of my is or and'.split(' '));
function analyze(value){
 const text=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const segments=text.split(/[,.;!?]|\b(?:por|ndersa|but|however)\b/);
 const state={mentioned:false,cough:false,spit:false,vomit:false,oral:false,stool:false,red:false,black:false,occult:false};
 const negated=(tokens,index)=>tokens.slice(Math.max(0,index-3),index+1).some(t=>/^(?:pa|jo|nuk|ska|s|without|no|not|denies|denied|mohon|negative|negativ\p{L}*)$/u.test(t))||tokens.slice(index+1,index+3).some(t=>/^(?:negative|negativ\p{L}*|denied|absent|mungon)$/u.test(t));
 for(const segment of segments){
  const tokens=segment.match(/\p{L}+/gu)||[];
  const blood=tokens.map((t,i)=>word.blood.test(t)?i:-1).filter(i=>i>=0);
  for(let i=0;i<tokens.length;i++){
   for(const [name,target] of [['respiratoryName','cough'],['vomitingName','vomit'],['melena','black']])if(word[name].test(tokens[i])){state.mentioned=true;if(!negated(tokens,i)){state[target]=true;if(target==='black')state.stool=true;}}
   for(const type of ['cough','spit','vomit','oral','stool']){
    if(!word[type].test(tokens[i]))continue;
    const nearby=blood.filter(b=>Math.abs(b-i)<=5);
    if(nearby.length)state.mentioned=true;
    if(!negated(tokens,i)&&nearby.some(b=>!negated(tokens,b)))state[type]=true;
   }
  }
  if(state.stool){
   for(const type of ['red','black','occult'])if(tokens.some((t,i)=>word[type].test(t)&&!negated(tokens,i)))state[type]=true;
  }
 }
 const respiratory=state.cough||(state.spit&&!state.oral),ambiguous=state.spit&&!state.cough&&!state.oral;
 const candidates=[];
 if(respiratory)candidates.push({code:'R04.2',conditional:ambiguous,reason:ambiguous?'Mundësi nëse gjaku del me kollë ose gëlbazë; konfirmo burimin.':'Përshkrim i gjakut gjatë kollës ose në sputum; shkaku kërkon vlerësim.'});
 if(state.vomit)candidates.push({code:'K92.0',conditional:false,reason:'Përshkrim i gjakut në të vjella; shkaku kërkon vlerësim.'});
 if(state.stool){
  if(state.occult)candidates.push({code:'R19.5',conditional:false,reason:'Përshkrim i gjakut okult në feçe; verifiko rezultatin e testit.'});
  if(state.black&&!state.red)candidates.push({code:'K92.1',conditional:false,reason:'Për përshkrimin e melenës; konfirmo feçet e zeza si katran dhe burimin e gjakut.'});
  else if(state.red&&!state.black)candidates.push({code:'K62.5',conditional:false,reason:'Përshkrim i gjakut të freskët rektal; shkaku kërkon vlerësim.'});
  else if(!state.occult)candidates.push({code:'K62.5',conditional:true,reason:'Mundësi nëse bëhet fjalë për gjak të freskët nga anusi ose rektumi.'},{code:'K92.1',conditional:true,reason:'Mundësi nëse feçet janë të zeza si katran (melenë); nuk supozohet vetëm nga fjala gjak.'});
 }
 let clarification='';
 if(state.vomit&&respiratory)clarification='Gjaku del me kollë/gëlbazë, në të vjella, apo nga goja? Konfirmo secilin burim veçmas.';
 else if(ambiguous)clarification='Gjaku del me kollë/gëlbazë, apo vjen nga goja ose mishrat e dhëmbëve?';
 else if(state.stool&&!state.red&&!state.black&&!state.occult)clarification='Gjaku është i kuq i freskët, feçet janë të zeza si katran, apo është vetëm test pozitiv për gjak okult?';
 else if(state.oral&&!state.cough&&!state.vomit)clarification='A është gjakderdhje nga goja ose mishrat e dhëmbëve? A ka gjak edhe gjatë kollës ose në të vjella?';
 else if(state.cough&&state.vomit)clarification='A ka gjak si gjatë kollës ashtu edhe në të vjella? Konfirmo secilin burim veçmas.';
 else if(candidates.length)clarification='Konfirmo burimin e gjakut dhe shenjat shoqëruese përpara zgjedhjes së kodit.';
 else if(state.mentioned)clarification='Konfirmo nëse gjakderdhja është e pranishme apo është përjashtuar në përshkrim.';
 const tokens=text.match(/\p{L}+/gu)||[];
 const simple=candidates.length>0&&tokens.length<=12&&tokens.every(t=>filler.has(t)||Object.values(word).some(pattern=>pattern.test(t)));
 return {...state,respiratory,ambiguous,candidates,clarification,simple};
}
function permits(context,code,title=''){
 if(!context.mentioned)return true;
 if(code==='R04.2')return context.respiratory;
 if(code==='K92.0')return context.vomit;
 if(/^K/.test(code)&&/haemorrhag|hemorrhag|bleeding|haematemesis|melaena/i.test(title)&&!context.vomit&&!context.stool)return false;
 if(['K62.5','K92.1','R19.5'].includes(code))return context.candidates.some(row=>row.code===code);
 return true;
}
module.exports={analyze,permits};
