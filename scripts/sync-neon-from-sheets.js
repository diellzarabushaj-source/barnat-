'use strict';

const crypto = require('node:crypto');
const XLSX = require('xlsx');
const { neonRequest, exactCount } = require('../lib/medindex-data-api.js');

const SOURCES = Object.freeze({
  registry: 'https://drive.usercontent.google.com/download?id=1SY2rb2Eqo3fVkRhgQ8ltJHCRrWyAUDvd&export=download&confirm=t',
  dosage: 'https://docs.google.com/spreadsheets/d/1T7XsfkXLQfEomFL4DmXoA8PheiR6s3Qmu36hTqklOMo/export?format=xlsx',
  icd: 'https://docs.google.com/spreadsheets/d/19ncbnrTJ_w-WQ0msWO9_dUoxjmicSUAz6Nt4sh20gFw/export?format=xlsx',
  labs: 'https://docs.google.com/spreadsheets/d/1sGEWsDYnVE1VThLUpfSs2Q0UIjXZZRzxXTHXDvn7p8I/export?format=xlsx',
});

const FETCH_TIMEOUT_MS = 30_000;
const MAX_WORKBOOK_BYTES = 20 * 1024 * 1024;
const PAGE_SIZE = 1000;
const UPSERT_CHUNK = 100;

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const lower = value => clean(value).toLocaleLowerCase('sq');
const yes = value => ['PO', 'YES', 'TRUE', '1'].includes(clean(value).toUpperCase());
const numberOrNull = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};
const firstUrl = value => clean(value).split(/\s*;\s*/).find(url => /^https:\/\//i.test(url)) || null;
const dateText = value => {
  if (!value) return null;
  if (value instanceof Date && Number.isFinite(value.valueOf())) return value.toISOString();
  return clean(value) || null;
};
const rowHash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const compactObject = value => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));

async function fetchWorkbook(url, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'User-Agent':'MedIndex-Supabase-Sync/1.0' },
    });
    if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_WORKBOOK_BYTES) {
      throw new Error(`${label}: madhësi e pavlefshme (${buffer.length} bytes)`);
    }
    return XLSX.read(buffer, { type:'buffer', cellDates:true });
  } finally {
    clearTimeout(timer);
  }
}

