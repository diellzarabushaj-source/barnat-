'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {encryptFile, decryptFile} = require('../scripts/backup-archive-crypto.js');
async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'drx-archive-test-'));
  assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
  const file = name => path.join(directory, name), key = 'ab'.repeat(32);
  try {
    const plaintext = Buffer.from('SYNTHETIC_PRIVATE_MARKER\n  ë dhe ç  \n'.repeat(4096));
    await fs.writeFile(file('input'), plaintext);
    await encryptFile(file('input'), file('one.enc'), key);
    await encryptFile(file('input'), file('two.enc'), key);
    const sealed = await fs.readFile(file('one.enc'));
    assert.ok(!sealed.includes(Buffer.from('SYNTHETIC_PRIVATE_MARKER')));
    assert.notDeepEqual(sealed, await fs.readFile(file('two.enc')), 'Fresh IV for every archive');
    await decryptFile(file('one.enc'), file('restored'), key);
    assert.deepEqual(await fs.readFile(file('restored')), plaintext);
    await assert.rejects(encryptFile(file('input'), file('one.enc'), key), /EEXIST/);
    for (const position of [0, 10, 40, sealed.length - 1]) {
      const altered = Buffer.from(sealed); altered[position] ^= 1;
      await fs.writeFile(file('altered'), altered);
      await assert.rejects(decryptFile(file('altered'), file('rejected'), key));
      await assert.rejects(fs.stat(file('rejected')), /ENOENT/);
    }
    await assert.rejects(decryptFile(file('one.enc'), file('wrong-key'), 'cd'.repeat(32)));
    await assert.rejects(encryptFile(file('input'), file('bad'), 'invalid'));
    await fs.writeFile(file('truncated'), sealed.subarray(0, 30));
    await assert.rejects(decryptFile(file('truncated'), file('short'), key));
    assert.ok(!(await fs.readdir(directory)).some(name => name.includes('.partial-')));
    console.log('Backup AES-256-GCM archive: exact recovery, fresh IV, authenticated header/body/tag, wrong key, truncation, exclusive output and failed-plaintext cleanup passed.');
  } finally { await fs.rm(directory, {recursive:true, force:true}); }
}
main().catch(() => { console.error('Backup archive regression failed.'); process.exitCode=1; });
