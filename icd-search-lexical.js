(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DRxIcdLexical=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Lexical retrieval only: spelling variants do not establish a diagnosis.
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d').replace(/[^a-z0-9*]+/g,' ').trim().replace(/\s+/g,' ');
  const stop=new Set('i e te ne me dhe nga per tek qe nje si se a o of the and or in on at to for with due et de ad'.split(' '));
  const tokens=value=>normalize(value).split(' ').filter(Boolean);
  const words=new Map(),fields=new Map(),pairs=new Map(),prepared=new WeakMap();
  function boundedSet(map,key,value){if(map.size>=12000)map.delete(map.keys().next().value);map.set(key,value);return value;}
  function fold(value){
    let word=normalize(value).replace(/\*/g,'');
    if(/^(?:acute|acuta|acutus|acutum|akut|akute|akuti)$/.test(word))return 'acute';
    if(/^(?:chronic|chronica|chronicus|chronicum|kronik|kronike|kroniki)$/.test(word))return 'kronik';
    word=word.replace(/ph/g,'f').replace(/th/g,'t').replace(/ch/g,'k').replace(/y/g,'i').replace(/([bcdfgklmnprst])\1/g,'$1');
    // Keep the disease ending: pharyngitis/faringit, not the organ word pharynx.
    if(word.length>=7)word=word.replace(/(?:itis|iti)$/,'it');
    return word;
  }
  const foldPhrase=value=>tokens(value).map(fold).join(' ');
  function stem(value){
    let word=normalize(value).replace(/\*/g,'');
    if(word.length<=4)return word;
    for(const ending of ['imeve','ave','eve','uar','ueshme','ueshem','shme','shem','imit','imi','it','ise','es','e','a','i','u','ve','tion','sion','ment','ing','ed','s']){
      if(word.length-ending.length>=4&&word.endsWith(ending)){word=word.slice(0,-ending.length);break;}
    }
    return word;
  }
  function distance(left,right,max){
    if(left===right)return 0;
    if(Math.abs(left.length-right.length)>max)return max+1;
    let previousPrevious=null,previous=Array.from({length:right.length+1},(_,i)=>i);
    for(let i=1;i<=left.length;i++){
      const current=[i];let minimum=i;
      for(let j=1;j<=right.length;j++){
        current[j]=Math.min(previous[j]+1,current[j-1]+1,previous[j-1]+Number(left[i-1]!==right[j-1]));
        if(previousPrevious&&i>1&&j>1&&left[i-1]===right[j-2]&&left[i-2]===right[j-1])current[j]=Math.min(current[j],previousPrevious[j-2]+1);
        minimum=Math.min(minimum,current[j]);
      }
      if(minimum>max)return max+1;
      previousPrevious=previous;previous=current;
    }
    return previous[right.length];
  }
  function tokenMatch(query,candidate,wildcard=false){
    const key=query+'\u0000'+candidate+'\u0000'+Number(wildcard);
    if(pairs.has(key))return pairs.get(key);
    return boundedSet(pairs,key,calculateTokenMatch(query,candidate,wildcard));
  }
  function calculateTokenMatch(query,candidate,wildcard=false){
    const qp=wordProfile(query),cp=wordProfile(candidate),q=qp.normal,c=cp.normal;
    if(!q||!c)return null;
    if(q===c)return {score:90,fuzzy:false};
    if(q.length>=3&&c.length<3)return null;
    const qf=qp.folded,cf=cp.folded;
    if(qf===cf)return {score:88,fuzzy:true};
    if(q.length>=3&&cf.startsWith(qf))return {score:wildcard?78:74,fuzzy:q!==qf||c!==cf};
    const qs=qp.stemmed,cs=cp.stemmed;
    if(qs===cs&&qs.length>=4)return {score:84,fuzzy:qf!==cf};
    if(qs.length>=4&&cs.length>=5&&qs.startsWith(cs)&&cs.length/qs.length>=.82)return {score:60,fuzzy:true};
    const longest=Math.max(qf.length,cf.length),shortest=Math.min(qf.length,cf.length);
    if(shortest<4)return null;
    const max=longest>=12?3:longest>=9?2:1;
    const direct=distance(qf,cf,max),stemmed=Math.min(qs.length,cs.length)>=4?distance(qs,cs,max):max+1;
    const d=Math.min(direct,stemmed),lengthDifference=stemmed<direct?Math.abs(qs.length-cs.length):Math.abs(qf.length-cf.length);
    if(d>max)return null;
    return {score:58-d*9-lengthDifference*2,fuzzy:true};
  }
  function meaningful(input){
    if(prepared.has(input))return prepared.get(input);
    const result=[...new Set(input.map(t=>/^[a-z0-9]+$/.test(t)?t:normalize(t).replace(/\*/g,'')))].filter(t=>t&&!stop.has(t));
    prepared.set(input,result);return result;
  }
  function wordProfile(value){
    const key=String(value||'');if(words.has(key))return words.get(key);
    const normal=normalize(key).replace(/\*/g,'');
    return boundedSet(words,key,{normal,folded:fold(normal),stemmed:fold(stem(normal))});
  }
  function scoreTokens(queryTokens,candidateTokens,wildcards=new Set()){
    const query=meaningful(queryTokens),candidate=meaningful(candidateTokens);
    if(!query.length||!candidate.length)return null;
    const used=new Set(),matches=[];let sum=0,fuzzy=false;
    for(const token of [...query].sort((a,b)=>b.length-a.length)){
      let best=null;
      for(let i=0;i<candidate.length;i++){
        if(used.has(i))continue;
        const m=tokenMatch(token,candidate[i],wildcards.has(token));
        if(m&&(!best||m.score>best.score))best={...m,index:i,token:candidate[i]};
      }
      if(!best)return null;
      used.add(best.index);sum+=best.score;fuzzy||=best.fuzzy;matches.push({query:token,token:best.token});
    }
    return {score:sum,fuzzy,matched:query.map(q=>matches.find(m=>m.query===q).token),coverage:1};
  }
  function prepareQuery(query){const normal=normalize(query);return {normal,folded:foldPhrase(normal),tokens:tokens(normal)};}
  function fieldProfile(value){
    const key=String(value||'');if(fields.has(key))return fields.get(key);
    const normal=normalize(key),positive=normal.split(/\b(?:without|pa|sine|sans)\b/)[0].trim();
    const trimTiming=v=>v.split(/not specified as|non specificat\w* ut|(?:i |e )?paspecifikuar si/)[0].trim();
    return boundedSet(fields,key,{normal,folded:foldPhrase(normal),all:tokens(normal),positive:tokens(positive),timing:tokens(trimTiming(normal)),positiveTiming:tokens(trimTiming(positive))});
  }
  function fieldScore(profile,value){
    const q=profile.normal,p=fieldProfile(value),v=p.normal;if(!q||!v)return 0;
    if(q===v)return 4500;
    if(v.startsWith(q))return 4200;
    const fq=profile.folded,fv=p.folded;
    if(fq===fv)return 4400;
    if(fv.startsWith(fq))return 4100;
    const negative=/\b(?:without|pa|sine|sans)\b/.test(q),timing=/\b(?:acu\w*|akut\w*|chron\w*|kron\w*)\b/.test(q)&&!/not specified|non specific|paspecifikuar/.test(q);
    const candidates=negative?(timing?p.timing:p.all):(timing?p.positiveTiming:p.positive);
    const m=scoreTokens(profile.tokens,candidates);
    return m?2400+Math.round(m.score/Math.max(1,profile.tokens.filter(t=>!stop.has(t)).length)*6):0;
  }
  function positiveField(query,value){
    const q=normalize(query),v=normalize(value);
    let positive=/\b(?:without|pa|sine|sans)\b/.test(q)?v:v.split(/\b(?:without|pa|sine|sans)\b/)[0].trim();
    if(/\b(?:acu\w*|akut\w*|chron\w*|kron\w*)\b/.test(q)&&!/not specified|non specific|paspecifikuar/.test(q))positive=positive.split(/not specified as|non specificat\w* ut|(?:i |e )?paspecifikuar si/)[0].trim();
    return positive;
  }
  const scoreFields=(query,values)=>{const profile=typeof query==='string'?prepareQuery(query):query;return Math.max(0,...values.map(value=>fieldScore(profile,value)));};
  const genericBonus=node=>/\bunspecified\b/i.test(node.englishTitle||'')&&!/maternal|gestational|pregnancy|neonatal|congenital|drug.induced|postoperative/i.test(node.englishTitle||'')?15:0;
  function scoreNode(query,node,values){const score=scoreFields(query,values);return score?score+genericBonus(node)*6:0;}
  function similarity(a,b){const m=tokenMatch(a,b);return m?m.score/90:0;}
  return {normalize,tokens,fold,foldPhrase,stem,tokenMatch,scoreTokens,prepareQuery,scoreFields,scoreNode,genericBonus,positiveField,similarity};
});
