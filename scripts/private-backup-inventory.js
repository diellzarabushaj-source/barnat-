'use strict';
const policy=require('../data/backup-retention.json');
const keyPrefix='drx-key-recovery/ftuchtmolddhhsdcwnqe/';
function owned(blob,kind='any'){
 try{
  const url=new URL(blob.url),host=policy.storeId.slice(6).toLowerCase()+'.private.blob.vercel-storage.com';
  if(url.protocol!=='https:'||url.port||url.username||url.password||url.search||url.hash||url.hostname!==host||decodeURIComponent(url.pathname.slice(1))!==blob.pathname)return false;
  const backup=blob.pathname.startsWith(policy.prefix)&&/^[0-9]{8}T[0-9]{6}Z_[a-f0-9]{40}_[A-Za-z0-9_-]{1,64}\.(enc|verified\.json)$/.test(blob.pathname.slice(policy.prefix.length));
  const vault=blob.pathname.startsWith(keyPrefix)&&/^[A-Za-z0-9_-]{1,64}\.(enc|verified\.json)$/.test(blob.pathname.slice(keyPrefix.length));
  return kind==='backup'?backup:kind==='vault'?vault:backup||vault;
 }catch{return false;}
}
async function inventory(sdk,token,additionalBytes){
 if(!Number.isSafeInteger(additionalBytes)||additionalBytes<0)throw Error('Invalid private storage bound');
 const stored=[];let cursor;
 // Count every object in the dedicated store, including key recovery copies.
 for(let page=0;page<20;page++){
  const result=await sdk.list({limit:100,cursor,token});
  for(const item of result.blobs){if(!owned(item)||!Number.isSafeInteger(item.size)||item.size<0)throw Error('Unexpected private inventory');stored.push(item);}
  if(!result.hasMore)break;
  if(!result.cursor||result.cursor===cursor||page===19)throw Error('Incomplete private inventory');cursor=result.cursor;
 }
 if(stored.reduce((n,item)=>n+item.size+4096,additionalBytes+4096)>policy.maxStoredBytes)throw Error('Private backup capacity exceeded; existing copies were preserved');
 return stored;
}
module.exports={owned,inventory,keyPrefix};
