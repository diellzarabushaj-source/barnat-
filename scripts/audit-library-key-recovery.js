'use strict';
const {keyBundle,seal,auditRows}=require('../lib/library-key-recovery.js');
async function run(){
  if(process.env.VERCEL_ENV!=='production'||process.env.VERCEL_GIT_COMMIT_REF!=='main'||process.env.DRX_LIBRARY_KEY_RECOVERY_ENABLED!=='library_recovery_20261012'){
    console.log('DRX_LIBRARY_RECOVERY_NOT_ENABLED');return;
  }
  const config=require('../data/library-key-recovery-config.json');
  const {supabaseRequest,SUPABASE_URL}=require('../lib/supabase-data-api.js');
  if(SUPABASE_URL!=='https://ftuchtmolddhhsdcwnqe.supabase.co')throw Error('Source mismatch');
  const rows=await require('./fetch-recovery-prescriptions.js').fetchRows(supabaseRequest);
  const proof=auditRows(rows);if(proof.status!=='PASS')throw Error('No real envelopes verified');
  const packet=seal(keyBundle(),config);
  // Only authenticated build-log readers receive a sealed recovery packet.
  // The corresponding private key never enters Vercel or the repository.
  console.log('DRX_LIBRARY_RECOVERY_PROOF='+JSON.stringify({...proof,commit:process.env.VERCEL_GIT_COMMIT_SHA,keyId:config.keyId}));
  console.log('DRX_LIBRARY_RECOVERY_SEALED_PACKET='+JSON.stringify(packet));
}
run().catch(()=>{console.error('Library recovery audit failed; private diagnostics and keys were not printed.');process.exitCode=1;});
