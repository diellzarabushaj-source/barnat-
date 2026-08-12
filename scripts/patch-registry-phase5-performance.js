'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Phase 5 performance patch could not find ${label}.`);
  return source.replace(before, after);
}

function patchDosageClient() {
  let source = read('registry-dosage-columns-v3.js');
  source = replaceOnce(
    source,
    `    if (!payload?.ok || !Array.isArray(payload.cards)) throw new Error('Payload-i i dozave të faqes nuk është valid.');\n    payload.cards.forEach(indexCard);\n    return payload.cards;`,
    `    if (!payload?.ok || !Array.isArray(payload.cards)) throw new Error('Payload-i i dozave të faqes nuk është valid.');\n    const requested = new Set(numbers.map(clean).filter(Boolean));\n    const cards = payload.cards.filter(card => requested.has(clean(card?.registryNumber ?? card?.nr)));\n    cards.forEach(indexCard);\n    return cards;`,
    'bounded dosage client response filter',
  );
  if (!source.includes('const requested = new Set(numbers.map(clean).filter(Boolean));')) {
    throw new Error('Phase 5 dosage client bounded-response guard is missing.');
  }
  write('registry-dosage-columns-v3.js', source);
}

function patchPerformanceServer() {
  let source = read('tests/registry-performance-server.js');
  if (!source.includes('function boundedDosageBody')) {
    const anchor = `const dosageBody = JSON.stringify({\n  schemaVersion:'performance-v1', matchVersion:'exact-v1', datasetVersion:'performance-4006', mode:'SAFE_VERIFIED_ONLY',\n  generatedAt:new Date(0).toISOString(), forms:[], adult:[], pediatric:[], cards:dosageCards,\n  meta:{ clinicalAutoFillEnabled:false, publishedForms:0, publishedAdultRegimens:0, publishedPediatricRegimens:0, publishedCards:ROW_COUNT },\n});\n`;
    const addition = `${anchor}\nfunction boundedDosageBody(url) {\n  if (url.searchParams.get('view') !== 'cards') return dosageBody;\n  const requested = new Set(\n    String(url.searchParams.get('nr') || '')\n      .split(',')\n      .map(value => value.trim())\n      .filter(Boolean)\n  );\n  const cards = requested.size\n    ? dosageCards.filter(card => requested.has(String(card.nr)))\n    : [];\n  return JSON.stringify({\n    schemaVersion:'performance-v1',\n    matchVersion:'exact-v1',\n    datasetVersion:'performance-4006',\n    mode:'SAFE_VERIFIED_ONLY',\n    generatedAt:new Date(0).toISOString(),\n    forms:[], adult:[], pediatric:[], cards,\n    meta:{\n      clinicalAutoFillEnabled:false,\n      publishedForms:0,\n      publishedAdultRegimens:0,\n      publishedPediatricRegimens:0,\n      publishedCards:cards.length,\n    },\n  });\n}\n`;
    if (!source.includes(anchor)) throw new Error('Phase 5 performance fixture dosage payload anchor is missing.');
    source = source.replace(anchor, addition);
  }
  source = replaceOnce(
    source,
    `  if (url.pathname === '/api/dosage') {\n    return setTimeout(() => streamSlowly(res, dosageBody, 'application/json; charset=utf-8', 8, 32 * 1024), 900);\n  }`,
    `  if (url.pathname === '/api/dosage') {\n    const body = boundedDosageBody(url);\n    const delay = url.searchParams.get('view') === 'cards' ? 80 : 900;\n    return setTimeout(() => streamSlowly(res, body, 'application/json; charset=utf-8', 4, 32 * 1024), delay);\n  }`,
    'bounded dosage performance route',
  );
  if (!source.includes("url.searchParams.get('view') !== 'cards'")) {
    throw new Error('Phase 5 performance fixture must model the bounded cards endpoint.');
  }
  write('tests/registry-performance-server.js', source);
}

function patchRegressionTest() {
  const file = 'tests/registry-dosage-columns-test.js';
  let source = read(file);
  if (!source.includes('requested.has(clean(card?.registryNumber ?? card?.nr))')) {
    const marker = `assert.match(source, /REQUEST_BATCH_SIZE = 100/, 'visible-row dosage requests must remain bounded');`;
    if (source.includes(marker)) {
      source = source.replace(
        marker,
        `${marker}\nassert.match(source, /requested\.has\(clean\(card\?\.registryNumber \?\? card\?\.nr\)\)/, 'dosage client must reject cards outside the requested visible batch');`,
      );
    }
  }
  write(file, source);
}

patchDosageClient();
patchPerformanceServer();
patchRegressionTest();

console.log('Phase 5 bounded dosage response and production-matched performance fixture patch passed.');
