/* MedIndex registry parser worker v2: parse, normalize and audit off the UI thread. */
'use strict';

const BASE64_CHUNK = 256 * 1024;
const QUALITY_URL = './data/registry-quality.js?v=20260723-2';
const CANONICAL_FIELDS = [
  'Nr rendor','PDID','ProtocolNo','Emri tregtar','Substanca aktive','ATC Code',
  'Klasa / Çka është','Përdorimi (fjalë kyçe)','Fortësia','Forma farmaceutike',
  'Madhësia e paketimit','Si të shënohet në recetë','Bartësi i Autorizim Marketingut','Prodhuesi',
  'MA certifikata','Statusi','Çmimi me shumicë','Çmimi me marzhë','TVSH',
  'Çmimi me pakicë','Afati i vlefshmërisë'
];

const FIELD_ALIASES = {
  'Nr rendor':['nrrendor','nr','number','index','rendor'],
  PDID:['pdid','productid','drugid','id'],
  ProtocolNo:['protocolno','protocol','protokolli','protokollno'],
  'Emri tregtar':['emritregtar','tradename','brandname','emri','name'],
  'Substanca aktive':['substancaaktive','activesubstance','activeingredient','genericname','substanca'],
  'ATC Code':['atccode','atc','kodiatc'],
  'Klasa / Çka është':['klasackaeshte','klasa','class','drugclass','ckaeshte'],
  'Përdorimi (fjalë kyçe)':['perdorimifjalekyce','perdorimi','indication','indications','uses','keywords'],
  'Fortësia':['fortesia','strength','dosestrength'],
  'Forma farmaceutike':['formafarmaceutike','forma','dosageform','pharmaceuticalform'],
  'Madhësia e paketimit':['madhesiaepaketimit','paketimi','packsize','packagesize'],
  'Si të shënohet në recetë':['siteshenohetnerecete','sitetshenohetnerecete','prescriptionnotation','prescriptionline','receta'],
  'Bartësi i Autorizim Marketingut':['bartesiiautorizimmarketingut','bartesiiautorizimit','marketingauthorisationholder','mah'],
  Prodhuesi:['prodhuesi','manufacturer','producer'],
  'MA certifikata':['macertifikata','macertificate','certificate'],
  Statusi:['statusi','status','type'],
  'Çmimi me shumicë':['cmimimeshumice','wholesaleprice'],
  'Çmimi me marzhë':['cmimimemarzhe','marginprice'],
  TVSH:['tvsh','vat'],
  'Çmimi me pakicë':['cmimimepakice','retailprice','price'],
  'Afati i vlefshmërisë':['afatiivlefshmerise','validity','validuntil','expiry']
};

function normalizeFieldToken(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

const FIELD_LOOKUP = {};
for (const field of CANONICAL_FIELDS) {
  FIELD_LOOKUP[normalizeFieldToken(field)] = field;
  for (const alias of FIELD_ALIASES[field] || []) FIELD_LOOKUP[normalizeFieldToken(alias)] = field;
}

function decodeBase64Parts(parts) {
  const encoded = Array.isArray(parts) ? parts.join('') : '';
  if (!encoded) throw new Error('Payload-i i regjistrit është bosh.');
  const chunks = [];
  let total = 0;
  let offset = 0;
  while (offset < encoded.length) {
    let end = Math.min(encoded.length, offset + BASE64_CHUNK);
    if (end < encoded.length) end -= (end - offset) % 4;
    if (end <= offset) end = Math.min(encoded.length, offset + 4);
    const binary = atob(encoded.slice(offset, end));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    chunks.push(bytes);
    total += bytes.length;
    offset = end;
  }
  const output = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }
  return output;
}

