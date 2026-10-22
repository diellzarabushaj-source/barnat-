'use strict';
// Clinical interpretation is separate from the unchanged canonical source.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {sourceFingerprint}=require('../lib/prescription-clinical-plan');
const input=process.argv[2];if(!input)throw Error('Supply the freshly checked chapters 21–22 snapshot.');
const bytes=fs.readFileSync(input),source=JSON.parse(bytes);
if(source.length!==131||source.filter(g=>g.chapterNumber===21).length!==40||source.filter(g=>g.chapterNumber===22).length!==91||new Set(source.map(g=>g._id)).size!==131)throw Error('Incomplete source snapshot');
const byKey=new Map(source.map(g=>[g.chapterNumber+'.'+g.orderInChapter,g]));
const result={version:'clinical-21-22-20261022-v1',checkedAt:'2026-10-22',sourceSnapshotSha256:createHash('sha256').update(bytes).digest('hex'),guides:{}};
const drug=(genericName,dose,frequency,duration,route='Nga goja',sig='')=>({kind:'active-substance',title:genericName,genericName,dose,frequency,duration,route,sig});
const care=(title,sig)=>({kind:'supportive-care',title,sig});
const opt=(label,...items)=>({label,items});
const group=(label,options,condition='')=>({label,options,condition});
const one=(label,item,condition='')=>group(label,[opt('',item)],condition);
function save(key,title,groups,notes,refs,explanation,extra={}){
 const g=byKey.get(key);if(!g||g.reviewStatus!=='verified'||result.guides[g._id])throw Error('Missing/pending/duplicate '+key);
 result.guides[g._id]={key,title,sourceFingerprint:sourceFingerprint(g),status:'ready',groups,notes,references:[...new Set(refs)].map(url=>({key:url,url})),changes:[{id:'C'+key,title:'Kontrolli klinik',explanation}],reviewState:'evidence-reconciled',...extra};
}
const reference=(key,title,notes,refs,explanation)=>save(key,title,[],notes,refs,explanation,{status:'reference'});
const api={save,reference,drug,care,opt,group,one};
require('./prescription-clinical-revisions-21-obstetrics')(api);
require('./prescription-clinical-revisions-22-neonatal-respiratory')(api);
require('./prescription-clinical-revisions-22-infection-nutrition')(api);
require('./prescription-clinical-revisions-22-neuro-other')(api);
for(const g of source)if(!result.guides[g._id])throw Error('Unaudited source '+g.chapterNumber+'.'+g.orderInChapter);
for(const p of Object.values(result.guides)){
 if(!p.title||!p.notes.length||!p.references.length||p.references.some(r=>!/^https:\/\//.test(r.url)||/docs\.google\.com/.test(r.url)))throw Error('Incomplete plan '+p.key);
 if(p.status==='ready'&&!p.groups.length)throw Error('Empty ready plan '+p.key);
 p.groups.forEach((g,gi)=>{g.id='g'+(gi+1);if(!g.options.length)throw Error('Empty group');g.options.forEach((o,oi)=>{o.id='o'+(oi+1);if(!o.items.length)throw Error('Empty option');o.items.forEach((i,ii)=>{i.id='i'+(ii+1);if(i.kind==='active-substance')for(const f of ['genericName','dose','frequency','duration','route'])if(!i[f])throw Error(p.key+' missing '+f);});});});
}
result.coverage=source.map(g=>({key:g.chapterNumber+'.'+g.orderInChapter,id:g._id,sourceRevision:g._rev,sourceFingerprint:sourceFingerprint(g),disposition:result.guides[g._id].status}));
fs.writeFileSync(path.resolve(__dirname,'../data/recetat-clinical-revisions-21-22.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({covered:131,structured:Object.values(result.guides).filter(g=>g.status==='ready').length,individual:Object.values(result.guides).filter(g=>g.status==='reference').length,sourceEdits:0}));
