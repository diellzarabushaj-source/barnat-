'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MARKER = 'registry-personal-supabase-owner-v1';
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, source) => fs.writeFileSync(path.join(ROOT, file), source.replace(/\r\n?/g, '\n'), 'utf8');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const at = source.indexOf(before);
  if (at < 0) throw new Error(`${MARKER}: ${label} anchor not found.`);
  return source.slice(0, at) + after + source.slice(at + before.length);
}

function replaceBlock(source, startNeedle, endNeedle, replacement, label) {
  const start = source.indexOf(startNeedle);
  if (start < 0) throw new Error(`${MARKER}: ${label} start not found.`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) throw new Error(`${MARKER}: ${label} end not found.`);
  return source.slice(0, start) + replacement + source.slice(end);
}

function enrichListProjection(source) {
  const startNeedle = 'const REGISTRY_LIST_SELECT = [';
  const closing = "].join(',');";
  const start = source.indexOf(startNeedle);
  if (start < 0) throw new Error(`${MARKER}: registry list projection start not found.`);
  const end = source.indexOf(closing, start + startNeedle.length);
  if (end < 0) throw new Error(`${MARKER}: registry list projection end not found.`);

  const existing = source.slice(start, end);
  const required = [
    'id', 'registry_number', 'protocol_no', 'pdid', 'trade_name', 'active_substance',
    'atc_code', 'drug_class', 'use_text', 'strength', 'pharmaceutical_form', 'packaging',
    'marketing_authorization_holder', 'manufacturer', 'ma_certificate', 'product_status',
    'wholesale_price', 'wholesale_with_margin', 'vat_text', 'retail_price', 'validity_text',
    'approved_population', 'pediatric_dose_summary', 'pediatric_use_status',
    'pediatric_verification_status',
  ];
  const additions = required
    .filter(field => !existing.includes(`'${field}'`))
    .map(field => `  '${field}',\n`)
    .join('');
  if (!additions) return source;

  // Insert only inside REGISTRY_LIST_SELECT. Phase 14 intentionally places its
  // column-lite runtime marker between this projection and REGISTRY_DETAIL_SELECT;
  // never replace that interstitial build-owned region.
  return source.slice(0, end) + additions + source.slice(end);
}

