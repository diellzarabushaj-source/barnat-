'use strict';

/* Një faqe publike ngarkohet nga dikush që nuk ka sesion. Nëse një skedë CSS ose
   JS që ajo faqe kërkon nuk gjendet në `PUBLIC_PATHS` të `middleware.ts`,
   middleware-i e ridrejton te faqja e hyrjes: shfletuesi merr HTML aty ku
   priste CSS, dhe faqja del pa stil për këdo që nuk ka hyrë.

   Ky gabim nuk kapet as nga testet e nyjeve as nga auditet në shfletues, sepse
   serveri i testeve nuk e ekzekuton middleware-in. Prandaj kontrollohet këtu,
   te burimi: çdo referencë relative e faqeve publike duhet të jetë e lejuar. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

/* Faqet që një vizitor pa sesion mund të hapë. Nëse shtohet një faqe e re
   publike, shtoje edhe këtu. */
const PUBLIC_PAGES = [
  'landing.html',
  'blog.html',
  'rreth-nesh.html',
  'kontakt.html',
  'login.html',
  'regjistrimi.html',
];

/* Faqet e informacionit rrinë në një Set të vetin dhe shpërndahen te
   `PUBLIC_PATHS` me `...PUBLIC_INFO_PATHS`, ndaj lexohen të dyja. */
function allowedPaths(middleware) {
  const names = ['PUBLIC_INFO_PATHS', 'PUBLIC_PATHS'];
  const allowed = new Set();
  for (const name of names) {
    const block = middleware.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`));
    assert.ok(block, `${name} nuk u gjet te middleware.ts`);
    for (const match of block[1].matchAll(/'([^']+)'/g)) allowed.add(match[1]);
  }
  return allowed;
}

/* Referencat relative — ato që shkojnë te rrënja e projektit. Lidhjet e jashtme,
   data: dhe ankorat nuk kalojnë nga middleware-i. */
function localAssets(html) {
  return [...html.matchAll(/\b(?:href|src)\s*=\s*"([^"]+)"/g)]
    .map(match => match[1])
    .filter(value => /\.(?:css|js|woff2?|svg)(?:\?|$)/i.test(value))
    .filter(value => !/^(?:https?:|data:|mailto:|tel:|#)/i.test(value))
    .map(value => value.split(/[?#]/)[0])
    .map(value => (value.startsWith('/') ? value : `/${value}`));
}

function run() {
  const middleware = read('middleware.ts');
  const allowed = allowedPaths(middleware);
  const problems = [];

  for (const page of PUBLIC_PAGES) {
    if (!fs.existsSync(path.join(ROOT, page))) continue;

    assert.ok(
      allowed.has(`/${page}`),
      `${page} është faqe publike por vetë nuk është te PUBLIC_PATHS`
    );

    for (const asset of new Set(localAssets(read(page)))) {
      if (!allowed.has(asset)) problems.push(`${page} → ${asset}`);
      if (!fs.existsSync(path.join(ROOT, asset.replace(/^\//, '')))) {
        problems.push(`${page} → ${asset} (skeda nuk ekziston)`);
      }
    }
  }

  assert.deepStrictEqual(
    problems,
    [],
    'Këto skeda kërkohen nga faqe publike por middleware-i do t\'i ridrejtojë te '
      + `hyrja, ndaj faqja del pa stil:\n  ${problems.join('\n  ')}`
  );

  console.log(`Public asset reachability: ${PUBLIC_PAGES.length} faqe, çdo referencë e lejuar nga middleware.`);
}

if (require.main === module) run();

module.exports = { run };
