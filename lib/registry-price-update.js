'use strict';
const crypto = require('node:crypto');
const clean = v => String(v ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const norm = v => clean(v).toLowerCase();
const numericId = v => /^\d+$/.test(clean(v)) ? clean(v) : '';
const identity = r => [r.trade_name,r.strength,r.pharmaceutical_form,r.manufacturer,r.packaging].map(norm).join('|');
// The authorization certificate plus exact pack disambiguates corrected strength/form text.
const certificateIdentity = r => /^U?R?MA-/.test(clean(r.ma_certificate)) ? [r.ma_certificate,norm(r.trade_name).replace(/[®™\s]/g,''),r.packaging,r.manufacturer].map(norm).join('|') : '';
const group = (rows,key) => { const map=new Map(); for(const r of rows){const k=key(r);if(k)map.set(k,[...(map.get(k)||[]),r]);} return map; };
function incomingRecord(v) {
  return { source_row:Number(v[0]), protocol_no:clean(v[1]),pdid:clean(v[2])||null,trade_name:clean(v[3]),active_substance:clean(v[4]),atc_code:clean(v[5]),strength:clean(v[6]),pharmaceutical_form:clean(v[7]),packaging:clean(v[8]),marketing_authorization_holder:clean(v[9]),manufacturer:clean(v[10]),ma_certificate:clean(v[11]),product_status:clean(v[12]),wholesale_price:v[13],wholesale_with_margin:v[14],vat_text:clean(v[15]),retail_price:v[16],validity_text:clean(v[17]) };
}
function planUpdate(existing,incoming,{completeApprovalList=false,sourceSha256}={}) {
  if(!existing.length||!incoming.length)throw new Error('Lista nuk mund të jetë bosh.');
  if(!/^[a-f0-9]{64}$/.test(sourceSha256||''))throw new Error('Mungon SHA-256 i dokumentit.');
  const existingCount=existing.length;
  const nextRegistryNumber=Math.max(...existing.map(r=>Number(r.registry_number)||0))+1;
  const ignoredIds=existing.filter(r=>r.editorial_status==='archived').map(r=>r.id);
  existing=existing.filter(r=>r.editorial_status!=='archived');
  const oldPdid=group(existing,r=>numericId(r.pdid)),newPdid=group(incoming,r=>numericId(r.pdid));
  const oldIdentity=group(existing,identity),newIdentity=group(incoming,identity);
  const certificates=group(existing,certificateIdentity),protocols=group(existing,r=>/^PD\d+\//.test(clean(r.pdid)) ? clean(r.pdid) : clean(r.protocol_no));
  const used=new Set(),updates=[],inserts=[],issues=[],duplicates=[];
  let nextNumber=nextRegistryNumber;
  for(const row of incoming){
    if(!row.trade_name||!row.strength||!row.pharmaceutical_form){issues.push({row,reason:'Identitet i paplotë'});continue;}
    if(['retail_price','wholesale_price','wholesale_with_margin'].some(k=>typeof row[k]!=='number'||!Number.isFinite(row[k])||row[k]<0)){issues.push({row,reason:'Çmim i pavlefshëm'});continue;}
    const pdid=numericId(row.pdid),idKey=identity(row);
    let match;
    if(pdid&&oldPdid.get(pdid)?.length===1&&newPdid.get(pdid)?.length===1){
      match=oldPdid.get(pdid)[0];
      // A reused identifier must never move a price to a different formulation.
      const certificateMatch=clean(row.ma_certificate)&&norm(match.ma_certificate)===norm(row.ma_certificate)&&norm(match.active_substance)===norm(row.active_substance)&&norm(match.strength)===norm(row.strength)&&norm(match.manufacturer)===norm(row.manufacturer);
      if(norm(match.trade_name).replace(/[®™\s]/g,'')!==norm(row.trade_name).replace(/[®™\s]/g,'')&&!certificateMatch){
        issues.push({row,existingId:match.id,reason:'PDID përputhet, por emri ndryshon'});continue;
      }
    }else if(!pdid&&oldIdentity.get(idKey)?.length===1&&newIdentity.get(idKey)?.length>1){
      const peers=newIdentity.get(idKey).filter(r=>numericId(r.pdid)&&numericId(r.pdid)===numericId(oldIdentity.get(idKey)[0].pdid));
      if(peers.length===1&&['retail_price','wholesale_price','wholesale_with_margin','ma_certificate'].every(k=>peers[0][k]===row[k])){duplicates.push({source_row:row.source_row,duplicate_of:peers[0].source_row});continue;}
      issues.push({row,reason:'Përputhje e paqartë'});continue;
    }else if(oldIdentity.get(idKey)?.length===1&&newIdentity.get(idKey)?.length===1)match=oldIdentity.get(idKey)[0];
    else if(certificateIdentity(row)&&certificates.get(certificateIdentity(row))?.length===1)match=certificates.get(certificateIdentity(row))[0];
    else if(/^PD\d+\//.test(row.protocol_no)&&protocols.get(row.protocol_no)?.length===1&&norm(protocols.get(row.protocol_no)[0].trade_name)===norm(row.trade_name))match=protocols.get(row.protocol_no)[0];
    else if(oldIdentity.has(idKey)||newIdentity.get(idKey)?.length>1){issues.push({row,reason:'Përputhje e paqartë'});continue;}
    if(match){
      if(used.has(match.id)){issues.push({row,reason:'Dy rreshta për të njëjtin bar'});continue;}
      used.add(match.id);
      updates.push({id:match.id,expected:{pdid:match.pdid,registry_number:match.registry_number,retail_price:match.retail_price,wholesale_price:match.wholesale_price,wholesale_with_margin:match.wholesale_with_margin},prices:{retail_price:row.retail_price,wholesale_price:row.wholesale_price,wholesale_with_margin:row.wholesale_with_margin},status:'Ka qenë'});
    }else{
      inserts.push({...row,id:crypto.randomUUID(),registry_number:nextNumber++,update_status:'E re',editorial_status:'in_review',is_published:false});
    }
  }
  // An unresolved input may refer to an old product. Do not infer absence until resolved.
  const missing=completeApprovalList&&!issues.length?existing.filter(r=>!used.has(r.id)).map(r=>({id:r.id,pdid:r.pdid,registry_number:r.registry_number})):[];
  const changed=updates.filter(u=>Object.keys(u.prices).some(k=>Number(u.expected[k])!==u.prices[k])).length;
  return {schemaVersion:1,sourceSha256,completeApprovalList,existingCount,ignoredIds,incomingCount:incoming.length,updates,inserts,missing,issues,duplicates,summary:{matched:updates.length,priceChanged:changed,new:inserts.length,missing:missing.length,unresolved:issues.length,duplicates:duplicates.length,absenceDeferred:completeApprovalList&&issues.length>0}};
}
module.exports={incomingRecord,planUpdate,identity};
