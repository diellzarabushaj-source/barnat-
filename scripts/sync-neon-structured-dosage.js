'use strict';

const crypto = require('node:crypto');
const XLSX = require('xlsx');
const { neonRequest } = require('../lib/medindex-data-api.js');

const SOURCE_URL = 'https://docs.google.com/spreadsheets/d/1T7XsfkXLQfEomFL4DmXoA8PheiR6s3Qmu36hTqklOMo/export?format=xlsx';
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const lower = value => clean(value).toLocaleLowerCase('sq');
const yes = value => ['PO', 'YES', 'TRUE', '1'].includes(clean(value).toUpperCase());
const num = value => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};
const sourceUrl = value => clean(value).split(/\s*;\s*/).find(item => /^https:\/\//i.test(item)) || null;
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function sheetRows(workbook, name) {
  const sheet = workbook.Sheets[name];
  if (!sheet) throw new Error(`Mungon sheet-i ${name}.`);
  return XLSX.utils.sheet_to_json(sheet, { defval:'', raw:false });
}

function range(value) {
  const values = clean(value).replace(/,/g, '.').match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  return { min:values[0] ?? null, max:values[1] ?? values[0] ?? null };
}

function adultRows(workbook) {
  return sheetRows(workbook, 'DOZA_TE_RRITUR').flatMap(source => {
    const regimenId = clean(source.RegimenID);
    if (!regimenId) return [];
    const verified = clean(source.Statusi).toUpperCase() === 'VERIFIKUAR';
    const publish = verified && yes(source['Auto-fill']);
    const doseRange = range(source['Doza për marrje (mg)']);
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
      calculation_type:doseRange.min === null ? null : 'fixed_dose',
      dose_value_min:doseRange.min,
      dose_value_max:doseRange.max,
      interval_hours:num(source['Intervali (orë)']),
      max_single_mg:num(source['Maks. për marrje (mg)']),
      max_daily_mg:num(source['Maks. 24h (mg)']),
      signatura_template:clean(source['Signatura draft']) || null,
      signatura_text:clean(source['Signatura draft']) || null,
      source_url:sourceUrl(source['Burimi URL']),
      editorial_status:publish ? 'published' : verified ? 'verified' : 'draft',
      editorial_override:false,
    };
    record.source_hash = hash(record);
    return [record];
  });
}

function pediatricType(source) {
  const mgKg = num(source['Vlera mg/kg']);
  const fixedMg = num(source['Doza fikse (mg)']);
  const fixedMl = num(source['Vëllimi fikse (mL)']);
  if (mgKg !== null) return lower(source['Baza (dozë/ditë)']).includes('dit') ? 'mg_per_kg_day' : 'mg_per_kg_dose';
  if (fixedMl !== null) return 'fixed_volume';
  if (fixedMg !== null) return 'fixed_dose';
  return null;
}

function pediatricRows(workbook) {
  return sheetRows(workbook, 'DOZA_PEDIATRIKE').flatMap(source => {
    const regimenId = clean(source.RegimenID);
    if (!regimenId) return [];
    const verified = clean(source.Statusi).toUpperCase() === 'VERIFIKUAR';
    const publish = verified && yes(source['Auto-fill']);
    const type = pediatricType(source);
    const mgKg = num(source['Vlera mg/kg']);
    const fixedMg = num(source['Doza fikse (mg)']);
    const fixedMl = num(source['Vëllimi fikse (mL)']);
    const concentration = range(source.Përqendrimi);
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
      dose_value_min:mgKg ?? fixedMg ?? fixedMl,
      dose_value_max:mgKg ?? fixedMg ?? fixedMl,
      doses_per_day:num(source['Nr. dozave/ditë']),
      interval_hours:num(source['Intervali (orë)']),
      max_single_mg:num(source['Maks. për marrje (mg)']),
      max_daily_mg:num(source['Maks. 24h (mg)']),
      min_age_months:num(source['Mosha min (muaj)']),
      max_age_months:num(source['Mosha max (muaj)']),
      min_weight_kg:num(source['Pesha min (kg)']),
      max_weight_kg:num(source['Pesha max (kg)']),
      concentration_mg:concentration.min,
      concentration_ml:num(clean(source.Përqendrimi).match(/\/\s*(\d+(?:[.,]\d+)?)\s*mL/i)?.[1]),
      formula_text:clean(source['Formula e llogaritjes']) || null,
      signatura_template:clean(source['Signatura draft']) || null,
      signatura_text:clean(source['Signatura draft']) || null,
      source_url:sourceUrl(source['Burimi URL']),
      editorial_status:publish ? 'published' : verified ? 'verified' : 'draft',
      editorial_override:false,
    };
    record.source_hash = hash(record);
    return [record];
  });
}

async function fetchWorkbook() {
  const response = await fetch(SOURCE_URL, { cache:'no-store', redirect:'follow' });
  if (!response.ok) throw new Error(`Dozologjia: HTTP ${response.status}`);
  return XLSX.read(Buffer.from(await response.arrayBuffer()), { type:'buffer', cellDates:true });
}

async function existingRows() {
  const { data } = await neonRequest('dosage_regimens?select=source_key,source_hash,editorial_override&source_key=not.is.null&limit=5000');
  return new Map((Array.isArray(data) ? data : []).map(item => [item.source_key, item]));
}

async function sync() {
  if (!process.env.VERCEL || (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production')) return;
  try {
    const workbook = await fetchWorkbook();
    const incoming = [...adultRows(workbook), ...pediatricRows(workbook)];
    const existing = await existingRows();
    let written = 0;
    const failures = [];

    for (const record of incoming) {
      const current = existing.get(record.source_key);
      if (current?.editorial_override === true || current?.source_hash === record.source_hash) continue;
      try {
        await neonRequest('dosage_regimens?on_conflict=source_key', {
          method:'POST',
          body:[record],
          prefer:'resolution=merge-duplicates,return=minimal',
        });
        written += 1;
      } catch (error) {
        failures.push(`${record.source_key}: ${error.message}`);
      }
    }

    if (failures.length) {
      console.warn(`MedIndex structured dosage partial: ${written}/${incoming.length}; ${failures.slice(0, 8).join(' | ')}`);
    } else {
      console.log(`MedIndex structured dosage synchronized: ${incoming.length} rows; ${written} changed.`);
    }
  } catch (error) {
    console.warn(`MedIndex structured dosage sync limited: ${error.message}`);
  }
}

sync();
