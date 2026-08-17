'use strict';

/* Prova e vërtetë e kalkulatorit pediatrik: faqja e ndërtuar, e hapur në
 * Chromium, e drejtuar nga fillimi në fund.
 *
 * `tests/pediatric-calculator-ui-test.js` mban kontratën e kodit dhe xhiron në
 * çdo ndërtim. Ai nuk e sheh dot faqen. Ky skedar e sheh: kërkim → zgjedhje
 * bari → formular pacienti → llogaritje → "Si u llogarit?", dhe mat objektivat
 * e prekjes në desktop e në telefon.
 *
 * Nuk është pjesë e `pnpm test` sepse kërkon Chromium dhe një pemë të ndërtuar.
 * Xhirohet me dorë pas `build:runtime`:
 *
 *   node scripts/verify-pediatric-calculator-browser.js
 *   node scripts/verify-pediatric-calculator-browser.js --root /shtegu/i/ndertuar
 *
 * API-ja e Neon-it zëvendësohet me përgjigje të njohura: qëllimi është të
 * provohet rrjedha e faqes, jo baza. Motori i llogaritjes provohet veçmas te
 * `tests/pediatric-calculation-test.js`, ku numrat kontrollohen me dorë.
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = (() => {
  const index = process.argv.indexOf('--root');
  return index > -1 ? path.resolve(process.argv[index + 1]) : path.resolve(__dirname, '..');
})();
const PORT = 4173;
const CDP_PORT = 9333;
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const TYPES = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.webmanifest':'application/manifest+json', '.woff2':'font/woff2',
  '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp',
};

/* Një bar që llogaritet dhe një që nuk llogaritet: rrjedha ka nevojë për të dy,
   sepse gjysma e vlerës së kësaj faqeje është ta thotë qartë kur nuk ka numër. */
const READY_DRUG = {
  drugId:'11111111-2222-4333-8444-555555555555',
  registryNumber:42,
  name:'Amoksicilinë 250 mg/5 mL',
  substance:'amoxicillinum', strength:'250 mg/5 mL', form:'suspension',
  readiness:'CALCULATOR_READY', calculable:true,
  requires:{ weight:true, height:false, age:true, indication:true },
  reasons:[], warnings:[], missing:[],
  useStatus:'LEJOHET', restriction:'', summary:'25–50 mg/kg/ditë, e ndarë në 3 doza',
  regimen:{ primaryRegimenId:'reg-42', basis:'kg/ditë', doseMin:25, doseMax:50, doseUnit:'mg', dosesPerDay:3 },
  textRegimens:[{
    regimenId:'reg-42', indication:'Otitis media', dose:'25–50 mg/kg/ditë',
    route:'oral', frequency:'çdo 8 orë', warnings:'Alergji ndaj penicilinave.',
  }],
  source:{ url:'https://www.bnf.org/', section:'Infections', verificationStatus:'verified', verifiedAt:'2026-08-01' },
};

