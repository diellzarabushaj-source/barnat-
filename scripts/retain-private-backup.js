'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {pipeline} = require('node:stream/promises');
const {Transform} = require('node:stream');
const {isDeepStrictEqual} = require('node:util');
const {execFileSync} = require('node:child_process');
const {decryptFile} = require('./backup-archive-crypto.js');
const policy = require('../data/backup-retention.json');
const privateInventory=require('./private-backup-inventory.js');
async function sha256(file) {
  const digest = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
function ownedBlob(blob) {
  return privateInventory.owned(blob,'backup');
}
async function retain({archive, original, evidenceFile, token, key, keyId, commit, sdk, fetcher = fetch, now = new Date(), requireStorageBodies=false}) {
  if (!token || !/^[a-f0-9]{64}$/.test(key || '') || !/^[A-Za-z0-9_-]{1,64}$/.test(keyId || '') || !/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('Retention configuration is incomplete');
  const evidence = JSON.parse(await fsp.readFile(evidenceFile, 'utf8'));
  if (evidence.status !== 'PASS' || evidence.restoreVerified !== true || evidence.personalLibraryRowParityVerified !== true || !isDeepStrictEqual(evidence.sourceManifest, evidence.restoredManifest)) throw new Error('Unverified backups cannot be retained');
  if(requireStorageBodies && evidence.storageBodies?.completeInventoryCaptured!==true) throw new Error('Storage body inventory is missing');
  const size = (await fsp.stat(archive)).size;
  const header = Buffer.alloc(8), handle = await fsp.open(archive, 'r');
  try { await handle.read(header, 0, 8, 0); } finally { await handle.close(); }
  if (!header.equals(Buffer.from('DRXBAK01')) || size <= 36 || size > policy.maxArchiveBytes) throw new Error('Only bounded encrypted archives can be retained');
  const stored=(await privateInventory.inventory(sdk,token,size)).filter(item=>ownedBlob(item));
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const pathname = policy.prefix + stamp + '_' + commit + '_' + keyId + '.enc';
  const archiveFormat = original.endsWith('.tar.xz') ? 'tar.xz' : 'tar.gz';
  const blob = await sdk.put(pathname, fs.createReadStream(archive), {access:'private', token, addRandomSuffix:false, allowOverwrite:false, contentType:'application/octet-stream'});
  if (blob.pathname !== pathname || !ownedBlob(blob)) throw new Error('Private backup destination differs');
  const anonymous = await fetcher(blob.url, {cache:'no-store', redirect:'error', signal:AbortSignal.timeout(30000)});
  if (![401,403,404].includes(anonymous.status)) throw new Error('Private backup anonymous boundary failed');
  const downloaded = path.join(path.dirname(archive), 'download-' + crypto.randomBytes(12).toString('hex') + '.enc');
  const decrypted = downloaded + '.archive';
  let encryptedHash;
  try {
    const response = await sdk.get(blob.url, {access:'private', token, useCache:false, abortSignal:AbortSignal.timeout(120000)});
    if (!response || response.statusCode !== 200 || !response.stream) throw new Error('Private backup download failed');
    let received = 0;
    const bounded = new Transform({transform(chunk, encoding, callback) {
      received += chunk.length;
      callback(received > size ? new Error('Backup download exceeds expected size') : null, chunk);
    }});
    await pipeline(response.stream, bounded, fs.createWriteStream(downloaded, {flags:'wx', mode:0o600}));
    encryptedHash = await sha256(archive);
    if (await sha256(downloaded) !== encryptedHash) throw new Error('Retained backup bytes differ');
    await decryptFile(downloaded, decrypted, key);
    if (await sha256(decrypted) !== await sha256(original)) throw new Error('Retained backup recovery differs');
    if(evidence.storageBodies) {
      const recovered = JSON.parse(execFileSync('python3',[path.join(__dirname,'verify-storage-archive.py'),decrypted],{encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:30000}));
      if(!recovered.completeInventoryRecovered || recovered.objectCount!==evidence.storageBodies.objectCount || recovered.objectBytes!==evidence.storageBodies.objectBytes || recovered.manifestFingerprint!==evidence.storageBodies.manifestFingerprint) throw new Error('Retained Storage bodies differ');
      evidence.storageObjectByteRecoveryVerified=true;
      evidence.nativeStorageApiReplayVerified=false;
      evidence.verifiedScope.push('physical_storage_object_bytes');
    }
    if(evidence.prescriptionKeyRecovery) {
      const recovered=JSON.parse(execFileSync('python3',[path.join(__dirname,'verify-library-archive.py'),decrypted],{encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:45000}));
      const expected=evidence.prescriptionKeyRecovery;
      if(recovered.status!=='PASS'||!recovered.independentCipherKeyRecoveryVerified||recovered.prescriptionRows!==expected.prescriptionRows||recovered.ownerCount!==expected.ownerCount||recovered.encryptedVaultSha256!==expected.encryptedVaultSha256)throw new Error('Retained prescription key recovery differs');
      evidence.prescriptionKeyRecovery.retainedArchiveIndependentDecryptionVerified=true;
      evidence.verifiedScope.push('prescription_cipher_key_recovery_and_existing_envelope_decryption');
    }
  } finally {
    await fsp.unlink(downloaded).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await fsp.unlink(decrypted).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  const proofPath = pathname.replace(/\.enc$/, '.verified.json');
  const proofBody = JSON.stringify({schemaVersion:'drx-retained-archive-proof-v1', pathname, encryptedSha256:encryptedHash, keyId, archiveFormat, archiveDecryptionVerified:true, anonymousReadRejected:true});
  const proof = await sdk.put(proofPath, proofBody, {access:'private', token, addRandomSuffix:false, allowOverwrite:false, contentType:'application/json'});
  if (proof.pathname !== proofPath || !ownedBlob(proof)) throw new Error('Private backup proof destination differs');
  // A failed download/decryption leaves no verification marker and cannot push
  // a verified older archive out of the retention window.
  const markers = new Set(stored.filter(item => item.pathname.endsWith('.verified.json')).map(item => item.pathname));
  const verified = stored.filter(item => item.pathname.endsWith('.enc') && markers.has(item.pathname.replace(/\.enc$/, '.verified.json')));
  const all = [...verified, {...blob, size}].sort((a,b) => b.pathname.localeCompare(a.pathname));
  const obsolete = all.slice(policy.keepLatest);
  if (obsolete.some(item => item.pathname === pathname)) throw new Error('New backup is older than the retention window');
  for (const item of obsolete) {
    const marker = stored.find(entry => entry.pathname === item.pathname.replace(/\.enc$/, '.verified.json'));
    await sdk.del([item.url, marker.url], {token});
  }
  evidence.backupRetention = 'private_blob_encrypted_latest_14_capacity_guarded';
  evidence.retentionStatus = 'PASS';
  evidence.retainedBackup = {storeId:policy.storeId, pathname, bytes:size, encryptedSha256:encryptedHash, keyId, archiveFormat, downloadVerified:true, archiveDecryptionVerified:true, anonymousReadRejected:true, retainedCount:all.length-obsolete.length, prunedCount:obsolete.length, unverifiedArchivesCount:stored.filter(item => item.pathname.endsWith('.enc')).length-verified.length, maxStoredBytes:policy.maxStoredBytes};
  await fsp.writeFile(evidenceFile, JSON.stringify(evidence, null, 2) + '\n');
  return evidence.retainedBackup;
}
if (require.main === module) {
  const [archive, original, evidenceFile] = process.argv.slice(2);
  retain({archive, original, evidenceFile, token:process.env.DRX_BACKUP_BLOB_TOKEN, key:process.env.DRX_BACKUP_ARCHIVE_KEY, keyId:process.env.DRX_BACKUP_ARCHIVE_KEY_ID, commit:process.env.GITHUB_SHA, sdk:require('@vercel/blob'),requireStorageBodies:process.env.DRX_BACKUP_STORAGE_BODIES_REQUIRED==='1'})
    .then(result => console.log(JSON.stringify(result)))
    .catch(() => { console.error('Private backup retention failed; credentials and private diagnostics are not published.'); process.exitCode=1; });
}
module.exports = {retain, sha256, ownedBlob};
