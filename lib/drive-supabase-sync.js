'use strict';

// Canonical Google Drive -> Supabase incremental sync implementation.
// The legacy drive-neon-sync.js path is retained only as a compatibility wrapper.

const crypto = require('node:crypto');
const { neonRequest } = require('./medindex-data-api');

const MAX_ROWS_PER_REQUEST = 100;
const MAX_DELETED_KEYS = 200;

const SOURCE_CONFIGS = Object.freeze({
  '1oF_92zOmTEeXyXh7daaK9onq9fZbQBlWmeU9K0ptn4U|Sheet1': {
    entityScope:'drugs', keyColumn:'Nr rendor', headerRow:2,
  },
  '17cuXg5qORIIWkvAxLZ7uz2FMmGvzwjr850cubUcIgLE|KARTELA_BARNAVE': {
    entityScope:'dosage_cards', keyColumn:'Nr rendor', headerRow:1,
  },
  '17cuXg5qORIIWkvAxLZ7uz2FMmGvzwjr850cubUcIgLE|DOZA_TE_RRITUR': {
    entityScope:'adult_dosage', keyColumn:'RegimenID', headerRow:1,
  },
  '17cuXg5qORIIWkvAxLZ7uz2FMmGvzwjr850cubUcIgLE|DOZA_PEDIATRIKE': {
    entityScope:'pediatric_dosage', keyColumn:'RegimenID', headerRow:1,
  },
  '1T7XsfkXLQfEomFL4DmXoA8PheiR6s3Qmu36hTqklOMo|KARTELA_BARNAVE': {
  entityScope:'dosage_cards', keyColumn:'Nr rendor', headerRow:1,
},
'1T7XsfkXLQfEomFL4DmXoA8PheiR6s3Qmu36hTqklOMo|DOZA_TE_RRITUR': {
  entityScope:'adult_dosage', keyColumn:'RegimenID', headerRow:1,
},
'1T7XsfkXLQfEomFL4DmXoA8PheiR6s3Qmu36hTqklOMo|DOZA_PEDIATRIKE': {
  entityScope:'pediatric_dosage', keyColumn:'RegimenID', headerRow:1,
},
  '19ncbnrTJ_w-WQ0msWO9_dUoxjmicSUAz6Nt4sh20gFw|Të gjitha kodet': {
    entityScope:'icd_codes', keyColumn:'Kodi ICD-10', headerRow:5,
  },
  '1sGEWsDYnVE1VThLUpfSs2Q0UIjXZZRzxXTHXDvn7p8I|Analizat': {
    entityScope:'lab_tests', keyColumn:'Emri në formular', headerRow:4,
  },
});

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const lower = value => clean(value).toLocaleLowerCase('sq');
const yes = value => ['PO', 'YES', 'TRUE', '1'].includes(clean(value).toUpperCase());
const firstUrl = value => clean(value).split(/\s*;\s*/).find(url => /^https:\/\//i.test(url)) || null;
const nowIso = () => new Date().toISOString();

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).replace(/\s/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestampOrNull(value) {
  const raw = clean(value);
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function rowHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function sourceKey(spreadsheetId, sheetName) {
  return `${clean(spreadsheetId)}|${clean(sheetName)}`;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function authorized(req) {
  const expected = process.env.MEDINDEX_DRIVE_SYNC_SECRET;
  const received = req.headers?.['x-medindex-sync-secret'];
  return Boolean(expected && safeEqual(received, expected));
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length <= 512 * 1024) return JSON.parse(req.body || '{}');
  return {};
}

function quoteFilter(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

async function findSource(spreadsheetId, sheetName) {
  const path = `drive_sync_sources?select=id,spreadsheet_id,sheet_name,entity_scope,key_column,enabled`
    + `&spreadsheet_id=eq.${encodeURIComponent(spreadsheetId)}`
    + `&sheet_name=eq.${encodeURIComponent(sheetName)}&limit=1`;
  const { data } = await neonRequest(path);
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || row.enabled !== true) throw new Error('Ky Google Sheet nuk është aktivizuar për sinkronizim.');
  return row;
}

async function setSourceStatus(sourceId, status, error = null) {
  await neonRequest(`drive_sync_sources?id=eq.${encodeURIComponent(sourceId)}`, {
    method:'PATCH',
    body:{
      last_status:status,
      last_error:error ? clean(error.message || error).slice(0, 2000) : null,
      last_synced_at:status === 'synced' ? nowIso() : undefined,
      updated_at:nowIso(),
    },
    prefer:'return=minimal',
  });
}

async function mirrorRows(source, rows) {
  if (!rows.length) return 0;
  const body = rows.map(item => ({
    source_id:source.id,
    row_key:item.rowKey,
    row_number:item.rowNumber,
    payload:item.values,
    source_hash:item.sourceHash,
    source_updated_at:item.editedAt,
    synced_at:nowIso(),
    deleted_at:null,
    updated_at:nowIso(),
  }));
  await neonRequest('drive_sheet_rows?on_conflict=source_id%2Crow_key', {
    method:'POST', body,
    prefer:'resolution=merge-duplicates,return=minimal',
  });
  return body.length;
}

async function markMirrorDeleted(source, deletedKeys) {
  if (!deletedKeys.length) return 0;
  const filter = deletedKeys.map(quoteFilter).join(',');
  await neonRequest(
    `drive_sheet_rows?source_id=eq.${encodeURIComponent(source.id)}&row_key=in.(${encodeURIComponent(filter)})`,
    {
      method:'PATCH',
      body:{ deleted_at:nowIso(), synced_at:nowIso(), updated_at:nowIso() },
      prefer:'return=minimal',
    }
  );
  return deletedKeys.length;
}

async function existingOverrides(table, keyColumn, keys) {
  const unique = [...new Set(keys.map(clean).filter(Boolean))];
  if (!unique.length) return new Set();
  const filter = unique.map(quoteFilter).join(',');
  const { data } = await neonRequest(
    `${table}?select=${encodeURIComponent(keyColumn)},editorial_override`
    + `&${keyColumn}=in.(${encodeURIComponent(filter)})`
  );
  return new Set((Array.isArray(data) ? data : [])
    .filter(row => row.editorial_override === true)
    .map(row => clean(row[keyColumn])));
}

async function upsertRows(table, rows, conflictColumns, keyColumnForOverride = null) {
  if (!rows.length) return { written:0, protected:0 };
  let candidates = rows;
  let protectedCount = 0;
  if (keyColumnForOverride) {
    const protectedKeys = await existingOverrides(table, keyColumnForOverride, rows.map(row => row[keyColumnForOverride]));
    candidates = rows.filter(row => !protectedKeys.has(clean(row[keyColumnForOverride])));
    protectedCount = rows.length - candidates.length;
  }
  if (!candidates.length) return { written:0, protected:protectedCount };
  await neonRequest(`${table}?on_conflict=${encodeURIComponent(conflictColumns.join(','))}`, {
    method:'POST', body:candidates,
    prefer:'resolution=merge-duplicates,return=minimal',
  });
  return { written:candidates.length, protected:protectedCount };
}

async function archiveByKey(table, keyColumn, keys, body) {
  if (!keys.length) return 0;
  const filter = keys.map(quoteFilter).join(',');
  await neonRequest(
    `${table}?${keyColumn}=in.(${encodeURIComponent(filter)})&editorial_override=neq.true`,
    { method:'PATCH', body:{ ...body, updated_at:nowIso() }, prefer:'return=minimal' }
  );
  return keys.length;
}

function mapDrug(values) {
  const registryNumber = numberOrNull(values['Nr rendor']);
  const tradeName = clean(values['Emri tregtar']);
  if (!registryNumber || !tradeName) return null;
  const record = {
    registry_number:registryNumber,
    protocol_no:clean(values.ProtocolNo) || null,
    pdid:clean(values.PDID) || null,
    trade_name:tradeName,
    active_substance:clean(values['Substanca aktive']) || null,
    atc_code:clean(values['ATC Code']) || null,
    strength:clean(values.Fortësia) || null,
    pharmaceutical_form:clean(values['Forma farmaceutike']) || null,
    packaging:clean(values['Madhësia e paketimit']) || null,
    marketing_authorization_holder:clean(values['Bartësi i Autorizim Marketingut']) || null,
    manufacturer:clean(values.Prodhuesi) || null,
    ma_certificate:clean(values['MA certifikata']) || null,
    product_status:clean(values['Statusi ']) || null,
    wholesale_price:numberOrNull(values['Çmimi me shumicë']),
    wholesale_with_margin:numberOrNull(values['Çmimi me marzhë']),
    vat_text:clean(values.TVSH) || null,
    retail_price:numberOrNull(values['Çmimi me pakicë']),
    validity_text:clean(values['Afati i vlefshmërisë']) || null,
    editorial_status:'published',
    is_published:true,
    editorial_override:false,
    source_payload:values,
    updated_at:nowIso(),
  };
  record.source_hash = rowHash(record);
  return record;
}

function parseDoseRange(value) {
  const values = clean(value).replace(/,/g, '.').match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  return values.length ? { min:values[0], max:values[1] ?? values[0] } : { min:null, max:null };
}

function pediatricCalculationType(values) {
  const mgPerKg = numberOrNull(values['Vlera mg/kg']);
  const fixedMg = numberOrNull(values['Doza fikse (mg)']);
  const fixedMl = numberOrNull(values['Vëllimi fikse (mL)']);
  const basis = lower(values['Baza (dozë/ditë)']);
  if (mgPerKg !== null) return basis.includes('dit') ? 'mg_per_kg_day' : 'mg_per_kg_dose';
  if (fixedMl !== null) return 'fixed_volume';
  if (fixedMg !== null) return 'fixed_dose';
  return null;
}

function mapAdultDosage(values) {
  const regimenId = clean(values.RegimenID);
  if (!regimenId) return null;
  const status = clean(values.Statusi).toUpperCase();
  const publish = status === 'VERIFIKUAR' && yes(values['Auto-fill']);
  const range = parseDoseRange(values['Doza për marrje (mg)']);
  const record = {
    source_key:`adult:${regimenId}`,
    regimen_code:regimenId,
    population:'adult',
    atc_code:clean(values.ATC) || null,
    active_substance:clean(values['Substanca aktive']) || null,
    pharmaceutical_form:clean(values.Forma) || null,
    reference_strength:clean(values['Fortësia referencë']) || null,
    indication_text:clean(values.Indikacioni) || null,
    dose_text:clean(values['Doza për marrje (mg)']) || clean(values['Signatura draft']) || 'Kontrollo burimin',
    route:clean(values.Rruga) || null,
    frequency_text:clean(values.Shpeshtësia) || null,
    duration_text:clean(values['Kohëzgjatja default']) || null,
    maximum_text:[
      clean(values['Maks. për marrje (mg)']) ? `Maks. për marrje: ${clean(values['Maks. për marrje (mg)'])} mg` : '',
      clean(values['Maks. 24h (mg)']) ? `Maks. 24h: ${clean(values['Maks. 24h (mg)'])} mg` : '',
    ].filter(Boolean).join('; ') || null,
    warnings:[clean(values['Udhëzime / alarme']), clean(values['Renal / hepatik'])].filter(Boolean).join(' ') || null,
    calculation_status:'text_verified',
    calculation_type:range.min !== null ? 'fixed_dose' : null,
    dose_value_min:range.min,
    dose_value_max:range.max,
    interval_hours:numberOrNull(values['Intervali (orë)']),
    max_single_mg:numberOrNull(values['Maks. për marrje (mg)']),
    max_daily_mg:numberOrNull(values['Maks. 24h (mg)']),
    signatura_template:clean(values['Signatura draft']) || null,
    signatura_text:clean(values['Signatura draft']) || null,
    source_url:firstUrl(values['Burimi URL']),
    editorial_status:publish ? 'published' : status === 'VERIFIKUAR' ? 'verified' : 'draft',
    reviewed_at:publish ? timestampOrNull(values['Data e burimit']) : null,
    editorial_override:false,
    updated_at:nowIso(),
  };
  record.source_hash = rowHash(record);
  return record;
}

function mapPediatricDosage(values) {
  const regimenId = clean(values.RegimenID);
  if (!regimenId) return null;
  const status = clean(values.Statusi).toUpperCase();
  const publish = status === 'VERIFIKUAR' && yes(values['Auto-fill']);
  const type = pediatricCalculationType(values);
  const doseValue = numberOrNull(values['Vlera mg/kg'])
    ?? numberOrNull(values['Doza fikse (mg)'])
    ?? numberOrNull(values['Vëllimi fikse (mL)']);
  const record = {
    source_key:`pediatric:${regimenId}`,
    regimen_code:regimenId,
    population:'pediatric',
    atc_code:clean(values.ATC) || null,
    active_substance:clean(values['Substanca aktive']) || null,
    pharmaceutical_form:clean(values.Forma) || null,
    reference_strength:clean(values.Përqendrimi) || null,
    indication_text:clean(values.Indikacioni) || null,
    dose_text:clean(values['Signatura draft']) || clean(values['Formula e llogaritjes']) || 'Kontrollo burimin',
    route:clean(values.Rruga) || null,
    frequency_text:clean(values.Shpeshtësia) || null,
    duration_text:clean(values['Kohëzgjatja default']) || null,
    warnings:clean(values['Udhëzime / alarme']) || null,
    calculation_status:publish && type ? 'calculable_verified' : type ? 'text_verified' : 'pending',
    calculation_type:type,
    dose_value_min:doseValue,
    dose_value_max:doseValue,
    doses_per_day:numberOrNull(values['Nr. dozave/ditë']),
    interval_hours:numberOrNull(values['Intervali (orë)']),
    max_single_mg:numberOrNull(values['Maks. për marrje (mg)']),
    max_daily_mg:numberOrNull(values['Maks. 24h (mg)']),
    min_age_months:numberOrNull(values['Mosha min (muaj)']),
    max_age_months:numberOrNull(values['Mosha max (muaj)']),
    min_weight_kg:numberOrNull(values['Pesha min (kg)']),
    max_weight_kg:numberOrNull(values['Pesha max (kg)']),
    concentration_mg:parseDoseRange(values.Përqendrimi).min,
    concentration_ml:numberOrNull(clean(values.Përqendrimi).match(/\/\s*(\d+(?:[.,]\d+)?)\s*mL/i)?.[1]),
    signatura_template:clean(values['Signatura draft']) || null,
    signatura_text:clean(values['Signatura draft']) || null,
    formula_text:clean(values['Formula e llogaritjes']) || null,
    source_url:firstUrl(values['Burimi URL']),
    editorial_status:publish ? 'published' : status === 'VERIFIKUAR' ? 'verified' : 'draft',
    reviewed_at:null,
    editorial_override:false,
    updated_at:nowIso(),
  };
  record.source_hash = rowHash(record);
  return record;
}

async function drugIdsByRegistryNumber(numbers) {
  const unique = [...new Set(numbers.map(Number).filter(Number.isFinite))];
  if (!unique.length) return new Map();
  const filter = unique.join(',');
  const { data } = await neonRequest(`drugs?select=id,registry_number&registry_number=in.(${filter})`);
  return new Map((Array.isArray(data) ? data : []).map(row => [Number(row.registry_number), row.id]));
}

function mapCardDosages(values, drugId) {
  const registryNumber = numberOrNull(values['Nr rendor']);
  if (!registryNumber) return [];
  const status = clean(values.Statusi).toUpperCase();
  const publish = status === 'VERIFIKUAR' && yes(values['Publiko?']);
  const common = {
    drug_id:drugId || null,
    atc_code:clean(values.ATC) || null,
    active_substance:clean(values['Substanca aktive']) || null,
    pharmaceutical_form:clean(values.Forma) || null,
    reference_strength:clean(values.Fortësia) || null,
    indication_text:clean(values.Përdorimi) || null,
    source_url:firstUrl(values['Burimi URL']),
    warnings:clean(values['Shënim auditimi']) || null,
    editorial_status:publish ? 'published' : status === 'VERIFIKUAR' ? 'verified' : 'draft',
    reviewed_at:timestampOrNull(values['Data e auditimit']),
    editorial_override:false,
    calculation_status:'text_verified',
    updated_at:nowIso(),
  };
  const output = [];
  const adultDose = clean(values['Doza e plotë — Të rritur']);
  const adult = {
    ...common,
    source_key:`card:${registryNumber}:adult`,
    regimen_code:`CARD-${registryNumber}-ADULT`,
    population:'adult',
    dose_text:adultDose || 'Kontrollo burimin',
    route:clean(values['Rruga — Të rritur']) || null,
    editorial_status:adultDose ? common.editorial_status : 'draft',
  };
  adult.source_hash = rowHash(adult);
  output.push(adult);

  const pediatricDose = clean(values['Doza e plotë — Fëmijë']);
  const pediatric = {
    ...common,
    source_key:`card:${registryNumber}:pediatric`,
    regimen_code:`CARD-${registryNumber}-PED`,
    population:'pediatric',
    dose_text:pediatricDose || 'Kontrollo burimin',
    route:clean(values['Rruga — Fëmijë']) || null,
    editorial_status:pediatricDose ? common.editorial_status : 'draft',
  };
  pediatric.source_hash = rowHash(pediatric);
  output.push(pediatric);
  return output;
}

function mapIcd(values) {
  const code = clean(values['Kodi ICD-10']).toUpperCase();
  const titleSq = clean(values['Emri në shqip']);
  if (!code || !titleSq) return null;
  const urgency = clean(values.Urgjencë);
  const priority = numberOrNull(clean(values.Prioriteti).match(/\d+/)?.[0]);
  const record = {
    code,
    title_sq:titleSq,
    title_en:clean(values['Emri në anglisht']) || null,
    description_sq:clean(values['Përdorimi tipik']) || null,
    chapter_code:clean(values.Kapitulli) || null,
    chapter_title:clean(values['Emri i kapitullit']) || null,
    level_name:clean(values.Niveli) || null,
    group_name:clean(values['Grupi / nënkategoria klinike']) || null,
    priority_level:priority,
    typical_use:clean(values['Përdorimi tipik']) || null,
    warning_text:clean(values['Shenja alarmi / kujdes']) || null,
    coding_note:clean(values['Shënim kodimi']) || null,
    is_family_medicine:Boolean(clean(values['Mjekësi familjare'])),
    is_emergency:Boolean(urgency && urgency !== '—'),
    is_critical:lower(urgency) === 'kritik',
    tags:clean(values['Fjalë kyçe']).split(/\s*;\s*/).filter(Boolean),
    source_url:firstUrl(values['Burimi WHO']),
    editorial_status:'published',
    is_published:true,
    editorial_override:false,
    updated_at:nowIso(),
  };
  record.source_hash = rowHash(record);
  return record;
}

function labCategory(values) {
  const match = clean(values.Kategoria).match(/Kategoria\s+(\d+)\s*[–-]\s*(.+)$/i);
  return match ? { category_number:Number(match[1]), title:clean(match[2]), description:null, updated_at:nowIso() } : null;
}

async function mapLab(values) {
  const category = labCategory(values);
  const formName = clean(values['Emri në formular']);
  if (!category || !formName) return null;
  await neonRequest('lab_categories?on_conflict=category_number', {
    method:'POST', body:[category], prefer:'resolution=merge-duplicates,return=minimal',
  });
  const { data } = await neonRequest(`lab_categories?select=id&category_number=eq.${category.category_number}&limit=1`);
  const categoryId = Array.isArray(data) ? data[0]?.id : null;
  if (!categoryId) throw new Error(`Kategoria laboratorike ${category.category_number} nuk u gjet.`);
  const record = {
    category_id:categoryId,
    form_name:formName,
    full_name_en:clean(values['Emri i plotë në anglisht']) || null,
    full_name_sq:clean(values['Emri i plotë në shqip']) || null,
    what_it_shows:clean(values['Çfarë tregon']) || null,
    high_when:clean(values['Kur rritet / rezulton pozitive / gjetje jonormale']) || null,
    low_when:clean(values['Kur ulet / rezulton negative / gjetje normale']) || null,
    source_url:firstUrl(values.Burimi),
    editorial_status:'published',
    is_published:true,
    editorial_override:false,
    updated_at:nowIso(),
  };
  record.source_hash = rowHash(record);
  return record;
}

async function syncNormalized(config, rows, deletedKeys) {
  const result = { written:0, protected:0, archived:0 };
  if (config.entityScope === 'drugs') {
    const records = rows.map(item => mapDrug(item.values)).filter(Boolean);
    Object.assign(result, await upsertRows('drugs', records, ['registry_number'], 'registry_number'));
    result.archived = await archiveByKey('drugs', 'registry_number', deletedKeys, { editorial_status:'archived', is_published:false });
    return result;
  }
  if (config.entityScope === 'dosage_cards') {
    const numbers = rows.map(item => numberOrNull(item.values['Nr rendor'])).filter(Boolean);
    const ids = await drugIdsByRegistryNumber(numbers);
    const records = rows.flatMap(item => {
      const nr = numberOrNull(item.values['Nr rendor']);
      return mapCardDosages(item.values, ids.get(nr));
    });
    Object.assign(result, await upsertRows('dosage_regimens', records, ['source_key'], 'source_key'));
    const keys = deletedKeys.flatMap(key => [`card:${key}:adult`, `card:${key}:pediatric`]);
    result.archived = await archiveByKey('dosage_regimens', 'source_key', keys, { editorial_status:'draft' });
    return result;
  }
  if (config.entityScope === 'adult_dosage' || config.entityScope === 'pediatric_dosage') {
    const mapper = config.entityScope === 'adult_dosage' ? mapAdultDosage : mapPediatricDosage;
    const prefix = config.entityScope === 'adult_dosage' ? 'adult:' : 'pediatric:';
    const records = rows.map(item => mapper(item.values)).filter(Boolean);
    Object.assign(result, await upsertRows('dosage_regimens', records, ['source_key'], 'source_key'));
    result.archived = await archiveByKey('dosage_regimens', 'source_key', deletedKeys.map(key => prefix + key), { editorial_status:'draft' });
    return result;
  }
  if (config.entityScope === 'icd_codes') {
    const records = rows.map(item => mapIcd(item.values)).filter(Boolean);
    Object.assign(result, await upsertRows('icd_codes', records, ['code'], 'code'));
    result.archived = await archiveByKey('icd_codes', 'code', deletedKeys, { editorial_status:'archived', is_published:false });
    return result;
  }
  if (config.entityScope === 'lab_tests') {
    const records = [];
    for (const item of rows) {
      const record = await mapLab(item.values);
      if (record) records.push(record);
    }
    Object.assign(result, await upsertRows('lab_tests', records, ['category_id','form_name'], 'form_name'));
    result.archived = await archiveByKey('lab_tests', 'form_name', deletedKeys, { editorial_status:'archived', is_published:false });
    return result;
  }
  throw new Error(`Scope i panjohur: ${config.entityScope}`);
}

function normalizeRequestRows(config, rows) {
  if (!Array.isArray(rows) || rows.length > MAX_ROWS_PER_REQUEST) throw new Error('Numër i pavlefshëm rreshtash.');
  return rows.flatMap(item => {
    const values = item?.values && typeof item.values === 'object' && !Array.isArray(item.values) ? item.values : null;
    const rowKey = clean(item?.rowKey || values?.[config.keyColumn]);
    const rowNumber = numberOrNull(item?.rowNumber);
    if (!values || !rowKey || !rowNumber || rowNumber <= config.headerRow) return [];
    return [{
      rowKey,
      rowNumber,
      values,
      editedAt:timestampOrNull(item.editedAt) || nowIso(),
      sourceHash:clean(item.sourceHash) || rowHash(values),
    }];
  });
}

async function handle(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok:false, error:'Metoda nuk lejohet.' });
  }
  if (!authorized(req)) return res.status(401).json({ ok:false, error:'Çelësi i sinkronizimit nuk është valid.' });

  let source = null;
  try {
    const payload = parseBody(req);
    const spreadsheetId = clean(payload.spreadsheetId);
    const sheetName = clean(payload.sheetName);
    const config = SOURCE_CONFIGS[sourceKey(spreadsheetId, sheetName)];
    if (!config) return res.status(400).json({ ok:false, error:'Ky spreadsheet ose tab nuk lejohet.' });

    const rows = normalizeRequestRows(config, payload.rows || []);
    const deletedKeys = [...new Set((Array.isArray(payload.deletedKeys) ? payload.deletedKeys : [])
      .map(clean).filter(Boolean))].slice(0, MAX_DELETED_KEYS);
    if (!rows.length && !deletedKeys.length) return res.status(400).json({ ok:false, error:'Nuk u dërgua asnjë ndryshim i vlefshëm.' });

    source = await findSource(spreadsheetId, sheetName);
    await setSourceStatus(source.id, 'syncing');
    const mirrored = await mirrorRows(source, rows);
    const mirrorDeleted = await markMirrorDeleted(source, deletedKeys);
    const normalized = await syncNormalized(config, rows, deletedKeys);
    await setSourceStatus(source.id, 'synced');

    return res.status(200).json({
      ok:true,
      source:{ spreadsheetId, sheetName, entityScope:config.entityScope },
      mirrored,
      mirrorDeleted,
      normalized,
      syncedAt:nowIso(),
    });
  } catch (error) {
    if (source?.id) await setSourceStatus(source.id, 'failed', error).catch(() => {});
    console.error('Drive to Neon sync failed:', error);
    return res.status(500).json({ ok:false, error:clean(error.message || error).slice(0, 500) });
  }
}

module.exports = {
  SOURCE_CONFIGS,
  handle,
  mapDrug,
  mapAdultDosage,
  mapPediatricDosage,
  mapIcd,
  normalizeRequestRows,
};