function patchApi() {
  const file = 'api/drug-search.js';
  let source = read(file);

  if (!source.includes("const PersonalRegistry = require('../lib/personal-registry-supabase.js');")) {
    source = replaceOnce(
      source,
      "const { neonRequest, exactCount } = require('../lib/neon-data-api.js');\n",
      "const { neonRequest, exactCount } = require('../lib/neon-data-api.js');\nconst PersonalRegistry = require('../lib/personal-registry-supabase.js');\n",
      'Supabase personal resolver import',
    );
  }

  source = enrichListProjection(source);

  const richerRowMapper = `function rowForRegistryList(row) {
  return {
    id:clean(row.id),
    registryNumber:row.registry_number ?? null,
    protocolNo:clean(row.protocol_no),
    pdid:clean(row.pdid),
    tradeName:clean(row.trade_name),
    activeSubstance:clean(row.active_substance),
    atc:clean(row.atc_code),
    drugClass:clean(row.drug_class),
    use:clean(row.use_text),
    strength:clean(row.strength),
    form:clean(row.pharmaceutical_form),
    prescriptionNotation:registryPrescriptionNotation(row),
    packaging:clean(row.packaging),
    marketingAuthorizationHolder:clean(row.marketing_authorization_holder),
    manufacturer:clean(row.manufacturer),
    maCertificate:clean(row.ma_certificate),
    productStatus:clean(row.product_status),
    wholesalePrice:row.wholesale_price ?? null,
    wholesaleWithMargin:row.wholesale_with_margin ?? null,
    vat:clean(row.vat_text),
    retailPrice:row.retail_price ?? null,
    validity:clean(row.validity_text),
    approvedPopulation:clean(row.approved_population),
    pediatricDoseSummary:clean(row.pediatric_dose_summary),
    pediatricUseStatus:clean(row.pediatric_use_status),
    pediatricVerificationStatus:clean(row.pediatric_verification_status),
  };
}

`;
  source = replaceBlock(
    source,
    'function rowForRegistryList(row) {',
    'function rowForRegistryDetail(row) {',
    richerRowMapper,
    'rich registry row mapper',
  );

  const personalEndpoint = `// ${MARKER}: Supabase-owned personal rows
function personalTextMatchSupabase(row, rawQuery) {
  const query = normalize(registrySearchTerm(rawQuery));
  if (query.length < 2) return true;
  const tokens = query.split(/\\s+/).filter(Boolean);
  const haystack = normalize([
    row?.trade_name, row?.active_substance, row?.atc_code, row?.drug_class,
    row?.use_text, row?.strength, row?.pharmaceutical_form, row?.pdid,
    row?.protocol_no, row?.approved_population,
  ].join(' '));
  return tokens.every(token => haystack.includes(token));
}

function personalSortValueSupabase(row, sort) {
  if (sort === 'registry') {
    const numeric = Number(row?.registry_number);
    return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
  }
  const fields = {
    name:'trade_name', substance:'active_substance', atc:'atc_code',
    strength:'strength', form:'pharmaceutical_form', status:'product_status', price:'retail_price',
  };
  const value = row?.[fields[sort] || 'registry_number'];
  if (sort === 'price') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
  }
  return clean(value).toLocaleLowerCase('sq');
}

async function sendRegistryPersonal(req, res, startedAt) {
  const body = personalBody(req);
  const mode = clean(body.mode).toLowerCase() === 'notes' ? 'notes' : 'favorites';
  const page = integerInRange(body.page, 1, 1, 100000);
  const pageSize = integerInRange(body.pageSize, REGISTRY_DEFAULT_PAGE_SIZE, 1, REGISTRY_MAX_PAGE_SIZE);
  const status = exactFilter(body.status);
  const formExact = exactFilter(body.formExact);
  const formCategory = clean(body.formCategory).slice(0, 80);
  const sort = clean(body.sort).toLowerCase();
  const direction = clean(body.direction).toLowerCase() === 'desc' ? 'desc' : 'asc';

  const resolved = await PersonalRegistry.resolvePersonalDrugRows(req, mode);
  let matched = Array.isArray(resolved?.rows) ? resolved.rows : [];
  if (status) matched = matched.filter(row => clean(row?.product_status) === status);
  const categoryForms = registryFormCategoryValues(formCategory);
  if (formExact) matched = matched.filter(row => clean(row?.pharmaceutical_form) === formExact);
  else if (categoryForms.length) matched = matched.filter(row => categoryForms.includes(clean(row?.pharmaceutical_form)));
  if (clean(body.q).length >= 2) matched = matched.filter(row => personalTextMatchSupabase(row, body.q));

  matched.sort((a, b) => {
    const av = personalSortValueSupabase(a, sort || 'registry');
    const bv = personalSortValueSupabase(b, sort || 'registry');
    let compared = 0;
    if (typeof av === 'number' && typeof bv === 'number') compared = av - bv;
    else compared = String(av).localeCompare(String(bv), 'sq', { numeric:true, sensitivity:'base' });
    if (!compared) compared = Number(a?.registry_number || 0) - Number(b?.registry_number || 0);
    return direction === 'desc' ? -compared : compared;
  });

  const total = matched.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;
  const rows = matched.slice(offset, offset + pageSize).map(rowForRegistryList);

  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Server-Timing', 'registrypersonal;dur=' + (Date.now() - startedAt));
  res.setHeader('X-MedIndex-Data-Source', 'supabase-personal');
  return res.status(200).json({
    ok:true, rows, personal:true, mode,
    membershipCount:Array.isArray(resolved?.keys) ? resolved.keys.length : total,
    pagination:{ page:safePage, pageSize, total, totalPages, hasPrevious:safePage > 1, hasNext:safePage < totalPages },
    query:{ q:clean(body.q), status, formExact, formCategory, sort:sort || 'registry', direction },
  });
}

`;
  source = replaceBlock(
    source,
    'async function sendRegistryPersonal(req, res, startedAt) {',
    'async function sendRegistryPage(req, res, startedAt) {',
    personalEndpoint,
    'Supabase personal endpoint',
  );

  source = source.replace(
    "      return res.status(500).json({ error:'Favoritet ose Shënimet nuk u ngarkuan.' });",
    "      const status = Number(error?.status || 500);\n      return res.status(status >= 400 && status < 600 ? status : 500).json({ error:status === 401 ? 'Kërkohet autentikim.' : 'Favoritet ose Shënimet nuk u ngarkuan.' });",
  );
  source = source.replace("res.setHeader('X-MedIndex-Data-Source', 'neon');", "res.setHeader('X-MedIndex-Data-Source', 'supabase');");

  const personalStart = source.indexOf(`// ${MARKER}: Supabase-owned personal rows`);
  const pageStart = source.indexOf('async function sendRegistryPage', personalStart);
  const personalBlock = source.slice(personalStart, pageStart);
  if (personalStart < 0 || pageStart < 0) throw new Error(`${MARKER}: final personal endpoint is missing.`);
  if (personalBlock.includes('registryHandler.getRegistryDataset()')) throw new Error(`${MARKER}: personal endpoint still depends on the legacy registry dataset.`);
  if (personalBlock.includes('personalIdentifiers(req)')) throw new Error(`${MARKER}: browser identifiers still authorize personal membership.`);
  if (!personalBlock.includes('PersonalRegistry.resolvePersonalDrugRows(req, mode)')) throw new Error(`${MARKER}: Supabase personal resolver is not authoritative.`);
  if (!source.includes("REGISTRY_COLUMN_LITE_RUNTIME = 'phase14-column-lite-v1'")) throw new Error(`${MARKER}: Phase 14 column-lite marker was lost.`);

  write(file, source);
}

