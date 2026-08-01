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
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const relative = clean === '/' ? 'index.html' : clean.replace(/^\/+/, '');
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
  if (url.pathname === '/api/icd') return send(res, 503, JSON.stringify({ error:'Use embedded test data' }), 'application/json; charset=utf-8');
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