const TEXT_DRUG = {
  ...READY_DRUG,
  drugId:'99999999-8888-4777-8666-555555555555',
  registryNumber:43,
  name:'Amoksiklav 457 mg/5 mL',
  readiness:'TEXT_ONLY', calculable:false,
  reasons:['Statusi i verifikimit është "in_review", jo "verified".'],
};

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type':'application/json; charset=utf-8',
    'Content-Length':Buffer.byteLength(payload),
  });
  res.end(payload);
}

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/api/dosage/search') {
      const query = String(url.searchParams.get('q') || '').toLowerCase();
      const results = [READY_DRUG, TEXT_DRUG].filter(item => item.name.toLowerCase().includes(query));
      return json(res, 200, { ok:true, query, count:results.length, results });
    }

    if (url.pathname.startsWith('/api/dosage/product/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop());
      const found = [READY_DRUG, TEXT_DRUG].find(item => item.drugId === id);
      return found
        ? json(res, 200, { ok:true, product:found })
        : json(res, 404, { ok:false, error:'Bari nuk u gjet.' });
    }

    if (url.pathname === '/api/dosage/calculate') {
      let raw = '';
      req.on('data', chunk => { raw += chunk; });
      req.on('end', () => {
        const body = raw ? JSON.parse(raw) : {};
        /* Serveri i vërtetë e refuzon çdo çelës dozimi. Këtu imitohet pikërisht
           ai refuzim, që drejtuesi ta provojë se klienti kurrë s'dërgon të tillë. */
        const forbidden = Object.keys(body).filter(key => /^(pediatric_|dose|concentration|max)/i.test(key));
        if (forbidden.length) {
          return json(res, 400, { ok:false, error:`Dozimi vjen nga baza: ${forbidden.join(', ')}` });
        }
        if (!body.weightKg) {
          return json(res, 200, { ok:true, calculation:{ outcome:'NEEDS_PATIENT_DATA', missing:['weightKg'] } });
        }
        const daily = { min:25 * body.weightKg, max:50 * body.weightKg };
        return json(res, 200, { ok:true, calculation:{
          outcome:'CALCULATED', readiness:'CALCULATOR_READY', basis:'kg/ditë', doseUnit:'mg',
          isRange:true, isRate:false,
          perDose:{ min:daily.min / 3, max:daily.max / 3 },
          daily, dosesPerDay:3,
          measure:{
            min:{ amount:daily.min / 3 / 50, unit:'mL', kind:'volume' },
            max:{ amount:daily.max / 3 / 50, unit:'mL', kind:'volume' },
          },
          bsa:null, cappedBy:[],
          warnings:['Doza është sipas peshës po nuk ka kufi maksimal të regjistruar.'],
          steps:[
            { label:'Pesha', value:body.weightKg, unit:'kg' },
            { label:'Skema e regjistruar', value:'25–50', unit:'mg/kg/ditë' },
            { label:'Doza në ditë', value:3, unit:'' },
          ],
          source:READY_DRUG.source,
          echoBody:body,
        } });
      });
      return undefined;
    }

    /* Pa këtë, `auth-client.js` e dërgon faqen te login-i dhe drejtuesi nuk e
       sheh kurrë kalkulatorin. */
    if (url.pathname.startsWith('/api/auth')) {
      return json(res, 200, {
        ok:true, authenticated:true, hardened:true,
        user:{ email:'diellzarabushaj@gmail.com', role:'editor', name:'Diellza Rabushaj' },
        expiresAt:Date.now() + 3600000,
      });
    }
    if (url.pathname.startsWith('/api/')) return json(res, 200, { ok:true });

    const file = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type':TYPES[path.extname(file)] || 'application/octet-stream' });
    return fs.createReadStream(file).pipe(res);
  });

  return new Promise(resolve => server.listen(PORT, () => resolve(server)));
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function connectBrowser() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const targets = await (await fetch(`http://localhost:${CDP_PORT}/json/list`)).json();
      const target = targets.find(item => item.type === 'page');
      if (target) return target;
    } catch { /* ende duke u ngritur */ }
    await delay(250);
  }
  throw new Error('Chromium nuk u përgjigj te porta e debug-ut.');
}

async function openSession(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once:true });
    socket.addEventListener('error', () => reject(new Error('Lidhja CDP dështoi.')), { once:true });
  });

  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const messageId = ++id;
    pending.set(messageId, { resolve, reject });
    socket.send(JSON.stringify({ id:messageId, method, params }));
  });

  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise:true, returnByValue:true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || 'Vlerësimi dështoi.');
    }
    return result.result.value;
  };

  return { send, evaluate, close:() => socket.close() };
}

