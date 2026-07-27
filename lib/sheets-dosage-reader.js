'use strict';

const crypto = require('node:crypto');
const DosageEngine = require('../dosage-engine.js');
const Neon = require('../lib/neon-clinical-reader.js');
const Sheets = require('../lib/sheets-dosage-reader.js');

const MEMORY_CACHE_MS = 5 * 60 * 1000;
const cache = new Map();
const pending = new Map();

const envFlag = name => ['TRUE', '1', 'YES', 'PO'].includes(clean(process.env[name]).toUpperCase());

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}
function token(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}
function uniqueBy(items, keyForItem) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = clean(keyForItem(item));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}
function sourceUrls(rows) {
  return uniqueBy(rows.map(row => clean(row.source_url)).filter(url => /^https:\/\//i.test(url)), value => value);
}
function summaryText(rows, field, multipleLabel) {
  const values = uniqueBy(rows.map(row => clean(row[field])).filter(Boolean), value => value);
  if (values.length === 1) return values[0];
  if (values.length > 1) return `${values.length} skema të verifikuara — zgjidh indikacionin`;
  return multipleLabel || '';
}
function safeRoute(rows) {
  const values = uniqueBy(rows.map(row => clean(row.route)).filter(Boolean), value => value);
  return values.length === 1 ? values[0] : values.length > 1 ? 'Sipas skemës së zgjedhur' : '';
}

function buildCards(regimens, rawDrugs) {
  const drugById = new Map(rawDrugs.map(row => [row.id, row]));
  const groups = new Map();
  regimens.filter(row => clean(row.source_key).startsWith('card:') && row.drug_id).forEach(row => {
    if (!groups.has(row.drug_id)) groups.set(row.drug_id, []);
    groups.get(row.drug_id).push(row);
  });
  return [...groups.entries()].map(([drugId, rows]) => {
    const drug = drugById.get(drugId);
    if (!drug) return null;
    const adultRows = rows.filter(row => row.population === 'adult');
    const pediatricRows = rows.filter(row => row.population === 'pediatric');
    const pdid = clean(drug.pdid);
    const tradeName = clean(drug.trade_name);
    const strength = clean(drug.strength);
    return {
      cardKey:[pdid, tradeName, strength].join('|'),
      nr:clean(drug.registry_number),
      pdid,
      tradeName,
      substance:clean(drug.active_substance),
      atc:clean(drug.atc_code),
      form:clean(drug.pharmaceutical_form),
      strength,
      drugClass:clean(drug.drug_class),
      use:clean(drug.use_text),
      adultDose:summaryText(adultRows, 'dose_text'),
      adultRoute:safeRoute(adultRows),
      pediatricDose:summaryText(pediatricRows, 'dose_text'),
      pediatricRoute:safeRoute(pediatricRows),
      sourceUrls:sourceUrls(rows),
      auditedAt:clean(rows.find(row => row.reviewed_at)?.reviewed_at),
      auditNote:summaryText(rows, 'warnings'),
      status:'VERIFIKUAR',
    };
  }).filter(card => card?.adultDose && card?.adultRoute)
    .sort((a, b) => Number(a.nr || 999999) - Number(b.nr || 999999));
}

function buildForms(rows) {
  const grouped = new Map();
  rows.forEach(row => {
    const form = clean(row.pharmaceutical_form);
    if (!form) return;
    const key = token(form);
    if (!grouped.has(key)) grouped.set(key, { form, rows:[] });
    grouped.get(key).rows.push(row);
  });
  return [...grouped.entries()].map(([formKey, group]) => ({
    form:group.form,
    formKey,
    category:'',
    prefix:'',
    route:safeRoute(group.rows),
    routeSuggested:Boolean(safeRoute(group.rows) && !safeRoute(group.rows).startsWith('Sipas')),
    unit:'',
    safetyNote:'',
    version:'neon-v1',
    reviewedAt:'',
  })).sort((a, b) => a.form.localeCompare(b.form, 'sq'));
}

async function buildNeonPayload() {
  const startedAt = Date.now();
  const [dosageResult, drugResult] = await Promise.all([
    Neon.getPublishedDosageRegimens(),
    Neon.getPublishedDrugs(),
  ]);
  const rows = dosageResult.rows;
  const structuredAdult = rows.filter(row => clean(row.source_key).startsWith('adult:'));
  const structuredPediatric = rows.filter(row => clean(row.source_key).startsWith('pediatric:'));
  const eligibleAdult = uniqueBy(structuredAdult.map(row => Neon.mapAdultRegimen(row, DosageEngine)), item => item.regimenId);
  const eligiblePediatric = uniqueBy(structuredPediatric.map(row => Neon.mapPediatricRegimen(row, DosageEngine)), item => item.regimenId);
  const clinicalAutoFillEnabled = envFlag('ENABLE_DOSAGE_AUTOFILL');
  const adult = clinicalAutoFillEnabled ? eligibleAdult : [];
  const pediatric = clinicalAutoFillEnabled ? eligiblePediatric : [];
  const cards = buildCards(rows, drugResult.rawRows);
  if (!cards.length) throw new Error('Neon dosage nuk ktheu kartela të publikuara të lidhura me barnat.');
  const forms = buildForms([...structuredAdult, ...structuredPediatric]);

  return {
    schemaVersion:'neon-1.0.0',
    matchVersion:'exact-v1',
    datasetVersion:'neon-published',
    mode:'SAFE_VERIFIED_ONLY',
    generatedAt:new Date().toISOString(),
    forms,
    adult,
    pediatric,
    cards,
    meta:{
      sourceFileId:'',
      clinicalAutoFillEnabled,
      activationSource:clinicalAutoFillEnabled ? 'neon-published-verified' : 'read-only-default',
      autoApplyPolicy:'UNIQUE_EXACT_MATCH_AUTO_APPLY',
      publishedForms:forms.length,
      publishedAdultRegimens:adult.length,
      publishedPediatricRegimens:pediatric.length,
      publishedCards:cards.length,
      eligibleAdultRegimens:eligibleAdult.length,
      eligiblePediatricRegimens:eligiblePediatric.length,
      eligibleCards:cards.length,
      totalPublishedRegimens:rows.length,
      cardRegimens:rows.filter(row => clean(row.source_key).startsWith('card:')).length,
      structuredAdultRegimens:structuredAdult.length,
      structuredPediatricRegimens:structuredPediatric.length,
      excludedNonPublishedRegimens:null,
      duplicateForms:0,
      duplicateAdultRegimens:structuredAdult.length - eligibleAdult.length,
      duplicatePediatricRegimens:structuredPediatric.length - eligiblePediatric.length,
      duplicateCards:0,
      cardsReadOnlyWhenAutoFillDisabled:!clinicalAutoFillEnabled,
      buildMs:Date.now() - startedAt,
      neonQueryMs:Math.max(dosageResult.queryMs, drugResult.queryMs),
      geminiForDosage:false,
      dataSource:'sheets-fallback',
    },
  };
}

module.exports = {
  buildSheetsDosagePayload,
  clean,
  token,
};