function patchDesktopLite() {
  const file = 'registry-desktop-lite.js';
  let source = read(file);

  const canonical = `  function canonicalRow(row) {
    return {
      'Nr rendor':row.registryNumber ?? '',
      'PDID':clean(row.pdid),
      'ProtocolNo':clean(row.protocolNo),
      'Emri tregtar':clean(row.tradeName),
      'Substanca aktive':clean(row.activeSubstance),
      'ATC Code':clean(row.atc),
      'Klasa / Çka është':clean(row.drugClass),
      'Përdorimi (fjalë kyçe)':clean(row.use),
      'Fortësia':clean(row.strength),
      'Forma farmaceutike':clean(row.form),
      'Si të shënohet në recetë':clean(row.prescriptionNotation),
      'Madhësia e paketimit':clean(row.packaging),
      'Bartësi i Autorizim Marketingut':clean(row.marketingAuthorizationHolder),
      'Prodhuesi':clean(row.manufacturer),
      'MA certifikata':clean(row.maCertificate),
      'Statusi':clean(row.productStatus),
      'Çmimi me shumicë':row.wholesalePrice ?? '',
      'Çmimi me marzhë':row.wholesaleWithMargin ?? '',
      'TVSH':clean(row.vat),
      'Çmimi me pakicë':row.retailPrice ?? '',
      'Afati i vlefshmërisë':clean(row.validity),
      'Popullata e aprovuar':clean(row.approvedPopulation),
      'Doza pediatrike — përmbledhje':clean(row.pediatricDoseSummary),
      'Statusi i përdorimit pediatrik':clean(row.pediatricUseStatus),
      'Statusi i verifikimit pediatrik':clean(row.pediatricVerificationStatus),
      __neonDrugId:clean(row.id),
      __qualityStatus:'verified',
      __registryPartial:true,
    };
  }

`;
  source = replaceBlock(source, '  function canonicalRow(row) {', '  function drugKey(row) {', canonical, 'full canonical row contract');

  if (!source.includes(`${MARKER}: sync membership before read`)) {
    source = replaceOnce(
      source,
      '  async function fetchPersonalLogicalPage({ signal } = {}) {\n',
      `  async function fetchPersonalLogicalPage({ signal } = {}) {\n    // ${MARKER}: sync membership before read\n    // Flush the local favorite/note mutation first, then read the authoritative\n    // per-user subset from Supabase. No hard refresh or stale DOM hydration.\n    const syncNow = window.MedIndexUserLibrary?.syncNow;\n    if (typeof syncNow === 'function' && navigator.onLine) {\n      try {\n        await Promise.race([\n          Promise.resolve(syncNow.call(window.MedIndexUserLibrary)),\n          new Promise(resolve => window.setTimeout(resolve, 1600)),\n        ]);\n      } catch {}\n    }\n`,
      'membership sync before personal read',
    );
  }

  source = source.replace(
    '        identifiers:state.personalIdentifiers, page:state.page, pageSize:state.pageSize,',
    '        mode:state.personalMode, page:state.page, pageSize:state.pageSize,',
  );

  if (!source.includes(`${MARKER}: self-heal restored personal view`)) {
    source = replaceOnce(
      source,
      "    window.addEventListener('medindex:registry-full-dataset-needed', event => {",
      `    // ${MARKER}: self-heal restored personal view\n    window.addEventListener('pageshow', event => {\n      if (event.persisted && isPersonalView() && !state.disabled) void loadPage({ includeTotal:true, scroll:false });\n    });\n    document.addEventListener('visibilitychange', () => {\n      if (document.visibilityState === 'visible' && isPersonalView() && !state.disabled) void loadPage({ includeTotal:true, scroll:false });\n    });\n\n    window.addEventListener('medindex:registry-full-dataset-needed', event => {`,
      'personal BFCache/visibility refresh',
    );
  }

  if (!source.includes("'Si të shënohet në recetë':clean(row.prescriptionNotation)")) {
    throw new Error(`${MARKER}: prescription notation is not carried into the canonical table row.`);
  }
  const personalFetchAt = source.indexOf('async function fetchPersonalLogicalPage');
  const personalFetchEnd = source.indexOf('  function setBusy', personalFetchAt);
  const fetchBlock = source.slice(personalFetchAt, personalFetchEnd);
  if (!fetchBlock.includes('mode:state.personalMode')) throw new Error(`${MARKER}: personal request does not send its server-owned mode.`);
  if (fetchBlock.includes('identifiers:state.personalIdentifiers')) throw new Error(`${MARKER}: personal request still sends membership identifiers as authority.`);
  if (!fetchBlock.includes('MedIndexUserLibrary?.syncNow')) throw new Error(`${MARKER}: local membership is not flushed before Supabase read.`);

  write(file, source);
}

patchApi();
patchDesktopLite();
console.log(`${MARKER}: Favorites/Notes now resolve from authenticated Supabase membership and hydrate the exact Barnat row contract.`);
