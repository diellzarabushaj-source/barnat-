'use strict';
// Uses the existing server-only Data API transport; prints no keys or user data.
const {neonRequest,dataOf}=require('../lib/medindex-data-api.js');
const revision=String(process.argv[2]||'').trim();
if(!/^[A-Za-z0-9_-]{1,80}$/.test(revision))throw new Error('An existing ICD revision is required.');
neonRequest('/rpc/inspect_icd_snapshot_validation',{
  method:'POST',body:{p_revision:revision},timeoutMs:15000,label:'ICD validation plan inspection'
}).then(result=>console.log(JSON.stringify(dataOf(result),null,2)))
  .catch(error=>{console.error({status:error.status,message:error.message});process.exitCode=1;});
