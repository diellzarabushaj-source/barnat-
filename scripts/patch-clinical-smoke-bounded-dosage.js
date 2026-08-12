'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'tests', 'clinical-smoke-server.js');
const MARKER = 'clinical-smoke-bounded-dosage-v1';

let source = fs.readFileSync(TARGET, 'utf8').replace(/\r\n?/g, '\n');

if (!source.includes(MARKER)) {
  const cardsAnchor = `  pediatric:[], cards:[],\n  meta:{ clinicalAutoFillEnabled:true, publishedForms:1, publishedAdultRegimens:1, publishedPediatricRegimens:0, geminiForDosage:false },`;
  const cardsReplacement = `  pediatric:[],\n  cards:[{\n    registryNumber:'1',\n    cardKey:'1001|PARACETAMOL TEST|500 mg',\n    pdid:'1001',\n    tradeName:'PARACETAMOL TEST',\n    substance:'Paracetamol',\n    atc:'N02BE01',\n    form:'Tabletë',\n    strength:'500 mg',\n    drugClass:'Analgesic',\n    use:'dhimbje temperaturë',\n    adultDose:'500 mg (1 tabletë) çdo 8 orë sipas nevojës; maksimumi 3000 mg/24 orë.',\n    adultRoute:'Orale',\n    pediatricDose:'',\n    pediatricRoute:'',\n    sourceUrls:['https://example.test/paracetamol'],\n    status:'VERIFIKUAR',\n  }],\n  smokeContract:'${MARKER}',\n  meta:{ clinicalAutoFillEnabled:true, publishedForms:1, publishedAdultRegimens:1, publishedPediatricRegimens:0, publishedCards:1, geminiForDosage:false },`;
  if (!source.includes(cardsAnchor)) throw new Error('Clinical smoke dosage patch: dosage fixture anchor missing.');
  source = source.replace(cardsAnchor, cardsReplacement);

  const routeAnchor = `  if (url.pathname === '/api/dosage') return send(res, 200, JSON.stringify(dosage), 'application/json; charset=utf-8');`;
  const routeReplacement = `  if (url.pathname === '/api/dosage') {\n    if (url.searchParams.get('view') === 'cards') {\n      const requested = new Set(String(url.searchParams.get('nr') || '').split(',').map(value => value.trim()).filter(Boolean));\n      const cards = dosage.cards.filter(card => requested.has(String(card.registryNumber)));\n      return send(res, 200, JSON.stringify({ ok:true, cards, meta:{ targeted:true, publishedCards:cards.length } }), 'application/json; charset=utf-8');\n    }\n    return send(res, 200, JSON.stringify(dosage), 'application/json; charset=utf-8');\n  }`;
  if (!source.includes(routeAnchor)) throw new Error('Clinical smoke dosage patch: dosage route anchor missing.');
  source = source.replace(routeAnchor, routeReplacement);
}

if (!source.includes(MARKER)) throw new Error('Clinical smoke dosage patch marker missing.');
if (!source.includes("url.searchParams.get('view') === 'cards'")) throw new Error('Clinical smoke server does not expose bounded cards view.');
if (!source.includes("requested.has(String(card.registryNumber))")) throw new Error('Clinical smoke cards response is not bounded to requested registry numbers.');

fs.writeFileSync(TARGET, source, 'utf8');
console.log('Clinical smoke server bounded dosage cards now match the production visible-row contract.');
