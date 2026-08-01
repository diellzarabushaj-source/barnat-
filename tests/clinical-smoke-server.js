const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 4173);
const rows = [
  {
    'Nr rendor':1, PDID:'1001', ProtocolNo:'TEST-1', 'Emri tregtar':'PARACETAMOL TEST',
    'Substanca aktive':'Paracetamol', 'ATC Code':'N02BE01', 'Klasa / Çka është':'Analgesic',
    'Përdorimi (fjalë kyçe)':'dhimbje temperaturë', 'Fortësia':'500 mg',
    'Forma farmaceutike':'Tabletë', 'Madhësia e paketimit':'20', Statusi:'Gjenerik', __qualityStatus:'verified',
    'Si të shënohet në recetë':'Tab. Paracetamol 500 mg — Paketimi: 20',
    __sheetPrescriptionNotation:'Tab. Paracetamol 500 mg — Paketimi: 20',
    __prescriptionLine:'Tab. Paracetamol 500 mg', __packagingSummary:'1 kuti = 20 tableta',
    __dispense:'Scat. No I (Një kuti = 20 tableta)', __prescriptionRoute:'',
  },
  {
    'Nr rendor':2, PDID:'1002', ProtocolNo:'TEST-2', 'Emri tregtar':'AMOXICILLIN TEST',
    'Substanca aktive':'Amoxicillin', 'ATC Code':'J01CA04', 'Klasa / Çka është':'Antibiotic',
    'Përdorimi (fjalë kyçe)':'infeksion bakterial', 'Fortësia':'500 mg',
    'Forma farmaceutike':'Kapsulë', 'Madhësia e paketimit':'20', Statusi:'Gjenerik', __qualityStatus:'verified',
    'Si të shënohet në recetë':'Caps. Amoxicillin 500 mg — Paketimi: 20',
    __sheetPrescriptionNotation:'Caps. Amoxicillin 500 mg — Paketimi: 20',
    __prescriptionLine:'Caps. Amoxicillin 500 mg', __packagingSummary:'1 kuti = 20 kapsula',
    __dispense:'Scat. No I (Një kuti = 20 kapsula)', __prescriptionRoute:'',
  },
  {
    'Nr rendor':3, PDID:'1003', ProtocolNo:'TEST-3',
    'Emri tregtar':'ONCEAIR PEDIATRIC CHEWABLE TABLETS WITH EXTENDED DISPLAY NAME',
    'Substanca aktive':'Montelukast (as 4.16 mg montelukast sodium) — përmbajtje e gjatë që duhet të shfaqet e plotë pas zgjerimit të rreshtit',
    'ATC Code':'R03DC03',
    'Klasa / Çka është':'Antagonist i receptorit leukotrien me përshkrim të gjatë klinik për kontrollin e regresionit vizual',
    'Përdorimi (fjalë kyçe)':'astmë pediatrike profilaksi bronkospazëm alergji sezonale dhe përdorim klinik i zgjatur',
    'Fortësia':'4 mg',
    'Forma farmaceutike':'Chewable tablet me përshkrim të gjatë të formës farmaceutike',
    'Madhësia e paketimit':'28', Statusi:'Origjinator', __qualityStatus:'verified',
    'Si të shënohet në recetë':'Tab. përtypëse Montelukast 4 mg — Paketimi: 28',
    __sheetPrescriptionNotation:'Tab. përtypëse Montelukast 4 mg — Paketimi: 28',
    __prescriptionLine:'Tab. përtypëse Montelukast 4 mg', __packagingSummary:'1 kuti = 28 tableta',
    __dispense:'Scat. No I (Një kuti = 28 tableta)', __prescriptionRoute:'',
  },
];
const encodedRegistry = zlib.gzipSync(Buffer.from(JSON.stringify(rows))).toString('base64');
const registryMeta = { version:'browser-test', summary:{ total:3, verified:3, blocked:0 } };
const registryBody = `window.DRUG_DATA_PARTS = [${JSON.stringify(encodedRegistry)}];\nwindow.REGISTRY_QUALITY_META = ${JSON.stringify(registryMeta)};\n`;

