const crypto = require('node:crypto');

const EXPECTED_PHOTO_TESTS = 110;
const DISALLOWED_EXTRA_IDS = new Set(['ferritin', 'b12', 'egfr', 'hba1c', 'tsh', 'ft4']);

function loadDataset() {
  const previousWindow = global.window;
  const holder = {};
  try {
    global.window = holder;
    delete require.cache[require.resolve('../lab-data.js')];
    require('../lab-data.js');
  } finally {
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  }

  const source = holder.MEDINDEX_LABS;
  if (!source || !Array.isArray(source.systems) || !Array.isArray(source.tests)) {
    throw new Error('Dataset-i laboratorik nuk u ngarkua në format të vlefshëm.');
  }

  if (!/Vetëm analizat/i.test(String(source.sourcePolicy || ''))) {
    throw new Error('Dataset-i laboratorik nuk është i kyçur vetëm te fotografitë e aprovuara.');
  }

  // Ruaj të gjitha vlerat dhe njësitë pikërisht siç janë transkriptuar nga burimi.
  // Pa plotësime automatike ose korrigjime të heshtura në API.
  const tests = source.tests.map(test => ({ ...test }));

  if (tests.length !== EXPECTED_PHOTO_TESTS) {
    throw new Error(`Dataset-i duhet të ketë saktësisht ${EXPECTED_PHOTO_TESTS} analiza nga fotografitë; u gjetën ${tests.length}.`);
  }

  const systems = new Set(source.systems.map(item => String(item.id || '').trim()).filter(Boolean));
  const ids = new Set();
  const issues = [];
  const required = ['id', 'system', 'name', 'specimen', 'reference', 'sourceLabel'];

  tests.forEach((test, index) => {
    required.forEach(field => {
      if (!String(test[field] ?? '').trim()) issues.push(`Rreshti ${index + 1}: mungon ${field}`);
    });
    if (ids.has(test.id)) issues.push(`ID e dyfishtë: ${test.id}`);
    ids.add(test.id);
    if (!systems.has(test.system)) issues.push(`Sistem i panjohur: ${test.system}`);
    if (DISALLOWED_EXTRA_IDS.has(test.id)) issues.push(`Analizë jashtë fotografive: ${test.id}`);
  });

  if (issues.length) {
    throw new Error(`Dataset-i laboratorik dështoi auditin: ${issues.slice(0, 8).join('; ')}`);
  }

  const data = {
    ...source,
    tests,
    sourceLocked: true,
    sourceTestCount: EXPECTED_PHOTO_TESTS,
    sourceUnitPolicy: 'preserve-exact-transcription',
  };

  return Object.freeze({
    ...data,
    audit: {
      totalTests: tests.length,
      totalSystems: data.systems.length,
      withReference: tests.filter(test => String(test.reference || '').trim() && !/^nuk është shënuar/i.test(String(test.reference).trim())).length,
      withoutReference: tests.filter(test => !String(test.reference || '').trim() || /^nuk është shënuar/i.test(String(test.reference).trim())).length,
      sourceLocked: true,
      sourceUnitPolicy: data.sourceUnitPolicy,
    },
  });
}

const DATASET = loadDataset();
const BODY = JSON.stringify({ ok: true, data: DATASET });
const ETAG = `"${crypto.createHash('sha256').update(BODY).digest('base64url')}"`;

async function authorized(req) {
  const auth = await import('../lib/auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

module.exports = async function handler(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Metoda nuk lejohet.' });
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('ETag', ETAG);

  if (!(await authorized(req))) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(401).json({ error: 'Kërkohet autentikim.' });
  }

  if (req.headers['if-none-match'] === ETAG) return res.status(304).end();
  res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=3600');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-MedIndex-Lab-Tests', String(DATASET.tests.length));
  res.setHeader('X-MedIndex-Lab-Source', 'user-provided-kosovo-forms');
  res.setHeader('X-MedIndex-Lab-Unit-Policy', DATASET.sourceUnitPolicy);
  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).send(BODY);
};