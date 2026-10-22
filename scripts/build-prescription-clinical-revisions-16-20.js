'use strict';
// Clinical overlays only. Canonical source paragraphs and editorial status stay intact.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {sourceFingerprint}=require('../lib/prescription-clinical-plan');
const input=process.argv[2];if(!input)throw Error('Supply the current, audited chapters 15–20 snapshot.');
const bytes=fs.readFileSync(input),all=JSON.parse(bytes),source=all.filter(g=>g.chapterNumber>=16&&g.chapterNumber<=20);
for(const [ch,count]of Object.entries({15:24,16:44,17:14,18:15,19:26,20:17}))if(all.filter(g=>g.chapterNumber===+ch).length!==count)throw Error('Incomplete chapter '+ch);
if(all.length!==140||new Set(all.map(g=>g._id)).size!==140)throw Error('Expected 140 unique source guides.');
const byKey=new Map(source.map(g=>[g.chapterNumber+'.'+g.orderInChapter,g]));
const result={version:'clinical-16-20-20261022-v1',checkedAt:'2026-10-22',sourceSnapshotSha256:createHash('sha256').update(bytes).digest('hex'),guides:{}};
const drug=(genericName,dose,frequency,duration,route='Nga goja',sig='',extra={})=>({kind:'active-substance',title:genericName,genericName,dose,frequency,duration,route,sig,...extra});
const care=(title,sig)=>({kind:'supportive-care',title,sig});
const opt=(label,...items)=>({label,items});
const group=(label,options,condition='')=>({label,options,condition});
const one=(label,item,condition='')=>group(label,[opt('',item)],condition);
function save(key,title,groups,notes,refs,explanation,extra={}){
 const g=byKey.get(key);if(!g||g.reviewStatus!=='verified'||result.guides[g._id])throw Error('Missing/pending/duplicate '+key);
 result.guides[g._id]={key,title,sourceFingerprint:sourceFingerprint(g),status:'ready',groups,notes,references:[...new Set(refs)].map(url=>({key:url,url})),changes:[{id:'C'+key,title:'Sqarimi i skemës',explanation}],reviewState:'evidence-reconciled',...extra};
}
const reference=(key,title,notes,refs,explanation)=>save(key,title,[],notes,refs,explanation,{status:'reference'});
const adult='Skemë për të rriturin pas vlerësimit të diagnozës, alergjive, shtatzënisë, funksionit renal/hepatik dhe barnave ekzistuese.';
const pain=()=>drug('Paracetamol','500–1000 mg','Çdo 6–8 orë sipas nevojës','Sa më shkurt; rivlerëso','Nga goja','Për të rriturin ≥50 kg pa faktorë rreziku: maksimumi 4 g/24 orë nga të gjitha preparatet. Kufiri ulet në peshë të ulët, sëmundje hepatike ose faktorë të tjerë rreziku.');
const api={save,reference,drug,care,opt,group,one,adult,pain};
require('./prescription-clinical-revisions-16-20-derm')(api);
require('./prescription-clinical-revisions-16-20-surgery-eye')(api);
require('./prescription-clinical-revisions-16-20-ent-spine')(api);
for(const g of source){
 const p=result.guides[g._id];if(g.reviewStatus==='verified'&&!p)throw Error('Unaudited source '+g.chapterNumber+'.'+g.orderInChapter);
 if(g.reviewStatus!=='verified'&&p)throw Error('Pending source activated');
}
for(const p of Object.values(result.guides)){
 if(!p.notes.length||!p.references.length||p.references.some(r=>!/^https:\/\//.test(r.url)||/docs\.google\.com/.test(r.url)))throw Error('Missing/public reference '+p.key);
 if(p.status==='ready'&&!p.groups.length)throw Error('Empty ready plan '+p.key);
 p.groups.forEach((g,gi)=>{g.id='g'+(gi+1);if(!g.options.length)throw Error('Empty group');g.options.forEach((o,oi)=>{o.id='o'+(oi+1);if(!o.items.length)throw Error('Empty option');o.items.forEach((i,ii)=>{i.id='i'+(ii+1);if(i.kind==='active-substance')for(const f of ['genericName','dose','frequency','duration','route'])if(!i[f])throw Error(p.key+' missing '+f);});});});
}
result.coverage=source.map(g=>({key:g.chapterNumber+'.'+g.orderInChapter,id:g._id,sourceRevision:g._rev,sourceFingerprint:sourceFingerprint(g),disposition:result.guides[g._id]?.status||'pending-editorial'}));
fs.writeFileSync(path.resolve(__dirname,'../data/recetat-clinical-revisions-16-20.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({covered:result.coverage.length,ready:Object.values(result.guides).filter(p=>p.status==='ready').length,reference:Object.values(result.guides).filter(p=>p.status==='reference').length,pending:result.coverage.filter(p=>p.disposition==='pending-editorial').length,sourceEdits:0}));
