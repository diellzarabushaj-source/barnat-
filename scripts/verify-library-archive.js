'use strict';
const fs=require('node:fs');
const {decode,hash}=require('./library-recovery-vault.js');
const {auditRecoveredRows}=require('../lib/library-key-recovery.js');
try{
 const input=fs.readFileSync(0);if(input.length>45*1024*1024)throw Error('Recovery input exceeds bound');
 const {vault,config,rows}=JSON.parse(input),bytes=Buffer.from(vault,'base64');
 const proof=auditRecoveredRows(rows,decode(bytes,process.env.DRX_BACKUP_ARCHIVE_KEY,config));if(proof.status!=='PASS')throw Error('No existing envelopes recovered');
 console.log(JSON.stringify({...proof,encryptedVaultSha256:hash(bytes),independentCipherKeyRecoveryVerified:true,sessionSigningSecretExported:false}));
}catch{console.error('Archived prescription recovery failed; keys and private contents were not printed.');process.exitCode=1;}
