'use strict';
const fs=require('node:fs');
const crypto=require('node:crypto');
const XLSX=require('xlsx');
const {neonRequest}=require('../lib/medindex-data-api');
const {incomingRecord,planUpdate}=require('../lib/registry-price-update');
async function main(){
  const args=process.argv.slice(2),option=k=>args[args.indexOf(k)+1];
  if(!args.includes('--file'))throw new Error('Përdor --file lista.xlsx [--existing eksport.json] [--complete-approval-list] [--apply].');
  const bytes=fs.readFileSync(option('--file'));
  if(bytes.length>20*1024*1024)throw new Error('Dokumenti tejkalon 20 MB.');
  const book=XLSX.read(bytes,{type:'buffer'});
  const matrix=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1,defval:null,raw:true});
  const clean=v=>String(v??'').trim();
  const headerIndex=matrix.findIndex(r=>r.map(clean).includes('Emri tregtar')&&r.map(clean).includes('PDID'));
  if(headerIndex<0)throw new Error('Mungojnë titujt e regjistrit.');
  const columns=['Nr rendor','ProtocolNo','PDID','Emri tregtar','Substanca aktive','ATC Code','Fortësia','Forma farmaceutike','Madhësia e paketimit','Bartësi i Autorizim Marketingut','Prodhuesi','MA certifikata','Statusi','Çmimi me shumicë','Çmimi me marzhë','TVSH','Çmimi me pakicë','Afati i vlefshmërisë'];
  const headers=matrix[headerIndex].map(clean),indices=columns.map(k=>headers.indexOf(k));
  if(indices.some(i=>i<0))throw new Error('Mungojnë kolona: '+columns.filter((_,i)=>indices[i]<0).join(', '));
  const incoming=matrix.slice(headerIndex+1).filter(r=>typeof r[indices[0]]==='number'&&r[indices[3]]).map(r=>incomingRecord(indices.map(i=>r[i])));
  let existing=[];
  if(args.includes('--existing'))existing=JSON.parse(fs.readFileSync(option('--existing'),'utf8'));
  else for(let offset=0;;offset+=500){const {data}=await neonRequest(`drugs?select=*&order=id.asc&limit=500&offset=${offset}`);existing.push(...data);if(data.length<500)break;}
  const plan=planUpdate(existing,incoming,{completeApprovalList:args.includes('--complete-approval-list'),sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  const output=args.includes('--output')?option('--output'):'registry-update-preview.json';
  fs.writeFileSync(output,JSON.stringify(plan,null,2));
  fs.writeFileSync(output.replace(/\.json$/i,'')+'.new-products.json',JSON.stringify({sourceSha256:plan.sourceSha256,clinicalStatus:'needs_authoritative_source',products:plan.inserts.map(product=>({...product,needs:['use_text','drug_class','adult_dose','pediatric_dose','source_url'],publicationAllowed:false}))},null,2));
  console.log(JSON.stringify(plan.summary,null,2));
  if(!args.includes('--apply'))return;
  if(plan.issues.length)throw new Error('Kontrollo përputhjet e paqarta në parapamje. Asgjë nuk u aplikua.');
  const {data}=await neonRequest('rpc/apply_registry_price_update_v1',{method:'POST',body:{p_plan:plan}});
  console.log(JSON.stringify(data,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