const dosage = {
  schemaVersion:'1.0.0', matchVersion:'exact-v1', datasetVersion:'browser-test', mode:'SAFE_VERIFIED_ONLY',
  forms:[{ form:'Tabletë', formKey:'tablete', category:'Orale', prefix:'Tab.', route:'Orale', unit:'tabletë', safetyNote:'' }],
  adult:[{
    regimenId:'PARA-500-ADULT', substance:'Paracetamol', atc:'N02BE01', form:'Tabletë', referenceStrength:'500 mg',
    indication:'Dhimbje / temperaturë', population:'Të rritur', doseMg:'500', practicalUnit:'1 tabletë', route:'Orale',
    frequency:'çdo 8 orë sipas nevojës', duration:'Deri 3 ditë', max24hMg:3000, maxUnits24h:'6 tableta',
    dispense:'Scat. No I (Një kuti)', signatura:'Nga 1 tabletë çdo 8 orë sipas nevojës.', warnings:'Kontrollo dozën totale ditore.',
    sourceUrl:'https://example.test/paracetamol', status:'VERIFIKUAR', matchKey:'N02BE01|paracetamol|tablete|500mg',
    normalized:{ atc:'N02BE01', substance:'paracetamol', form:'tablete', strength:'500mg' },
  }],
  pediatric:[], cards:[],
  meta:{ clinicalAutoFillEnabled:true, publishedForms:1, publishedAdultRegimens:1, publishedPediatricRegimens:0, geminiForDosage:false },
};

const icdMeta = {
  version:'ICD-10-WHO 2019',
  sourceSpreadsheetId:'1O2S9xNIzvNmiG8ny-VLAp9NeyiUsrY8pxRpyJgTF_O0',
  counts:{ chapter:22, block:274, category:2050, subcategory:10196, total:12542 },
  quality:{ missingTranslations:5240, machineDraftTranslations:7302, verifiedTranslations:0, translationCoverage:58.22, publicationReady:false },
};
const icdNodes = [
  { code:'I', level:'chapter', chapter:'I', block:'', parentCode:'', englishTitle:'Certain infectious and parasitic diseases (A00-B99)', albanianDraft:'Sëmundje të caktuara infektive dhe parazitare', displayTitle:'Sëmundje të caktuara infektive dhe parazitare', translationStatus:'machine-draft', sourceUrl:'https://icd.who.int/browse10/2019/en#/I', childCount:1 },
  { code:'IX', level:'chapter', chapter:'IX', block:'', parentCode:'', englishTitle:'Diseases of the circulatory system (I00-I99)', albanianDraft:'Sëmundjet e sistemit të qarkullimit', displayTitle:'Sëmundjet e sistemit të qarkullimit', translationStatus:'machine-draft', sourceUrl:'https://icd.who.int/browse10/2019/en#/IX', childCount:1 },
  { code:'A00-A09', level:'block', chapter:'I', block:'A00-A09', parentCode:'I', englishTitle:'Intestinal infectious diseases', albanianDraft:'Sëmundjet infektive të zorrëve', displayTitle:'Sëmundjet infektive të zorrëve', translationStatus:'machine-draft', sourceUrl:'https://icd.who.int/browse10/2019/en#/A00-A09', childCount:2 },
  { code:'I10-I15', level:'block', chapter:'IX', block:'I10-I15', parentCode:'IX', englishTitle:'Hypertensive diseases', albanianDraft:'Sëmundjet hipertensive', displayTitle:'Sëmundjet hipertensive', translationStatus:'machine-draft', sourceUrl:'https://icd.who.int/browse10/2019/en#/I10-I15', childCount:1 },
  { code:'A00', level:'category', chapter:'I', block:'A00-A09', parentCode:'A00-A09', englishTitle:'Cholera', albanianDraft:'Kolera', displayTitle:'Kolera', translationStatus:'machine-draft', sourceUrl:'https://icd.who.int/browse10/2019/en#/A00', childCount:2 },
  { code:'A01', level:'category', chapter:'I', block:'A00-A09', parentCode:'A00-A09', englishTitle:'Typhoid and paratyphoid fevers', albanianDraft:'Ethet tifoide dhe paratifoide', displayTitle:'Ethet tifoide dhe paratifoide', translationStatus:'machine-draft', sourceUrl:'https://icd.who.int/browse10/2019/en#/A01', childCount:0 },
  { code:'I10', level:'category', chapter:'IX', block:'I10-I15', parentCode:'I10-I15', englishTitle:'Essential (primary) hypertension', albanianDraft:'Hipertensioni esencial (primar)', displayTitle:'Hipertensioni esencial (primar)', translationStatus:'machine-draft', sourceUrl:'https://icd.who.int/browse10/2019/en#/I10', childCount:0 },
  { code:'A00.0', level:'subcategory', chapter:'I', block:'A00-A09', parentCode:'A00', englishTitle:'Cholera due to Vibrio cholerae 01, biovar cholerae', albanianDraft:'', displayTitle:'Cholera due to Vibrio cholerae 01, biovar cholerae', translationStatus:'missing', sourceUrl:'https://icd.who.int/browse10/2019/en#/A00.0', childCount:0 },
  { code:'A00.1', level:'subcategory', chapter:'I', block:'A00-A09', parentCode:'A00', englishTitle:'Cholera due to Vibrio cholerae 01, biovar eltor', albanianDraft:'Kolera për shkak të Vibrio cholerae 01, biovar eltor', displayTitle:'Kolera për shkak të Vibrio cholerae 01, biovar eltor', translationStatus:'machine-draft', sourceUrl:'https://icd.who.int/browse10/2019/en#/A00.1', childCount:0 },
];