function sheetRows(workbook, sheetName, range = undefined) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Mungon sheet-i ${sheetName}.`);
  return XLSX.utils.sheet_to_json(sheet, { defval:'', raw:false, ...(range === undefined ? {} : { range }) });
}

function keyFrom(row, columns) {
  return columns.map(column => String(row[column] ?? '')).join('\u241f');
}

async function fetchAll(table, select, filters = '') {
  const output = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const path = `${table}?select=${encodeURIComponent(select)}&limit=${PAGE_SIZE}&offset=${offset}${filters}`;
    const { data } = await neonRequest(path);
    const rows = Array.isArray(data) ? data : [];
    output.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return output;
}

async function upsertRows(table, rows, conflictColumns, options = {}) {
  if (!rows.length) return { read:0, insertedOrUpdated:0, skipped:0 };
  const columns = Array.isArray(conflictColumns) ? conflictColumns : [conflictColumns];
  let candidates = rows;

  if (options.compareSourceHash !== false) {
    const select = [...columns, 'source_hash', 'editorial_override'].join(',');
    const existing = await fetchAll(table, select);
    const map = new Map(existing.map(item => [keyFrom(item, columns), item]));
    candidates = rows.filter(row => {
      const current = map.get(keyFrom(row, columns));
      if (!current) return true;
      if (current.editorial_override === true) return false;
      return !row.source_hash || current.source_hash !== row.source_hash;
    });
  }

  let written = 0;
  for (let index = 0; index < candidates.length; index += UPSERT_CHUNK) {
    const chunk = candidates.slice(index, index + UPSERT_CHUNK);
    const conflict = encodeURIComponent(columns.join(','));
    await neonRequest(`${table}?on_conflict=${conflict}`, {
      method:'POST',
      body:chunk,
      prefer:'resolution=merge-duplicates,return=minimal',
    });
    written += chunk.length;
  }

  return { read:rows.length, insertedOrUpdated:written, skipped:rows.length - written };
}

async function createSyncRun() {
  const body = [{
    source_type:'google_sheets',
    source_ref:Object.values(SOURCES).join(';'),
    target_scope:'drugs,dosage,icd,labs',
    status:'running',
    metadata:{ vercelCommit:process.env.VERCEL_GIT_COMMIT_SHA || null },
  }];
  const { data } = await neonRequest('sync_runs', {
    method:'POST',
    body,
    prefer:'return=representation',
  });
  return Array.isArray(data) ? data[0]?.id : null;
}

async function finishSyncRun(id, status, totals, error = null) {
  if (!id) return;
  await neonRequest(`sync_runs?id=eq.${encodeURIComponent(id)}`, {
    method:'PATCH',
    body:{
      status,
      rows_read:totals.read,
      rows_inserted:totals.written,
      rows_updated:0,
      rows_skipped:totals.skipped,
      error_summary:error ? clean(error.message || error).slice(0, 2000) : null,
      completed_at:new Date().toISOString(),
      metadata:{ ...totals.byScope, vercelCommit:process.env.VERCEL_GIT_COMMIT_SHA || null },
    },
    prefer:'return=minimal',
  });
}

function mergeTotals(total, scope, result) {
  total.read += result.read;
  total.written += result.insertedOrUpdated;
  total.skipped += result.skipped;
  total.byScope[scope] = result;
}

function registryRecords(workbook) {
  const rows = sheetRows(workbook, 'Sheet1');
  return rows.flatMap(source => {
    const registryNumber = numberOrNull(source['Nr rendor']);
    const tradeName = clean(source['Emri tregtar']);
    if (!registryNumber || !tradeName) return [];

    const record = {
      registry_number:registryNumber,
      protocol_no:clean(source.ProtocolNo) || null,
      pdid:clean(source.PDID) || null,
      trade_name:tradeName,
      active_substance:clean(source['Substanca aktive']) || null,
      atc_code:clean(source['ATC Code']) || null,
      drug_class:clean(source['Klasa / Çka është']) || null,
      use_text:clean(source['Përdorimi (fjalë kyçe)']) || null,
      strength:clean(source['Fortësia']) || null,
      pharmaceutical_form:clean(source['Forma farmaceutike']) || null,
      packaging:clean(source['Madhësia e paketimit']) || null,
      marketing_authorization_holder:clean(source['Bartësi i Autorizim Marketingut']) || null,
      manufacturer:clean(source.Prodhuesi) || null,
      ma_certificate:clean(source['MA certifikata']) || null,
      product_status:clean(source['Statusi ']) || null,
      wholesale_price:numberOrNull(source['Çmimi me shumicë']),
      wholesale_with_margin:numberOrNull(source['Çmimi me marzhë']),
      vat_text:clean(source.TVSH) || null,
      retail_price:numberOrNull(source['Çmimi me pakicë']),
      validity_text:clean(source['Afati i vlefshmërisë']) || null,
      editorial_status:registryNumber <= 420 ? 'published' : 'in_review',
      is_published:registryNumber <= 420,
      editorial_override:false,
      source_payload:compactObject(Object.fromEntries(Object.entries(source).map(([key, value]) => [key, dateText(value)]))),
    };
    record.source_hash = rowHash(record);
    return [record];
  });
}

function labCategoryRecords(rows) {
  const map = new Map();
  rows.forEach(row => {
    const match = clean(row.Kategoria).match(/Kategoria\s+(\d+)\s*[–-]\s*(.+)$/i);
    if (!match) return;
    map.set(Number(match[1]), {
      category_number:Number(match[1]),
      title:clean(match[2]),
      description:null,
    });
  });
  return [...map.values()];
}

function labRecords(rows, categoryIds) {
  return rows.flatMap(source => {
    const match = clean(source.Kategoria).match(/Kategoria\s+(\d+)/i);
    const categoryNumber = match ? Number(match[1]) : null;
    const categoryId = categoryIds.get(categoryNumber);
    const formName = clean(source['Emri në formular']);
    if (!categoryId || !formName) return [];

    const record = {
      category_id:categoryId,
      form_name:formName,
      full_name_en:clean(source['Emri i plotë në anglisht']) || null,
      full_name_sq:clean(source['Emri i plotë në shqip']) || null,
      what_it_shows:clean(source['Çfarë tregon']) || null,
      high_when:clean(source['Kur rritet / rezulton pozitive / gjetje jonormale']) || null,
      low_when:clean(source['Kur ulet / rezulton negative / gjetje normale']) || null,
      source_url:firstUrl(source.Burimi),
      editorial_status:'published',
      is_published:true,
      editorial_override:false,
    };
    record.source_hash = rowHash(record);
    return [record];
  });
}

function icdRecords(workbook) {
  const rows = sheetRows(workbook, 'Të gjitha kodet', 4);
  return rows.flatMap(source => {
    const code = clean(source['Kodi ICD-10']).toUpperCase();
    const titleSq = clean(source['Emri në shqip']);
    if (!code || !titleSq) return [];

    const urgency = clean(source.Urgjencë);
    const priority = numberOrNull(clean(source.Prioriteti).match(/\d+/)?.[0]);
    const tags = clean(source['Fjalë kyçe']).split(/\s*;\s*/).filter(Boolean);
    const record = {
      code,
      title_sq:titleSq,
      title_en:clean(source['Emri në anglisht']) || null,
      description_sq:clean(source['Përdorimi tipik']) || null,
      chapter_code:clean(source.Kapitulli) || null,
      chapter_title:clean(source['Emri i kapitullit']) || null,
      level_name:clean(source.Niveli) || null,
      group_name:clean(source['Grupi / nënkategoria klinike']) || null,
      priority_level:priority,
      typical_use:clean(source['Përdorimi tipik']) || null,
      warning_text:clean(source['Shenja alarmi / kujdes']) || null,
      coding_note:clean(source['Shënim kodimi']) || null,
      is_family_medicine:Boolean(clean(source['Mjekësi familjare'])),
      is_emergency:Boolean(urgency && urgency !== '—'),
      is_critical:lower(urgency) === 'kritik',
      tags,
      source_url:firstUrl(source['Burimi WHO']),
      editorial_status:'published',
      is_published:true,
      editorial_override:false,
    };
    record.source_hash = rowHash(record);
    return [record];
  });
}

function parseDoseRange(value) {
  const numbers = clean(value).replace(/,/g, '.').match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  if (!numbers.length) return { min:null, max:null };
  return { min:numbers[0], max:numbers[1] ?? numbers[0] };
}

function structuredAdultRegimens(workbook) {
  return sheetRows(workbook, 'DOZA_TE_RRITUR').flatMap(source => {
    const regimenId = clean(source.RegimenID);
    if (!regimenId) return [];
    const status = clean(source.Statusi).toUpperCase();
    const publish = status === 'VERIFIKUAR' && yes(source['Auto-fill']);
    const range = parseDoseRange(source['Doza për marrje (mg)']);
    const record = {
      source_key:`adult:${regimenId}`,
      regimen_code:regimenId,
      population:'adult',
      atc_code:clean(source.ATC) || null,
      active_substance:clean(source['Substanca aktive']) || null,
      pharmaceutical_form:clean(source.Forma) || null,
      reference_strength:clean(source['Fortësia referencë']) || null,
      indication_text:clean(source.Indikacioni) || null,
      dose_text:clean(source['Doza për marrje (mg)']) || clean(source['Signatura draft']) || 'Kontrollo burimin',
      route:clean(source.Rruga) || null,
      frequency_text:clean(source.Shpeshtësia) || null,
      duration_text:clean(source['Kohëzgjatja default']) || null,
      maximum_text:[
        clean(source['Maks. për marrje (mg)']) ? `Maks. për marrje: ${clean(source['Maks. për marrje (mg)'])} mg` : '',
        clean(source['Maks. 24h (mg)']) ? `Maks. 24h: ${clean(source['Maks. 24h (mg)'])} mg` : '',
      ].filter(Boolean).join('; ') || null,
      warnings:[clean(source['Udhëzime / alarme']), clean(source['Renal / hepatik'])].filter(Boolean).join(' ') || null,
      calculation_status:'text_verified',
      calculation_type:range.min !== null ? 'fixed_dose' : null,
      dose_value_min:range.min,
      dose_value_max:range.max,
      interval_hours:numberOrNull(source['Intervali (orë)']),
      max_single_mg:numberOrNull(source['Maks. për marrje (mg)']),
      max_daily_mg:numberOrNull(source['Maks. 24h (mg)']),
      signatura_template:clean(source['Signatura draft']) || null,
      signatura_text:clean(source['Signatura draft']) || null,
      source_url:firstUrl(source['Burimi URL']),
      editorial_status:publish ? 'published' : status === 'VERIFIKUAR' ? 'verified' : 'draft',
      reviewed_at:publish ? dateText(source['Data e burimit']) : null,
      editorial_override:false,
      formula_text:null,
    };
    record.source_hash = rowHash(record);
    return [record];
  });
}

function pediatricCalculationType(source) {
  const mgPerKg = numberOrNull(source['Vlera mg/kg']);
  const fixedMg = numberOrNull(source['Doza fikse (mg)']);
  const fixedMl = numberOrNull(source['Vëllimi fikse (mL)']);
  const basis = lower(source['Baza (dozë/ditë)']);
  if (mgPerKg !== null) return basis.includes('dit') ? 'mg_per_kg_day' : 'mg_per_kg_dose';
  if (fixedMl !== null) return 'fixed_volume';
  if (fixedMg !== null) return 'fixed_dose';
  return null;
}

function structuredPediatricRegimens(workbook) {
  return sheetRows(workbook, 'DOZA_PEDIATRIKE').flatMap(source => {
    const regimenId = clean(source.RegimenID);
    if (!regimenId) return [];
    const status = clean(source.Statusi).toUpperCase();
    const publish = status === 'VERIFIKUAR' && yes(source['Auto-fill']);
    const type = pediatricCalculationType(source);
    const mgPerKg = numberOrNull(source['Vlera mg/kg']);
    const fixedMg = numberOrNull(source['Doza fikse (mg)']);
    const fixedMl = numberOrNull(source['Vëllimi fikse (mL)']);
    const doseValue = mgPerKg ?? fixedMg ?? fixedMl;
    const record = {
      source_key:`pediatric:${regimenId}`,
      regimen_code:regimenId,
      population:'pediatric',
      atc_code:clean(source.ATC) || null,
      active_substance:clean(source['Substanca aktive']) || null,
      pharmaceutical_form:clean(source.Forma) || null,
      reference_strength:clean(source.Përqendrimi) || null,
      indication_text:clean(source.Indikacioni) || null,
      dose_text:clean(source['Signatura draft']) || clean(source['Formula e llogaritjes']) || 'Kontrollo burimin',
      route:clean(source.Rruga) || null,
      frequency_text:clean(source.Shpeshtësia) || null,
      duration_text:clean(source['Kohëzgjatja default']) || null,
      maximum_text:[
        clean(source['Maks. për marrje (mg)']) ? `Maks. për marrje: ${clean(source['Maks. për marrje (mg)'])} mg` : '',
        clean(source['Maks. 24h (mg)']) ? `Maks. 24h: ${clean(source['Maks. 24h (mg)'])} mg` : '',
      ].filter(Boolean).join('; ') || null,
      warnings:clean(source['Udhëzime / alarme']) || null,
      calculation_status:publish && type ? 'calculable_verified' : type ? 'text_verified' : 'pending',
      calculation_type:type,
      dose_value_min:doseValue,
      dose_value_max:doseValue,
      doses_per_day:numberOrNull(source['Nr. dozave/ditë']),
      interval_hours:numberOrNull(source['Intervali (orë)']),
      max_single_mg:numberOrNull(source['Maks. për marrje (mg)']),
      max_daily_mg:numberOrNull(source['Maks. 24h (mg)']),
      min_age_months:numberOrNull(source['Mosha min (muaj)']),
      max_age_months:numberOrNull(source['Mosha max (muaj)']),
      min_weight_kg:numberOrNull(source['Pesha min (kg)']),
      max_weight_kg:numberOrNull(source['Pesha max (kg)']),
      concentration_mg:parseDoseRange(source.Përqendrimi).min,
      concentration_ml:numberOrNull(clean(source.Përqendrimi).match(/\/\s*(\d+(?:[.,]\d+)?)\s*mL/i)?.[1]),
      signatura_template:clean(source['Signatura draft']) || null,
      signatura_text:clean(source['Signatura draft']) || null,
      formula_text:clean(source['Formula e llogaritjes']) || null,
      source_url:firstUrl(source['Burimi URL']),
      editorial_status:publish ? 'published' : status === 'VERIFIKUAR' ? 'verified' : 'draft',
      reviewed_at:null,
      editorial_override:false,
    };
    record.source_hash = rowHash(record);
    return [record];
  });
}

function cardRegimens(workbook, drugIds) {
  const output = [];
  sheetRows(workbook, 'KARTELA_BARNAVE').forEach(source => {
    const nr = numberOrNull(source['Nr rendor']);
    const drugId = drugIds.get(nr) || null;
    const status = clean(source.Statusi).toUpperCase();
    const publish = status === 'VERIFIKUAR' && yes(source['Publiko?']);
    const common = {
      drug_id:drugId,
      atc_code:clean(source.ATC) || null,
      active_substance:clean(source['Substanca aktive']) || null,
      pharmaceutical_form:clean(source.Forma) || null,
      reference_strength:clean(source.Fortësia) || null,
      indication_text:clean(source.Përdorimi) || null,
      source_url:firstUrl(source['Burimi URL']),
      warnings:clean(source['Shënim auditimi']) || null,
      editorial_status:publish ? 'published' : status === 'VERIFIKUAR' ? 'verified' : 'draft',
      reviewed_at:dateText(source['Data e auditimit']),
      editorial_override:false,
      calculation_status:'text_verified',
    };

    const adultDose = clean(source['Doza e plotë — Të rritur']);
    if (adultDose) {
      const record = {
        ...common,
        source_key:`card:${nr}:adult`,
        regimen_code:`CARD-${nr}-ADULT`,
        population:'adult',
        dose_text:adultDose,
        route:clean(source['Rruga — Të rritur']) || null,
      };
      record.source_hash = rowHash(record);
      output.push(record);
    }

    const pediatricDose = clean(source['Doza e plotë — Fëmijë']);
    if (pediatricDose) {
      const record = {
        ...common,
        source_key:`card:${nr}:pediatric`,
        regimen_code:`CARD-${nr}-PED`,
        population:'pediatric',
        dose_text:pediatricDose,
        route:clean(source['Rruga — Fëmijë']) || null,
      };
      record.source_hash = rowHash(record);
      output.push(record);
    }
  });
  return output;
}

async function tableCount(table) {
  const { response } = await neonRequest(`${table}?select=id&limit=1`, {
    headers:{ Range:'0-0', 'Range-Unit':'items' },
    prefer:'count=exact',
  });
  return exactCount(response);
}

async function sync() {
  if (!process.env.VERCEL) {
    console.log('MedIndex Supabase sync skipped outside Vercel.');
    return;
  }
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
    await tableCount('lab_tests');
    console.log('MedIndex Supabase preview connection verified; data sync runs only in production.');
    return;
  }

  let syncRunId = null;
  const totals = { read:0, written:0, skipped:0, byScope:{} };

  try {
    syncRunId = await createSyncRun();
    const [registryBook, dosageBook, icdBook, labBook] = await Promise.all([
      fetchWorkbook(SOURCES.registry, 'Regjistri'),
      fetchWorkbook(SOURCES.dosage, 'Dozologjia'),
      fetchWorkbook(SOURCES.icd, 'ICD'),
      fetchWorkbook(SOURCES.labs, 'Analizat'),
    ]);

    const drugs = registryRecords(registryBook);
    mergeTotals(totals, 'drugs', await upsertRows('drugs', drugs, 'registry_number'));

    const databaseDrugs = await fetchAll('drugs', 'id,registry_number');
    const drugIds = new Map(databaseDrugs.map(item => [Number(item.registry_number), item.id]));

    const labSourceRows = sheetRows(labBook, 'Analizat', 3);
    const categories = labCategoryRecords(labSourceRows);
    mergeTotals(totals, 'labCategories', await upsertRows('lab_categories', categories, 'category_number', { compareSourceHash:false }));
    const databaseCategories = await fetchAll('lab_categories', 'id,category_number');
    const categoryIds = new Map(databaseCategories.map(item => [Number(item.category_number), item.id]));
    mergeTotals(totals, 'labTests', await upsertRows('lab_tests', labRecords(labSourceRows, categoryIds), ['category_id','form_name']));

    mergeTotals(totals, 'icdCodes', await upsertRows('icd_codes', icdRecords(icdBook), 'code'));

    const regimens = [
      ...cardRegimens(dosageBook, drugIds),
      ...structuredAdultRegimens(dosageBook),
      ...structuredPediatricRegimens(dosageBook),
    ];
    mergeTotals(totals, 'dosageRegimens', await upsertRows('dosage_regimens', regimens, 'source_key'));

    await finishSyncRun(syncRunId, 'completed', totals);
    const counts = {
      drugs:await tableCount('drugs'),
      dosageRegimens:await tableCount('dosage_regimens'),
      icdCodes:await tableCount('icd_codes'),
      labTests:await tableCount('lab_tests'),
    };
    console.log(`MedIndex Supabase sync completed: ${JSON.stringify({ totals, counts })}`);
  } catch (error) {
    await finishSyncRun(syncRunId, 'failed', totals, error).catch(() => {});
    console.warn(`MedIndex Supabase sync limited: ${error.message}`);
  }
}

sync();
