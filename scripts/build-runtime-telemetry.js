'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname,'..');
const dependency = path.dirname(require.resolve('web-vitals'));
const pkgRoot = path.resolve(dependency,'..');
const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot,'package.json'),'utf8'));
if (pkg.version !== '6.2.3') throw new Error('Telemetry requires the audited web-vitals 6.2.3 dependency.');
const source = fs.readFileSync(path.join(dependency,'web-vitals.js'));
const license = fs.readFileSync(path.join(pkgRoot,'LICENSE'));
const directory = path.join(root,'vendor');
fs.mkdirSync(directory,{ recursive:true });
function writeChanged(file,bytes) {
  const destination = path.join(directory,file);
  if (!fs.existsSync(destination) || !fs.readFileSync(destination).equals(Buffer.from(bytes))) fs.writeFileSync(destination,bytes);
}
writeChanged('web-vitals.js',source);
writeChanged('web-vitals.LICENSE',license);
writeChanged('web-vitals.provenance.json',`${JSON.stringify({ package:'web-vitals',version:pkg.version,source:'https://github.com/GoogleChrome/web-vitals',license:'Apache-2.0',sha256:crypto.createHash('sha256').update(source).digest('hex') },null,2)}\n`);
console.log('Self-hosted web-vitals 6.2.3 build verified.');