function icdAncestors(code) {
  const byCode = new Map(icdNodes.map(node => [node.code, node]));
  const result = [];
  let node = byCode.get(code);
  while (node?.parentCode) {
    node = byCode.get(node.parentCode);
    if (!node) break;
    result.unshift(node);
  }
  return result;
}

function icdPayload(url) {
  const view = String(url.searchParams.get('view') || '');
  const q = String(url.searchParams.get('q') || '').toLowerCase();
  const parent = String(url.searchParams.get('parent') || '');
  const chapter = String(url.searchParams.get('chapter') || '');
  if (!view) return null;
  if (view === 'meta') return { meta:icdMeta };
  if (view === 'nav') return { meta:icdMeta, chapters:icdNodes.filter(node => node.level === 'chapter'), blocks:icdNodes.filter(node => node.level === 'block') };
  if (view === 'children') {
    const parentNode = icdNodes.find(node => node.code === parent) || null;
    const direct = icdNodes.filter(node => node.parentCode === parent);
    return { meta:icdMeta, parent:parentNode, ancestors:parentNode ? icdAncestors(parent) : [], rows:direct, total:direct.length };
  }
  if (view === 'resolve') {
    const code = String(url.searchParams.get('code') || parent);
    const node = icdNodes.find(item => item.code === code) || null;
    return { meta:icdMeta, node, ancestors:node ? icdAncestors(code) : [] };
  }
  let result = icdNodes.slice();
  if (view !== 'suggest') result = result.filter(node => ['category', 'subcategory'].includes(node.level));
  if (parent) result = result.filter(node => node.parentCode === parent);
  if (chapter) result = result.filter(node => node.chapter === chapter);
  const levels = String(url.searchParams.get('levels') || '').split(',').filter(Boolean);
  if (levels.length) result = result.filter(node => levels.includes(node.level));
  if (q) result = result.filter(node => `${node.code} ${node.displayTitle} ${node.englishTitle}`.toLowerCase().includes(q));
  if (view === 'suggest') result = result.slice(0, 12);
  const pageSize = view === 'suggest' ? 12 : Math.max(1, Number(url.searchParams.get('pageSize') || 50));
  const page = view === 'suggest' ? 1 : Math.max(1, Number(url.searchParams.get('page') || 1));
  const total = result.length;
  const context = parent ? icdNodes.find(node => node.code === parent) || null : null;
  return {
    meta:icdMeta,
    page,
    pageSize,
    total,
    totalPages:Math.max(1, Math.ceil(total / pageSize)),
    rows:result.slice((page - 1) * pageSize, page * pageSize),
    context,
    ancestors:context ? icdAncestors(context.code) : [],
  };
}

