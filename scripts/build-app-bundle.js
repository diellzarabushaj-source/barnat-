const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'app-bundle.js');
const PARTS = Array.from({ length: 7 }, (_, index) =>
  path.join(ROOT, 'app-parts', `part-${String(index + 1).padStart(2, '0')}.txt`),
);

for (const part of PARTS) {
  if (!fs.existsSync(part)) throw new Error(`Mungon pjesa e aplikacionit: ${path.relative(ROOT, part)}`);
}

const source = PARTS.map(part => fs.readFileSync(part, 'utf8')).join('');
new vm.Script(source, { filename: 'app-bundle.js' });

const hash = crypto.createHash('sha256').update(source).digest('hex').slice(0, 16);
const output = [
  `/* MedIndex compiled app bundle · ${hash} */`,
  source,
  `\nwindow.MEDINDEX_APP_BUNDLE_META = Object.freeze({ hash: '${hash}', parts: ${PARTS.length} });\n`,
].join('\n');

fs.writeFileSync(OUTPUT, output, 'utf8');
console.log(`Built app-bundle.js (${Buffer.byteLength(output)} bytes, sha256 ${hash}).`);
