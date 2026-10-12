'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const {pipeline} = require('node:stream/promises');
const MAGIC = Buffer.from('DRXBAK01');
const MAX_BYTES = 64 * 1024 * 1024;
function keyBuffer(key) {
  if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)) throw new Error('Backup key is missing or invalid');
  return Buffer.from(key, 'hex');
}
async function transformFile(input, output, key, decrypt) {
  const material = keyBuffer(key);
  const size = (await fsp.stat(input)).size;
  if (!size || size > MAX_BYTES + (decrypt ? 36 : 0) || (decrypt && size <= 36)) throw new Error('Backup archive size is invalid');
  const temporary = output + '.partial-' + crypto.randomBytes(12).toString('hex');
  let header, transform, tag;
  if (decrypt) {
    const handle = await fsp.open(input, 'r');
    try {
      header = Buffer.alloc(20); tag = Buffer.alloc(16);
      await handle.read(header, 0, 20, 0); await handle.read(tag, 0, 16, size - 16);
    } finally { await handle.close(); }
    if (!header.subarray(0, 8).equals(MAGIC)) throw new Error('Unsupported backup archive');
    transform = crypto.createDecipheriv('aes-256-gcm', material, header.subarray(8));
    transform.setAAD(header); transform.setAuthTag(tag);
  } else {
    header = Buffer.concat([MAGIC, crypto.randomBytes(12)]);
    transform = crypto.createCipheriv('aes-256-gcm', material, header.subarray(8));
    transform.setAAD(header);
  }
  try {
    await fsp.writeFile(temporary, decrypt ? Buffer.alloc(0) : header, {flag:'wx', mode:0o600});
    await pipeline(fs.createReadStream(input, decrypt ? {start:20, end:size - 17} : {}), transform, fs.createWriteStream(temporary, {flags:'a', mode:0o600}));
    if (!decrypt) await fsp.appendFile(temporary, transform.getAuthTag());
    // Exclusive publication; an existing output is never overwritten.
    await fsp.link(temporary, output);
  } finally {
    await fsp.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    material.fill(0);
  }
}
const encryptFile = (input, output, key) => transformFile(input, output, key, false);
const decryptFile = (input, output, key) => transformFile(input, output, key, true);
if (require.main === module) {
  const [mode, input, output] = process.argv.slice(2);
  if (!['encrypt','decrypt'].includes(mode) || !input || !output) { console.error('Usage: backup-archive-crypto.js encrypt|decrypt input output'); process.exitCode=1; }
  else (mode === 'encrypt' ? encryptFile : decryptFile)(input, output, process.env.DRX_BACKUP_ARCHIVE_KEY)
    .then(() => console.log('Authenticated backup archive operation passed.'))
    .catch(() => { console.error('Backup archive operation failed; private diagnostics are not published.'); process.exitCode=1; });
}
module.exports = {encryptFile, decryptFile, MAX_BYTES};