function unwrapDrugRows(value) {
  let current = value;
  for (let depth = 0; depth < 5; depth += 1) {
    if (Array.isArray(current)) return current;
    if (typeof current === 'string') {
      try { current = JSON.parse(current); continue; } catch { return []; }
    }
    if (current && typeof current === 'object') {
      const preferred = ['data','rows','records','items','drugs','barnat','Sheet1','sheet1'];
      const key = preferred.find(name => Array.isArray(current[name]) || typeof current[name] === 'string');
      if (key) { current = current[key]; continue; }
      const nested = Object.values(current).find(Array.isArray);
      if (nested) { current = nested; continue; }
    }
    break;
  }
  return [];
}

function normalizeDrugRow(row, index) {
  let sourceRow = row;
  if (typeof sourceRow === 'string') {
    try { sourceRow = JSON.parse(sourceRow); } catch { sourceRow = { 'Emri tregtar':sourceRow }; }
  }
  const result = Object.fromEntries(CANONICAL_FIELDS.map(field => [field, '']));
  if (Array.isArray(sourceRow)) {
    CANONICAL_FIELDS.forEach((field, position) => { result[field] = sourceRow[position] ?? ''; });
  } else if (sourceRow && typeof sourceRow === 'object') {
    const source = sourceRow.data && typeof sourceRow.data === 'object' && !Array.isArray(sourceRow.data)
      ? sourceRow.data
      : sourceRow;
    for (const [key, value] of Object.entries(source)) {
      const canonical = FIELD_LOOKUP[normalizeFieldToken(key)];
      if (canonical) result[canonical] = value ?? '';
    }
  }
  if (result['Nr rendor'] === '' || result['Nr rendor'] == null) result['Nr rendor'] = index + 1;
  return result;
}

function emergencyQuality(rows) {
  let corrected = 0;
  const output = rows.map(row => {
    if (String(row.ProtocolNo ?? '').trim() !== 'PD1339/051225' || String(row.PDID ?? '').trim() !== '42') return row;
    corrected += 1;
    return {
      ...row,
      'Substanca aktive':'Metamizole sodium',
      __qualityStatus:'corrected',
      __qualityMessage:'REG-2026-001: substanca u korrigjua në Metamizole sodium.',
      __qualitySourceUrl:'https://lekovi.zdravstvo.gov.mk/drugsregister/detailview/51155',
      __qualityVersion:'worker-emergency-v2'
    };
  });
  return {
    rows:output,
    summary:{ total:output.length, corrected, blocked:0, warning:0, verified:Math.max(0, output.length - corrected) },
    version:'worker-emergency-v2',
    corrections:[]
  };
}

async function parseRegistry(parts) {
  self.postMessage({ type:'REGISTRY_PROGRESS', stage:'decode' });
  if (typeof DecompressionStream !== 'function') throw new Error('Browser-i nuk e mbështet dekompresimin e regjistrit.');
  const compressed = decodeBase64Parts(parts);
  self.postMessage({ type:'REGISTRY_PROGRESS', stage:'decompress' });
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  const parsed = JSON.parse(await new Response(stream).text());
  self.postMessage({ type:'REGISTRY_PROGRESS', stage:'normalize' });
  const normalized = unwrapDrugRows(parsed).map(normalizeDrugRow);
  let qualityResult;
  try {
    if (!self.MedIndexRegistryQuality) importScripts(QUALITY_URL);
    qualityResult = self.MedIndexRegistryQuality?.applyRows?.(normalized) || emergencyQuality(normalized);
  } catch (error) {
    console.error('Registry quality worker fallback:', error);
    qualityResult = emergencyQuality(normalized);
  }
  const { rows, ...quality } = qualityResult;
  return { rows, quality };
}

self.addEventListener('message', async event => {
  if (event.data?.type !== 'PARSE_REGISTRY') return;
  try {
    const data = await parseRegistry(event.data.parts);
    self.postMessage({ type:'REGISTRY_PARSED', ok:true, data });
  } catch (error) {
    self.postMessage({
      type:'REGISTRY_PARSED',
      ok:false,
      error:String(error?.message || error || 'Regjistri nuk u lexua.')
    });
  }
});