const TYPES = {
  '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.txt':'text/plain; charset=utf-8', '.svg':'image/svg+xml',
  '.webmanifest':'application/manifest+json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY',
  'Referrer-Policy':'no-referrer',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  'Content-Security-Policy':"default-src 'self'; base-uri 'self'; frame-ancestors 'none'; frame-src 'none'; form-action 'self'; object-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; media-src 'self'; worker-src 'self'; manifest-src 'self'",
};

function send(res, status, body, type = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type':type, 'Cache-Control':'no-store', ...headers });
  res.end(body);
}

function safeFile(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split('?')[0]);
  const relative = cleanPath === '/' ? 'index.html' : cleanPath.replace(/^\/+/, '');
  const file = path.resolve(ROOT, relative);
  return file.startsWith(ROOT + path.sep) ? file : null;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/auth') {
    if (req.method === 'GET') return send(res, 200, JSON.stringify({ authenticated:true, sessionHours:8, hardened:true }), 'application/json; charset=utf-8');
    if (req.method === 'DELETE') return send(res, 200, JSON.stringify({ ok:true }), 'application/json; charset=utf-8');
  }
  if (url.pathname === '/api/registry' || url.pathname === '/data/registry-data.js') {
    return send(res, 200, registryBody, 'application/javascript; charset=utf-8', { ETag:'"browser-registry"' });
  }
  if (url.pathname === '/api/dosage') return send(res, 200, JSON.stringify(dosage), 'application/json; charset=utf-8');
  if (url.pathname === '/api/icd') {
    const data = icdPayload(url);
    if (data) return send(res, 200, JSON.stringify({ ok:true, data }), 'application/json; charset=utf-8');
    return send(res, 503, JSON.stringify({ error:'Use full hierarchy test views' }), 'application/json; charset=utf-8');
  }
  if (url.pathname === '/api/drug-search') {
    const q = String(url.searchParams.get('q') || '').toLowerCase();
    const results = rows.filter(row => `${row['Substanca aktive']} ${row['Emri tregtar']}`.toLowerCase().includes(q)).map(row => ({
      key:`${row.PDID}|${row.ProtocolNo}|${row['Emri tregtar']}|${row['Fortësia']}`,
      tradeName:row['Emri tregtar'], substance:row['Substanca aktive'], strength:row['Fortësia'],
      form:row['Forma farmaceutike'], packaging:row['Madhësia e paketimit'], atc:row['ATC Code'],
      pdid:row.PDID, protocolNo:row.ProtocolNo, qualityStatus:'verified',
      prescriptionLine:row.__prescriptionLine, prescriptionNotation:`${row.__prescriptionLine} — ${row.__packagingSummary}`,
      packagingSummary:row.__packagingSummary, dispense:row.__dispense, route:row.__prescriptionRoute,
      sheetPrescriptionNotation:row.__sheetPrescriptionNotation,
    }));
    return send(res, 200, JSON.stringify({ ok:true, results }), 'application/json; charset=utf-8');
  }
  if (url.pathname === '/api/gemini-prescription') return send(res, 503, JSON.stringify({ error:'Offline browser test', code:'GEMINI_NOT_CONFIGURED' }), 'application/json; charset=utf-8');

  const file = safeFile(url.pathname);
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Not found');
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type':type, 'Cache-Control':'no-cache', 'Service-Worker-Allowed':'/' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => console.log(`Clinical smoke server listening on ${PORT}`));