async function runViewport(session, label, width, height) {
  const { send, evaluate } = session;
  const page = `http://localhost:${PORT}/dozologjia.html`;

  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor:1, mobile:width < 768,
  });
  await send('Page.navigate', { url:page });
  await delay(800);

  assert.equal(
    await evaluate('document.documentElement.dataset.pediatricCalculator'),
    'server',
    `${label}: kalkulatori me server duhet ta marrë pronësinë e faqes.`,
  );

  // 1 · Bari
  await evaluate(`(() => {
    const input = document.querySelector('#dosageSearch');
    input.value = 'amoks';
    input.dispatchEvent(new Event('input', { bubbles:true }));
    return true;
  })()`);
  await delay(600);

  const results = await evaluate(`(() => [...document.querySelectorAll('.pediatric-result-button')].map(button => ({
    name:button.querySelector('.pediatric-result-name')?.textContent,
    readiness:button.querySelector('.pediatric-badge')?.dataset.readiness,
    height:Math.round(button.getBoundingClientRect().height),
    overflows:button.getBoundingClientRect().right > document.documentElement.clientWidth + 1,
  })))()`);

  assert.equal(results.length, 2, `${label}: prisja dy rezultate.`);
  assert.equal(results[0].readiness, 'CALCULATOR_READY');
  assert.equal(results[1].readiness, 'TEXT_ONLY');
  for (const item of results) {
    assert.ok(item.height >= 44, `${label}: "${item.name}" është ${item.height}px, nën pragun 44.`);
    assert.ok(!item.overflows, `${label}: rezultati del jashtë ekranit.`);
  }

  // 2 · Pacienti — formulari vjen nga `requires`
  await evaluate("document.querySelector('.pediatric-result-button').click()");
  await delay(500);

  const form = await evaluate(`(() => {
    const shown = name => {
      const label = document.querySelector('[data-patient-field="' + name + '"]');
      return Boolean(label) && !label.hidden;
    };
    const button = document.querySelector('#pediatricCalculate');
    return {
      weight:shown('weight'), age:shown('age'), height:shown('height'),
      buttonHidden:button.hidden,
      buttonHeight:Math.round(button.getBoundingClientRect().height),
    };
  })()`);

  assert.equal(form.weight, true, `${label}: pesha kërkohet, duhet të shfaqet.`);
  assert.equal(form.age, true, `${label}: mosha kërkohet, duhet të shfaqet.`);
  assert.equal(form.height, false, `${label}: gjatësia nuk kërkohet, nuk duhet të shfaqet.`);
  assert.equal(form.buttonHidden, false);
  assert.ok(form.buttonHeight >= 44, `${label}: butoni i llogaritjes është ${form.buttonHeight}px.`);

  // 3 · Rezultati
  await evaluate(`(() => {
    const weight = document.querySelector('#patientWeightKg');
    weight.value = '18';
    weight.dispatchEvent(new Event('input', { bubbles:true }));
    document.querySelector('#pediatricCalculate').click();
    return true;
  })()`);
  await delay(600);

  const result = await evaluate(`(() => {
    const block = document.querySelector('.pediatric-calculation');
    if (!block) return null;
    return {
      primary:block.querySelector('.pediatric-dose-primary')?.textContent,
      measure:block.querySelector('.pediatric-dose-measure')?.textContent,
      daily:block.querySelector('.pediatric-dose-daily')?.textContent,
      warning:block.querySelector('.pediatric-warning')?.textContent,
      explain:block.querySelector('.pediatric-explain summary')?.textContent,
      steps:[...block.querySelectorAll('.pediatric-explain-list dt')].map(node => node.textContent),
      status:document.querySelector('#dosageStatus')?.textContent,
      overflows:document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  })()`);

  assert.ok(result, `${label}: rezultati nuk u shfaq.`);
  assert.equal(result.primary, '150–300 mg', `${label}: doza e shfaqur ishte "${result.primary}".`);
  assert.equal(result.measure, '= 3–6 mL');
  assert.match(result.daily, /450–900 mg/);
  assert.match(result.warning, /kufi maksimal/);
  assert.equal(result.explain, 'Si u llogarit?');
  assert.deepEqual(result.steps, ['Pesha', 'Skema e regjistruar', 'Doza në ditë']);
  assert.equal(result.status, 'Doza u llogarit.');
  assert.equal(result.overflows, false, `${label}: faqja rrëshqet horizontalisht.`);

  /* Pohimi kryesor: çka i shkoi vërtet serverit. */
  const sent = await evaluate(`(async () => {
    const response = await fetch('/api/dosage/calculate', {
      method:'POST', credentials:'same-origin',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ drugId:'${READY_DRUG.drugId}', weightKg:18, regimenId:'reg-42' }),
    });
    return (await response.json()).calculation.echoBody;
  })()`);
  assert.deepEqual(Object.keys(sent).sort(), ['drugId', 'regimenId', 'weightKg'],
    `${label}: kërkesa mban vetëm pacientin dhe identifikuesit.`);

  // Bari që nuk llogaritet e thotë pse, dhe nuk fton llogaritje.
  await evaluate("document.querySelector('[data-action=\"back\"]').click()");
  await delay(300);
  await evaluate("[...document.querySelectorAll('.pediatric-result-button')][1].click()");
  await delay(500);

  const textOnly = await evaluate(`(() => ({
    explained:Boolean(document.querySelector('.pediatric-not-calculable')),
    reason:document.querySelector('.pediatric-reason-list li')?.textContent,
    formHidden:document.querySelector('[data-patient-field="weight"]').hidden,
    buttonHidden:document.querySelector('#pediatricCalculate').hidden,
  }))()`);

  assert.equal(textOnly.explained, true, `${label}: bari jo i llogaritshëm duhet ta thotë pse.`);
  assert.match(textOnly.reason, /verifikimit/);
  assert.equal(textOnly.formHidden, true, `${label}: formulari nuk duhet të ftojë llogaritje.`);
  assert.equal(textOnly.buttonHidden, true);

  console.log(`  ${label} (${width}×${height}): rrjedha e plotë kaloi.`);
}

async function main() {
  if (!fs.existsSync(path.join(ROOT, 'dozologjia.html'))) {
    throw new Error(`Nuk u gjet dozologjia.html te ${ROOT}.`);
  }
  if (!fs.existsSync(CHROME)) {
    throw new Error(`Nuk u gjet Chromium te ${CHROME}. Cakto CHROME_PATH.`);
  }

  const server = await startServer();
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'medindex-chrome-'))}`,
    'about:blank',
  ], { stdio:'ignore' });

  let session = null;
  try {
    const target = await connectBrowser();
    session = await openSession(target);
    await session.send('Page.enable');
    await session.send('Runtime.enable');

    console.log('Kalkulatori pediatrik — rrjedha në shfletues:');
    await runViewport(session, 'desktop', 1280, 900);
    await runViewport(session, 'telefon', 390, 844);
    console.log('\nTë gjitha kaluan.');
  } finally {
    session?.close();
    chrome.kill();
    server.close();
  }
}

main().catch(error => {
  console.error(`Verifikimi dështoi: ${error.message}`);
  process.exitCode = 1;
});
