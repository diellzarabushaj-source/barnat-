const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PERFORMANCE_PORT || 4174);
const ROW_COUNT = 4006;

function registryRow(index) {
  const number = index + 1;
  const suffix = String(number).padStart(4, '0');
  const isTarget = number === 3999;
  return {
    'Nr rendor':number,
    PDID:String(50000 + number),
    ProtocolNo:`PD${50000 + number}/010126`,
    'Emri tregtar':isTarget ? 'STRESS DRUG 3999' : `MEDINDEX STRESS ${suffix}`,
    'Substanca aktive':isTarget ? 'Paracetamol' : `Test substance ${suffix}`,
    'ATC Code':isTarget ? 'N02BE01' : `A${String((number % 90) + 10).padStart(2, '0')}AA${String(number % 99).padStart(2, '0')}`,
    'Klasa / Çka është':`Klasë performance ${number % 17}`,
    'Përdorimi (fjalë kyçe)':`indikacion test performance kërkim ${suffix}`,
    'Fortësia':`${(number % 9) + 1}00 mg`,
    'Forma farmaceutike':number % 3 === 0 ? 'Capsule' : 'Tablet',
    'Madhësia e paketimit':String(10 + (number % 30)),
    'Si të shënohet në recetë':`Tab. MedIndex Stress ${suffix} ${(number % 9) + 1}00 mg`,
    'Bartësi i Autorizim Marketingut':`MAH performance ${number % 23}`,
    Prodhuesi:`Prodhues performance ${number % 31}`,
    'MA certifikata':`MA-${suffix}`,
    Statusi:number % 5 === 0 ? 'Origjinator' : 'Gjenerik',
    'Çmimi me shumicë':'1.00',
    'Çmimi me marzhë':'1.10',
    TVSH:'0.08',
    'Çmimi me pakicë':'1.18',
    'Afati i vlefshmërisë':'31.12.2026',
  };
}

const rows = Array.from({ length:ROW_COUNT }, (_, index) => registryRow(index));
const encoded = zlib.gzipSync(Buffer.from(JSON.stringify(rows), 'utf8'), { level:6 }).toString('base64');
const PART_SIZE = 24 * 1024;
const parts = [];
for (let offset = 0; offset < encoded.length; offset += PART_SIZE) parts.push(encoded.slice(offset, offset + PART_SIZE));
const registryMeta = { version:'performance-4006', summary:{ total:ROW_COUNT, verified:ROW_COUNT, blocked:0, warning:0 } };
const registryBody = `window.DRUG_DATA_PARTS = ${JSON.stringify(parts)};\nwindow.REGISTRY_QUALITY_META = ${JSON.stringify(registryMeta)};\n`;

const dosageCards = rows.map(row => ({
  cardKey:[row.PDID, row['Emri tregtar'], row['Fortësia']].join('|'),
  registryNumber:String(row['Nr rendor']),
  nr:String(row['Nr rendor']),
  pdid:row.PDID,
  tradeName:row['Emri tregtar'],
  substance:row['Substanca aktive'],
  atc:row['ATC Code'],
  form:row['Forma farmaceutike'],
  strength:row['Fortësia'],
  drugClass:row['Klasa / Çka është'],
  use:row['Përdorimi (fjalë kyçe)'],
  adultDose:'1 tabletë çdo 8 orë sipas nevojës',
  adultRoute:'Orale',
  pediatricDose:'Kërkon të dhëna klinike individuale',
  pediatricRoute:'Orale',
  sourceUrls:['https://example.test/performance-source'],
  auditedAt:'2026-07-27',
  auditNote:'Synthetic performance fixture',
  status:'VERIFIKUAR',
}));
const dosageBody = JSON.stringify({
  schemaVersion:'performance-v1', matchVersion:'exact-v1', datasetVersion:'performance-4006', mode:'SAFE_VERIFIED_ONLY',
  generatedAt:new Date(0).toISOString(), forms:[], adult:[], pediatric:[], cards:dosageCards,
  meta:{ clinicalAutoFillEnabled:false, publishedForms:0, publishedAdultRegimens:0, publishedPediatricRegimens:0, publishedCards:ROW_COUNT },
});

const doseCalculatorPayload = {
  ok:true,
  meta:{ schemaVersion:'2.0.0', failClosed:true, officialVerifiedOnly:true, generatedAt:'2026-08-13T00:00:00Z' },
  catalog:[],
};
const doseSafetyPayload = {
  ok:true,
  meta:{
    schemaVersion:'2.0.0',
    failClosed:true,
    officialVerifiedOnly:true,
    publishedOnly:true,
    coverageRequired:true,
    generatedAt:'2026-08-13T00:00:00Z',
  },
  catalog:[],
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

function streamSlowly(res, body, type, delayMs = 18, chunkSize = 12 * 1024) {
  res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type':type, 'Cache-Control':'no-store', 'Transfer-Encoding':'chunked' });
  let offset = 0;
  const write = () => {
    if (offset >= body.length) return res.end();
    const end = Math.min(body.length, offset + chunkSize);
    res.write(body.slice(offset, end));
    offset = end;
    setTimeout(write, delayMs);
  };
  setTimeout(write, 250);
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
    return streamSlowly(res, registryBody, 'application/javascript; charset=utf-8');
  }
  if (url.pathname === '/api/dose-calculator') {
    return send(res, 200, JSON.stringify(doseCalculatorPayload), 'application/json; charset=utf-8');
  }
  if (url.pathname === '/api/dosage' && url.searchParams.get('view') === 'safety') {
    return send(res, 200, JSON.stringify(doseSafetyPayload), 'application/json; charset=utf-8');
  }
  if (url.pathname === '/api/dosage' && url.searchParams.get('view') === 'cards') {
    const requested = new Set(String(url.searchParams.get('nr') || '').split(',').map(value => value.trim()).filter(Boolean));
    const cards = requested.size ? dosageCards.filter(card => requested.has(card.registryNumber)) : [];
    const body = JSON.stringify({
      ok:true,
      schemaVersion:'performance-v1',
      matchVersion:'exact-v1',
      datasetVersion:'performance-4006',
      mode:'SAFE_VERIFIED_ONLY',
      generatedAt:new Date(0).toISOString(),
      forms:[], adult:[], pediatric:[], cards,
      meta:{
        clinicalAutoFillEnabled:false,
        publishedForms:0,
        publishedAdultRegimens:0,
        publishedPediatricRegimens:0,
        publishedCards:cards.length,
      },
    });
    return setTimeout(() => send(res, 200, body, 'application/json; charset=utf-8'), 80);
  }
  if (url.pathname === '/api/dosage') {
    return setTimeout(() => streamSlowly(res, dosageBody, 'application/json; charset=utf-8', 8, 32 * 1024), 900);
  }
  if (url.pathname === '/api/icd') return send(res, 503, JSON.stringify({ error:'embedded fixture' }), 'application/json; charset=utf-8');
  if (url.pathname === '/api/drug-search') return send(res, 200, JSON.stringify({ ok:true, results:[] }), 'application/json; charset=utf-8');
  if (url.pathname === '/api/gemini-prescription') return send(res, 503, JSON.stringify({ code:'GEMINI_NOT_CONFIGURED' }), 'application/json; charset=utf-8');

  const file = safeFile(url.pathname);
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Not found');
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type':type, 'Cache-Control':'no-cache', 'Service-Worker-Allowed':'/' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Registry performance server listening on ${PORT}; rows=${ROW_COUNT}; registryBytes=${registryBody.length}; dosageBytes=${dosageBody.length}`);
});
