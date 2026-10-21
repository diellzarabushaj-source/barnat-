'use strict';
// A separate correction layer: source documents and editorial statuses are immutable.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {sourceFingerprint}=require('../lib/prescription-clinical-plan');
const input=process.argv[2];
if(!input)throw Error('Supply the audited 117 published guides for chapters 11–15.');
const bytes=fs.readFileSync(input),source=JSON.parse(bytes);
const expected={11:13,12:18,13:24,14:38,15:24};
for(const [ch,n] of Object.entries(expected))if(source.filter(g=>g.chapterNumber===Number(ch)).length!==n)throw Error('Incomplete chapter '+ch);
if(source.length!==117||new Set(source.map(g=>g._id)).size!==117)throw Error('Expected 117 unique guides');
const byKey=new Map(source.map(g=>[g.chapterNumber+'.'+g.orderInChapter,g]));
const result={version:'clinical-11-15-20261021-v1',checkedAt:'2026-10-21',sourceSnapshotSha256:createHash('sha256').update(bytes).digest('hex'),guides:{}};
const drug=(genericName,dose,frequency,duration,route='Nga goja',sig='')=>({kind:'active-substance',title:genericName,genericName,dose,frequency,duration,route,sig});
const care=(title,sig)=>({kind:'supportive-care',title,sig});
const opt=(label,...items)=>({label,items});
const group=(label,options,condition='')=>({label,options,condition});
const one=(label,item,condition='')=>group(label,[opt('',item)],condition);
const long='Afatgjatë; rivlerësim sipas përgjigjes';
const short='Sa më shkurt; rivlerëso nevojën';
function save(key,groups,notes,refs,explanation,extra={}){
 const g=byKey.get(key);if(!g||result.guides[g._id])throw Error('Missing/duplicate '+key);
 result.guides[g._id]={key,sourceFingerprint:sourceFingerprint(g),status:'ready',groups,notes,
  changes:[{id:'C'+key,title:'Sqarimi i skemës',explanation}],references:[...new Set(refs)].map(url=>({key:url,url})),reviewState:'evidence-reconciled',...extra};
}
const reference=(key,notes,refs,explanation)=>save(key,[],notes,refs,explanation,{status:'reference'});
const paracetamol=()=>drug('Paracetamol','500–1000 mg','Çdo 6–8 orë sipas nevojës',short,'Nga goja','Vetëm i rritur ≥50 kg pa faktorë rreziku: maksimumi 4 g/24 orë. Ul kufirin në peshë të ulët, sëmundje hepatike ose faktorë të tjerë rreziku; përfshi të gjitha produktet që përmbajnë paracetamol.');
const api={save,reference,drug,care,opt,group,one,long,short,paracetamol};
require('./prescription-clinical-revisions-11-15-renal-heme')(api);
require('./prescription-clinical-revisions-11-15-rheum')(api);
require('./prescription-clinical-revisions-11-15-neuro')(api);
require('./prescription-clinical-revisions-11-15-psych')(api);
for(const g of source)if(!result.guides[g._id])throw Error('Unaudited guide '+g.chapterNumber+'.'+g.orderInChapter);
const titles={
 '11.1':'Cistit i lokalizuar · grua e rritur jo shtatzënë',
 '11.3':'Pielonefrit · trajtim oral i pacientit të qëndrueshëm',
 '11.6':'BPH / LUTS · Tamsulosin me çlirim të zgjatur',
 '11.7':'BPH me prostatë të zmadhuar · një regjim',
 '12.1':'Anemi nga mungesa e hekurit · hekur oral',
 '12.4':'Deficit folati · pas vlerësimit të vitaminës B12',
 '13.3':'Osteoporozë postmenopauzale · Ibandronate mujore',
 '13.11':'Artrit reumatoid · Methotrexate javore dhe folat',
 '13.13':'Gout · trajtimi i sulmit akut',
 '14.1':'Migrenë · trajtimi i sulmit akut',
 '14.3':'Migrenë · profilaksi e zgjedhur',
 '14.7':'Cluster headache · trajtimi akut',
 '14.18':'Bell’s palsy · steroid i hershëm dhe mbrojtja e syrit',
 '14.25':'Alzheimer i lehtë–moderuar · fillimi i Donepezil',
 '14.26':'Alzheimer i moderuar–rëndë · Memantine',
 '14.29':'Guillain–Barré · trajtim spitalor i përzgjedhur',
 '14.30':'Relaps i MS · një kurs steroidi',
 '15.4':'Sulm paniku · vlerësimi dhe qetësimi',
 '15.9':'Depresion unipolar · një SSRI',
 '15.10':'Depresion unipolar · alternativa të strukturuara',
 '15.23':'Çrregullim neurologjik funksional · plan kujdesi',
};
for(const r of Object.values(result.guides)){
 if(titles[r.key])r.title=titles[r.key];
 if(!r.references.length||r.references.some(x=>!/^https:\/\//.test(x.url)))throw Error('Missing primary reference '+r.key);
 if(r.status==='ready'&&!r.groups.length)throw Error('Empty structured plan '+r.key);
 r.groups.forEach((g,gi)=>{g.id='g'+(gi+1);if(!g.options.length)throw Error('Empty group');g.options.forEach((o,oi)=>{o.id='o'+(oi+1);if(!o.items.length)throw Error('Empty option');o.items.forEach((i,ii)=>{i.id='i'+(ii+1);if(i.kind==='active-substance')for(const f of ['genericName','dose','frequency','duration','route'])if(!i[f])throw Error(r.key+' missing '+f);});});});
}
result.coverage=source.map(g=>({key:g.chapterNumber+'.'+g.orderInChapter,id:g._id,sourceFingerprint:sourceFingerprint(g),disposition:result.guides[g._id].status,sourceRevision:g._rev}));
fs.writeFileSync(path.resolve(__dirname,'../data/recetat-clinical-revisions-11-15.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({reviewed:source.length,...Object.values(result.guides).reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{})}));
